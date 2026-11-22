import base64
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from benchmark_adapters import Expert, Luacid, digest
from competitive_compare import EXPECTED, browser_decompile, run, score_source


class Response(io.BytesIO):
    status = 200
    headers = {'Content-Type': 'text/plain'}


class CompetitiveTests(unittest.TestCase):
    def test_documented_api_requests_contain_identical_bytecode(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/'file'; raw = b'\x09\x00\xff'; path.write_bytes(raw)
            for adapter, url, content in [(Expert(), 'https://api.lua.expert/v1/decompile', 'application/json'),
                                          (Luacid(), 'https://api.luacid.dev/decompile', 'application/octet-stream')]:
                with patch.object(adapter.opener, 'open', return_value=Response(b'return 1')) as opened:
                    receipt, output = adapter.invoke(path, retry=False)
                request = opened.call_args.args[0]
                self.assertEqual(request.full_url, url)
                self.assertEqual(request.get_method(), 'POST')
                self.assertEqual(request.get_header('Content-type'), content)
                self.assertEqual(base64.b64decode(json.loads(request.data)['script'])
                                 if content == 'application/json' else request.data, raw)
                self.assertEqual(receipt['status'], 'output')
                self.assertEqual(output, b'return 1')

    def test_luacid_rate_limit_is_conservative(self):
        for rate in (-1, 0, 31, 500):
            with self.assertRaises(ValueError): Luacid(rate)

    def test_checked_in_bytecode_and_browser_output_are_reproducible(self):
        root = Path(__file__).resolve().parent.parent/'benchmarks/competitive'
        baseline = json.loads((root/'local_baseline.json').read_text())
        self.assertEqual(digest((root/'subject.luau').read_bytes()), baseline['source_sha256'])
        self.assertEqual(digest((root/'driver.luau').read_bytes()), baseline['driver_sha256'])
        self.assertEqual(digest((root/'subject.luaubc').read_bytes()), baseline['input_sha256'])
        self.assertEqual((root/'subject.luaubc').read_bytes()[0], 9)
        receipt, output = browser_decompile(root/'subject.luaubc')
        self.assertEqual(receipt['status'], 'output')
        self.assertEqual(output, (root/'tovek-browser.luau').read_bytes())
        self.assertEqual(digest(output), baseline['results'][0]['receipt']['output_sha256'])
        self.assertEqual(baseline['original_runtime']['stdout'], EXPECTED)
        self.assertTrue(baseline['results'][0]['runtime_pass'])

    def test_failures_are_not_counted_as_success(self):
        class Failed:
            def __init__(self, **kwargs): self.identity = {'kind': 'test'}
            def invoke(self, path, retry=True):
                self.raw = path.read_bytes()
                return {'status': 'transport_error', 'output_sha256': digest(b''), 'attempts': []}, b''
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); compiler = root/'compiler'; vm = root/'vm'
            compiler.write_bytes(b'compiler'); vm.write_bytes(b'vm')
            args = SimpleNamespace(compiler=compiler, vm=vm, out=root/'out', native=None, online=True)
            good = ({'status': 'output', 'output_sha256': digest(b'return f'), 'attempts': []}, b'return f')
            observed = {'exit': 0, 'stdout': EXPECTED, 'stderr': ''}
            with patch('competitive_compare.compile_source', return_value=b'\x09\x00'), \
                 patch('competitive_compare.observe', return_value=observed), \
                 patch('competitive_compare.browser_decompile', return_value=good), \
                 patch('competitive_compare.Expert', Failed), patch('competitive_compare.Luacid', Failed):
                self.assertEqual(run(args), 1)
            report = json.loads((root/'out/report.json').read_text())
            self.assertEqual([r['provider'] for r in report['results']], ['tovek-browser-wasm', 'luacid', 'lua-expert'])
            self.assertTrue(report['results'][0]['runtime_pass'])
            self.assertTrue(all(r['runtime_pass'] is None for r in report['results'][1:]))
            self.assertEqual(len({r['input_sha256'] for r in report['results']}), 1)
            with self.assertRaises(FileExistsError): run(args)

    def test_presentation_heuristic_is_separate(self):
        self.assertEqual(score_source(b'local p = v2 + v_u_1\n')['generated_name_occurrences_heuristic'], 3)


if __name__ == '__main__': unittest.main()
