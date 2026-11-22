import importlib.util
from pathlib import Path
import tempfile
import unittest

from stress_roundtrip import CASES, INPUTS, PROFILES, check_reference, decompile


class StressRoundtripTests(unittest.TestCase):
    def test_checked_in_cases_match_deterministic_generators(self):
        spec = importlib.util.spec_from_file_location('stress_generator', INPUTS/'generate_cases.py')
        generator = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(generator)
        self.assertEqual(set(CASES), set(generator.CASES))
        for case in CASES:
            text = (INPUTS/f'{case}.luau').read_text(encoding='utf-8')
            self.assertEqual(text, generator.CASES[case]())
            self.assertGreaterEqual(len(text.splitlines()), 150)
            self.assertEqual(text.count('local total = seed + 7'), 1)
        self.assertEqual(len(PROFILES), 4)

    def test_reference_refuses_hidden_errors_or_incomplete_inputs(self):
        lines = [f'{seed}|5|true|value' for seed in (-3, 0, 1, 7, 18)]
        good = {'exit': 0, 'stdout': '\n'.join(lines)+'\n', 'stderr': ''}
        self.assertTrue(check_reference(good))
        self.assertFalse(check_reference(dict(good, exit=1)))
        self.assertFalse(check_reference(dict(good, stderr='error')))
        self.assertFalse(check_reference(dict(good, stdout='\n'.join(lines[:-1]))))
        self.assertFalse(check_reference(dict(good, stdout=good['stdout'].replace('true', 'false', 1))))

    def test_native_invocation_uses_folder_protocol(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            script = root/'lifter'
            script.write_text("""#!/usr/bin/env python3
import base64, pathlib, sys
assert sys.argv[1] == 'decompile-folder'
assert sys.argv[4:] == ['--key', '1', '--threads', '1']
assert base64.b64decode((pathlib.Path(sys.argv[2])/'subject.lua').read_bytes()) == b'\\x09payload'
out = pathlib.Path(sys.argv[3]); out.mkdir()
(out/'subject.luau').write_text('return 42')
print('finished')
""")
            script.chmod(0o755)
            data = root/'input'; data.write_bytes(b'\x09payload')
            outcome = decompile(data, root/'out', root/'err', native=script, timeout=2)
            self.assertEqual(outcome['status'], 'output')
            self.assertEqual((root/'out').read_text(), 'return 42')
            self.assertIn('finished', (root/'err').read_text())

    def test_native_decompiler_failures_are_not_reported_as_outputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            script = root/'fail'
            script.write_text('#!/bin/sh\necho failed >&2\nexit 1\n')
            script.chmod(0o755)
            data = root/'input'; data.write_bytes(b'\x09')
            outcome = decompile(data, root/'out', root/'err', native=script, timeout=2)
            self.assertEqual(outcome['status'], 'refused_or_error')
            self.assertEqual(outcome['exit'], 1)


if __name__ == '__main__': unittest.main()
