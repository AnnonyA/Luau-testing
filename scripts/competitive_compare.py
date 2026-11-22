#!/usr/bin/env python3
"""Compare the same public fixture across local Tovek and, explicitly, two APIs.

Only the fixed repository fixture is sent, and only with --online. Never use
this for private scripts. Results are observations, not a proof of equivalence.
"""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys
import time
from types import SimpleNamespace

from benchmark_adapters import Expert, Luacid, Native, digest
from decompiler_benchmark import observe, same_runtime
from roadmap_v2 import ROOT, compile_source

FIXTURE = ROOT / 'benchmarks/competitive'
EXPECTED = '-2:2|4|\n0:2|4|\n1:2|6|6\n3:3|12|nil|6,12\n5:3|22|nil|6,12,22\n10:3|22|nil|6,12,22\n'
PIN = 'c2ec0d4e5ca50796ba174a7565298f59aa572268'


def browser_decompile(path):
    started = time.perf_counter()
    try:
        proc = subprocess.run(['node', str(ROOT/'scripts/decompile_browser_wasm.mjs'), str(path),
                               'subject.luau'], capture_output=True, timeout=30)
        status = 'output' if proc.returncode == 0 and proc.stdout.strip() else 'process_error'
        return {'status': status, 'output_sha256': digest(proc.stdout),
                'attempts': [{'status': status, 'exit_code': proc.returncode,
                              'seconds': time.perf_counter()-started,
                              'error': proc.stderr.decode('utf-8', 'replace')[:4000]}]}, proc.stdout
    except (OSError, subprocess.TimeoutExpired) as error:
        return {'status': 'process_error', 'output_sha256': digest(b''),
                'attempts': [{'status': 'process_error', 'error': str(error)}]}, b''


def score_source(body):
    """Simple presentation indicators only; never correctness or a quality score."""
    text = body.decode('utf-8', 'replace')
    return {'bytes': len(body), 'lines': len(text.splitlines()),
            'generated_name_occurrences_heuristic': len(re.findall(r'\b(?:v(?:_u_)?\d*|p\d*|arg\d+|var\d+)\b', text))}


def run(args):
    compiler, vm = args.compiler.resolve(strict=True), args.vm.resolve(strict=True)
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=False)
    source, driver = FIXTURE/'subject.luau', FIXTURE/'driver.luau'
    options = SimpleNamespace(compiler=compiler, bytecode_version=9, timeout=30)
    raw = compile_source(options, source, 2, 1)
    driver_raw = compile_source(options, driver, 0, 1)
    input_path, driver_path = out/'subject.luaubc', out/'driver.luaubc'
    input_path.write_bytes(raw); driver_path.write_bytes(driver_raw)
    original = observe(vm, input_path, driver_path)
    if original['exit'] != 0 or original['stdout'] != EXPECTED or original['stderr']:
        raise RuntimeError(f'original fixture did not pass its locked runtime oracle: {original}')
    outputs = [('tovek-browser-wasm', browser_decompile(input_path),
                {'kind': 'local_webassembly', 'commit': 'bd8055d',
                 'timing': 'Node process including startup and WASM compilation'})]
    if args.native:
        native = Native(args.native)
        outputs.append(('tovek-native', native.invoke(input_path, retry=False), native.identity))
    if args.online:
        # Both endpoints receive identical raw bytecode, represented as required by
        # each API. One request each; no retries or parallel/rate-limit pressure.
        for label, adapter in [('luacid', Luacid(timeout=15)), ('lua-expert', Expert(timeout=15))]:
            outputs.append((label, adapter.invoke(input_path, retry=False), adapter.identity))
    results = []
    for label, (receipt, body), identity in outputs:
        row = {'provider': label, 'identity': identity, 'receipt': receipt, 'compile': False,
               'runtime_pass': None, 'input_sha256': digest(raw)}
        (out/f'{label}.luau').write_bytes(body)
        row['output_file'] = f'{label}.luau'
        if receipt['status'] == 'output':
            row['presentation'] = score_source(body)
            try:
                rebuilt = compile_source(options, out/f'{label}.luau', 2, 1)
                compiled = out/f'{label}.luaubc'; compiled.write_bytes(rebuilt)
                row['compile'] = True
                row['runtime'] = observe(vm, compiled, driver_path)
                row['runtime_pass'] = same_runtime(original, row['runtime'])
            except (ValueError, OSError, RuntimeError, subprocess.SubprocessError) as error:
                row['compile_error'] = str(error)[:4000]
        results.append(row)
    report = {
        'schema': 'tovek-competitive-fixture-v1',
        'created_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'source_sha256': digest(source.read_bytes()), 'driver_sha256': digest(driver.read_bytes()),
        'input_sha256': digest(raw), 'input_bytes': len(raw), 'bytecode_version': raw[0],
        'compiler_sha256': digest(compiler.read_bytes()), 'vm_sha256': digest(vm.read_bytes()),
        'expected_compiler_commit': PIN, 'compiler_commit_verified': False,
        'profile': {'optimization': 2, 'debug': 1, 'fflags': 'false', 'key': 1},
        'browser_engine_sha256': digest((ROOT/'docs/assets/v26/tovek/tovek.wasm').read_bytes()),
        'browser_engine_commit': 'bd8055d', 'original_runtime': original,
        'network': 'explicitly enabled for public fixture only' if args.online else 'not requested',
        'limitations': 'One fixture and finite inputs are not a representative ranking or proof of equivalence. '
                       'Hosted request times include network; local process times are not comparable.',
        'results': results,
    }
    (out/'report.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    for row in results:
        print(f"{row['provider']}: {row['receipt']['status']}, compiled={row['compile']}, runtime={row['runtime_pass']}")
    print(f'Report: {out / "report.json"}')
    return 0 if all(r['compile'] and r['runtime_pass'] for r in results) else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--compiler', required=True, type=Path, help='pinned luau-compile executable')
    parser.add_argument('--vm', required=True, type=Path, help='sandboxed scripts/benchmark_vm executable')
    parser.add_argument('--out', required=True, type=Path, help='new output directory; never overwritten')
    parser.add_argument('--native', type=Path, help='optional current-fork luau-lifter binary')
    parser.add_argument('--online', action='store_true', help='send the fixed public bytecode to both external APIs')
    args = parser.parse_args()
    try: return run(args)
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(f'Benchmark failed: {error}', file=sys.stderr)
        return 2

if __name__ == '__main__': sys.exit(main())
