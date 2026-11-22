# Large semantic stress corpus

Seven original deterministic fixtures, 163–1,060 lines each, stress observable
assignment ordering, escaping captured state, open-tail constructors, nested
control flow, nil-bearing multi-return values, table metamethod effects, NaN, error handling and loop captures.
The repetitive blocks intentionally pressure the decompiler with large inputs;
they are not representative of every real project. `generate_cases.py`
regenerates the checked-in sources byte-for-byte.

Each fixture returns a function. The sandbox runs it with five seeds, checks
return arity including nil and compares the complete event trace. A deliberate
`total` mutation per fixture must change the observation; this validates that
the oracle can detect at least that difference. Test four compiler profiles:
bytecode 9 and 12, each with O0/g0 and O2/g2, using `--fflags=false`. A passing
finite sample is not proof of equivalence. The VM has no filesystem or network
and has runtime and memory limits; native decompilation also has limits.

Build the compiler and VM using the pinned Luau revision documented in
`scripts/benchmark_vm/CMakeLists.txt`, then run:

```sh
python3 scripts/stress_roundtrip.py --compiler /path/to/luau-compile \
  --vm /path/to/benchmark-vm --native /path/to/luau-lifter --out out/stress-native
```

Without `--native` it runs the checked-in browser WASM instead. The native
runner uses the actual `decompile-folder` protocol with key 1. `report.json`
and per-profile outputs live in the new output directory; mismatches preserve
original and observed traces. Exit 1 means a profile did not pass, 2 means the
harness itself failed. CI builds the branch's native CLI and uploads the report.

`browser_baseline.json` records a local 28/28 run of the upstream browser WASM
commit `bd8055d`, **not** the current native branch. All seven mutation controls
were detected. Output often preserves generic names and expands compact source
assignments into temporaries; this is a readability observation, not a runtime
failure. The reports hash tools, sources and bytecode, but the runner does not
itself verify the compiler commit. No external code is transmitted.

The native CLI built from commit `969e931` also passed 28/28 profiles and all
seven mutation controls in [GitHub Actions run 45076486459](https://github.com/AnnonyA/Luau-testing/actions/runs/45076486459).
The output and detailed report are attached to that run as an artifact.
Native limits use Linux resource limits; on other platforms the wall timeout
still applies, but those OS-level limits do not.
