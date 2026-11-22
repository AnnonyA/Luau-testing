#!/usr/bin/env python3
"""Round-trip large deterministic Luau cases against a bounded native or WASM engine."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
try:
    import resource
except ImportError:  # Windows has no resource module.
    resource = None
import subprocess
import sys
import tempfile
import time
from types import SimpleNamespace

from decompiler_benchmark import observe, same_runtime
from roadmap_v2 import ROOT, compile_source

CASES = ('assignment_order', 'closures', 'constructors', 'control', 'mixed', 'packs', 'proxy')
INPUTS = ROOT / 'benchmarks/stress'
PROFILES = [(9, 0, 0), (9, 2, 2), (12, 0, 0), (12, 2, 2)]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def limits():
    # Linux CI: cap native process memory and output size, not just wall time.
    resource.setrlimit(resource.RLIMIT_AS, (1536 * 1024 * 1024, 1536 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_FSIZE, (8 * 1024 * 1024, 8 * 1024 * 1024))


def decompile(input_path, output_path, stderr_path, *, native, timeout):
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith('MEDAL_')}
    env['RAYON_NUM_THREADS'] = '1'
    start = time.monotonic()
    try:
        with tempfile.TemporaryDirectory(prefix='tovek-stress-') as tmp:
            root = Path(tmp)
            if native:
                source, dest = root/'input', root/'output'
                source.mkdir()
                (source/'subject.lua').write_bytes(base64.b64encode(input_path.read_bytes()))
                command = [str(native), 'decompile-folder', str(source), str(dest), '--key', '1', '--threads', '1']
                result_path = dest/'subject.luau'
            else:
                command = ['node', str(ROOT/'scripts/decompile_browser_wasm.mjs'), str(input_path), 'stress.luau']
                result_path = output_path
            with output_path.open('wb') as stdout, stderr_path.open('wb') as stderr:
                result = subprocess.run(command, stdout=stdout, stderr=stderr, env=env, timeout=timeout,
                                        preexec_fn=limits if native and resource is not None and sys.platform.startswith('linux') else None)
            if native:
                log = output_path.read_bytes()
                with stderr_path.open('ab') as stderr: stderr.write(log)
                output_path.write_bytes(result_path.read_bytes() if result_path.exists() else b'')
            status = 'output' if result.returncode == 0 and output_path.stat().st_size else 'refused_or_error'
            return {'status': status, 'exit': result.returncode, 'seconds': round(time.monotonic()-start, 3)}
    except subprocess.TimeoutExpired:
        return {'status': 'timeout', 'exit': None, 'seconds': round(time.monotonic()-start, 3)}
    except OSError as error:
        return {'status': 'process_error', 'exit': None, 'error': str(error)}


def check_reference(result):
    if result['exit'] != 0 or result['stderr']:
        return False
    lines = result['stdout'].splitlines()
    return len(lines) == 5 and all(line.startswith(f'{seed}|5|true|')
                                  for line, seed in zip(lines, (-3, 0, 1, 7, 18)))


def run(args):
    compiler = args.compiler.resolve(strict=True)
    vm = args.vm.resolve(strict=True)
    native = args.native.resolve(strict=True) if args.native else None
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=False)
    rows, controls = [], []
    for case in CASES:
        source = INPUTS/f'{case}.luau'
        for version, opt, debug in PROFILES:
            profile = f'{case}-v{version}-O{opt}-g{debug}'
            folder = out/profile
            folder.mkdir()
            options = SimpleNamespace(compiler=compiler, bytecode_version=version, timeout=30)
            raw = compile_source(options, source, opt, debug)
            input_path = folder/'input.luaubc'; input_path.write_bytes(raw)
            driver = folder/'driver.luaubc'
            driver.write_bytes(compile_source(options, INPUTS/'driver.luau', 0, 1))
            reference = observe(vm, input_path, driver)
            if not check_reference(reference):
                raise RuntimeError(f'{profile}: original failed: {reference}')
            if (version, opt, debug) == PROFILES[0]:
                text = source.read_text(encoding='utf-8')
                if text.count('local total = seed + 7') != 1:
                    raise RuntimeError('missing mutation control anchor')
                mutant = folder/'mutation.luau'
                mutant.write_text(text.replace('local total = seed + 7', 'local total = seed + 8', 1), encoding='utf-8')
                mutant_bc = folder/'mutation.luaubc'; mutant_bc.write_bytes(compile_source(options, mutant, opt, debug))
                observed = observe(vm, mutant_bc, driver)
                detected = check_reference(observed) and not same_runtime(reference, observed)
                controls.append({'case': case, 'detected': detected})
                if not detected: raise RuntimeError(f'{case}: mutation control was not detected')
            output, stderr = folder/'output.luau', folder/'stderr.txt'
            result = decompile(input_path, output, stderr, native=native, timeout=args.timeout)
            row = {'case': case, 'profile': {'version': version, 'opt': opt, 'debug': debug},
                   'source_sha256': sha(source.read_bytes()), 'input_sha256': sha(raw),
                   'input_bytes': len(raw), 'decompile': result,
                   'output': str(output.relative_to(out)), 'compiled': False, 'runtime_pass': None}
            if stderr.exists(): row['error'] = stderr.read_bytes()[:4000].decode('utf-8', 'replace')
            if result['status'] == 'output':
                row['output_sha256'] = sha(output.read_bytes())
                try:
                    rebuilt = compile_source(options, output, opt, debug)
                    rebuilt_path = folder/'rebuilt.luaubc'; rebuilt_path.write_bytes(rebuilt)
                    row['compiled'] = True
                    observation = observe(vm, rebuilt_path, driver)
                    row['runtime_pass'] = same_runtime(reference, observation)
                    row['original_stdout_sha256'] = sha(reference['stdout'].encode())
                    row['rebuilt_stdout_sha256'] = sha(observation['stdout'].encode())
                    if not row['runtime_pass']:
                        (folder/'original.txt').write_text(reference['stdout'], encoding='utf-8')
                        (folder/'observed.txt').write_text(observation['stdout'], encoding='utf-8')
                        row['runtime_error'] = observation['stderr'][:4000]
                except (ValueError, OSError, RuntimeError, subprocess.SubprocessError) as error:
                    row['compile_error'] = str(error)[:4000]
            rows.append(row)
            status = 'pass' if row['runtime_pass'] else (result['status'] if result['status'] != 'output' else 'mismatch' if row['compiled'] else 'compile_failed')
            print(f'{profile}: {status}', flush=True)
    report = {'schema': 'tovek-large-stress-v1', 'engine': 'native-fork' if native else 'upstream-browser-wasm-bd8055d',
              'engine_sha256': sha(native.read_bytes()) if native else sha((ROOT/'docs/assets/v26/tovek/tovek.wasm').read_bytes()),
              'compiler_sha256': sha(compiler.read_bytes()), 'vm_sha256': sha(vm.read_bytes()),
              'compiler_revision_expected': 'c2ec0d4e5ca50796ba174a7565298f59aa572268',
              'compiler_revision_verified': False, 'cases': rows, 'mutation_controls': controls,
              'limitations': 'Five inputs per profile are not proof of equivalence. Compiler revision not verified by this runner.'}
    (out/'report.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    bad = [r for r in rows if r['runtime_pass'] is not True]
    print(f"RESULT engine={report['engine']} passed={len(rows)-len(bad)}/{len(rows)} failures={len(bad)} report={out/'report.json'}", flush=True)
    return 1 if bad else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--compiler', required=True, type=Path)
    parser.add_argument('--vm', required=True, type=Path)
    parser.add_argument('--native', type=Path, help='Current fork native CLI. Omit to test upstream browser WASM.')
    parser.add_argument('--out', required=True, type=Path, help='New output directory')
    parser.add_argument('--timeout', type=int, default=30)
    args = parser.parse_args()
    if not 1 <= args.timeout <= 120: parser.error('timeout must be between 1 and 120 seconds')
    try: return run(args)
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(f'Stress test failed: {error}', file=sys.stderr); return 2

if __name__ == '__main__': sys.exit(main())
