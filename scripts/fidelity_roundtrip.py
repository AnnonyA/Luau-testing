#!/usr/bin/env python3
"""Measure source similarity separately from runtime correctness on fixed fixtures."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

from decompiler_benchmark import observe, same_runtime
from output_quality import analyze_tree
from roadmap_v2 import ROOT, compile_source
from source_fidelity import compare_ast, parse_ast
from stress_roundtrip import check_reference, decompile, sha

INPUTS = ROOT / 'benchmarks/fidelity'
CASES = ('closures', 'effects', 'inventory', 'records', 'tuples')
# O0/g0 vs O0/g2 isolates debug-information changes; optimizations are separate.
PROFILES = ((0, 0), (0, 2), (1, 2), (2, 2))


def run(args):
    compiler = args.compiler.resolve(strict=True)
    vm = args.vm.resolve(strict=True)
    ast = args.ast.resolve(strict=True)
    native = args.native.resolve(strict=True) if args.native else None
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=False)
    options = SimpleNamespace(compiler=compiler, bytecode_version=9, timeout=30)
    driver = out/'driver.luaubc'
    driver.write_bytes(compile_source(options, ROOT/'benchmarks/stress/driver.luau', 0, 1))
    rows = []
    for case in CASES:
        source = INPUTS/f'{case}.luau'
        source_ast = parse_ast(ast, source, timeout=30)
        text = source.read_text(encoding='utf-8')
        source_quality = analyze_tree(source_ast, text)
        reference_first = None
        for opt, debug in PROFILES:
            name = f'{case}-O{opt}-g{debug}'
            folder = out/name
            folder.mkdir()
            raw = compile_source(options, source, opt, debug)
            bytecode = folder/'input.luaubc'; bytecode.write_bytes(raw)
            reference = observe(vm, bytecode, driver)
            if not check_reference(reference):
                raise RuntimeError(f'{name}: original failed: {reference}')
            if reference_first is not None and not same_runtime(reference_first, reference):
                raise RuntimeError(f'{name}: original differs between profiles')
            reference_first = reference
            output, stderr = folder/'output.luau', folder/'stderr.txt'
            outcome = decompile(bytecode, output, stderr, native=native, timeout=args.timeout,
                                native_args=('--synthesize-fixed-loops',) if args.synthesize_fixed_loops else ())
            row = {'case': case, 'profile': {'version': 9, 'opt': opt, 'debug': debug},
                   'source_sha256': sha(source.read_bytes()), 'input_sha256': sha(raw),
                   'original_stdout_sha256': sha(reference['stdout'].encode()),
                   'decompile': outcome, 'compiled': False, 'runtime_pass': None,
                   'source_quality': source_quality, 'fidelity': {'status': 'unavailable'},
                   'output': str(output.relative_to(out))}
            if stderr.exists(): row['diagnostic'] = stderr.read_bytes()[:4000].decode('utf-8', 'replace')
            if outcome['status'] == 'output':
                row['output_sha256'] = sha(output.read_bytes())
                try:
                    rebuilt = compile_source(options, output, opt, debug)
                    rebuilt_path = folder/'rebuilt.luaubc'; rebuilt_path.write_bytes(rebuilt)
                    row['compiled'] = True
                    observation = observe(vm, rebuilt_path, driver)
                    row['runtime_pass'] = same_runtime(reference, observation)
                    if not row['runtime_pass']:
                        (folder/'original.txt').write_text(reference['stdout'], encoding='utf-8')
                        (folder/'observed.txt').write_text(observation['stdout'], encoding='utf-8')
                        row['runtime_error'] = observation['stderr']
                    output_ast = parse_ast(ast, output, timeout=30)
                    row['output_quality'] = analyze_tree(output_ast, output.read_text(encoding='utf-8'))
                    row['fidelity'] = compare_ast(source_ast, output_ast)
                except (ValueError, OSError, RuntimeError, subprocess.SubprocessError) as error:
                    row['analysis_error'] = str(error)[:4000]
            rows.append(row)
            f = row['fidelity']
            print(f'{name}: runtime={row["runtime_pass"]} fidelity={f["status"]} '
                  f'structure={f.get("style_normalized_ratio")} '
                  f'names={f.get("exact_names")}/{f.get("source_bindings")} '
                  f'aligned={f.get("aligned_bindings")}', flush=True)
    report = {'schema': 'tovek-source-fidelity-v1',
              'engine': 'native-fork' if native else 'upstream-browser-wasm-bd8055d',
              'engine_sha256': sha(native.read_bytes()) if native else sha((ROOT/'docs/assets/v26/tovek/tovek.wasm').read_bytes()),
              'compiler_sha256': sha(compiler.read_bytes()), 'vm_sha256': sha(vm.read_bytes()),
              'native_args': ['--synthesize-fixed-loops'] if args.synthesize_fixed_loops else [],
              'parser_sha256': sha(ast.read_bytes()), 'parser_revision_expected': 'c2ec0d4e5ca50796ba174a7565298f59aa572268',
              'parser_revision_verified': False, 'cases': rows,
              'limitations': 'AST similarity is a heuristic, not semantic equivalence or proof of source recovery. '
                             'Exact-name recovery counts only fully aligned bindings; unknown comparisons stay unknown. '
                             'Comments and some source choices are not recoverable from bytecode.'}
    (out/'report.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    bad = sum(row['runtime_pass'] is not True or row['fidelity']['status'] != 'measured' for row in rows)
    print(f'RESULT {len(rows)-bad}/{len(rows)} runtime passed and fidelity measured: {out / "report.json"}', flush=True)
    return 1 if bad else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--compiler', required=True, type=Path)
    parser.add_argument('--vm', required=True, type=Path)
    parser.add_argument('--ast', required=True, type=Path, help='Pinned official luau-ast CLI')
    parser.add_argument('--native', type=Path, help='Current fork native lifter; omit for upstream browser WASM')
    parser.add_argument('--out', required=True, type=Path, help='New output directory')
    parser.add_argument('--timeout', type=int, default=30)
    parser.add_argument('--synthesize-fixed-loops', action='store_true', help='Opt into experimental inferred loops in native output.')
    args = parser.parse_args()
    if not 1 <= args.timeout <= 120: parser.error('timeout must be 1..120')
    if args.synthesize_fixed_loops and not args.native: parser.error('experimental option requires --native')
    try:
        return run(args)
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(f'Fidelity run failed: {error}', file=sys.stderr)
        return 2

if __name__ == '__main__': sys.exit(main())
