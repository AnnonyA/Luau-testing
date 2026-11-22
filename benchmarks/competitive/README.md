# Competitive fixture

This fixture is original to this repository. `subject.luau` returns a function with loops, captures, side effects, and multiple returns including `nil`. `driver.luau` tests six inputs inside the isolated `benchmark-vm`. The committed `subject.luaubc` was compiled at `-O2 -g1 --fflags=false` (bytecode v9, plain Luau opcode key 1). `tovek-browser.luau` is the untouched output of the website's upstream V2.7 WASM (`bd8055d`). `local_baseline.json` records the local observation: recompilation and all six runtime cases passed. It does not contain competitor results.

## Reproduce

Build the official Luau compiler at the pinned revision, and the sandboxed benchmark VM:

```sh
git clone https://github.com/luau-lang/luau.git /tmp/luau
git -C /tmp/luau checkout c2ec0d4e5ca50796ba174a7565298f59aa572268
cmake -S /tmp/luau -B /tmp/luau-build -DCMAKE_BUILD_TYPE=Release
cmake --build /tmp/luau-build --target Luau.Compile.CLI --parallel 2
cmake -S scripts/benchmark_vm -B /tmp/tovek-benchmark-vm -DLUAU_SOURCE_DIR=/tmp/luau -DCMAKE_BUILD_TYPE=Release
cmake --build /tmp/tovek-benchmark-vm --parallel 2
python3 scripts/competitive_compare.py --compiler /tmp/luau-build/luau-compile --vm /tmp/tovek-benchmark-vm/benchmark-vm --out out/competitive
```

Add `--online` to send the **fixed public fixture bytecode** to both hosted APIs. This makes one request to each provider with no retries, and records HTTP/transport failures instead of treating them as successful decompilations. Optionally add `--native target/release/luau-lifter` to compare a native build of this fork. Each run requires a new output directory and stores unchanged responses, input hashes, recompiled bytecode, and runtime evidence. The runner records binary hashes but does not verify the compiler's source commit; confirm the checkout independently.

`--online` sends bytecode to third parties. Do not use private scripts. Hosted API latency includes the network and is not comparable to local process time. Matching six test cases is not proof of equivalence and this one fixture cannot establish a ranking.
