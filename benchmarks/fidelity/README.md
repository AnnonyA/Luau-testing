# Source fidelity fixtures

Five small hand-authored fixtures measure resemblance to known originals as
well as behavior. `fidelity_roundtrip.py` compiles bytecode v9 with O0/g0,
O0/g2, O1/g2 and O2/g2, decompiles, recompiles, runs 11 inputs in the sandbox,
and compares both source ASTs using the pinned official `luau-ast` parser.
The O0 debug pair isolates debug-info effects; optimization levels are reported
separately. All comparisons, including unknown results, remain in the report.

```sh
python3 scripts/fidelity_roundtrip.py --compiler /path/to/luau-compile \
  --vm /path/to/benchmark-vm --ast /path/to/luau-ast \
  --native target/fastrel/luau-lifter --out out/fidelity-native
# Repeat with --synthesize-fixed-loops and another output directory to compare.
```

The structural ratio is a heuristic over AST tokens, with documented style
normalization; it ignores binding spelling. A ratio of 1 is not exact source
recovery. Name counts only include *fully aligned* bindings; they are a lower
bound, not a count of all recovered names. Comments, original formatting,
original constructs eliminated by optimization, and stripped local names
cannot always be recovered from bytecode. Multiple sources may compile to the
same bytecode. Runtime checks use finite inputs and are not a proof of equivalence.
The compiler and parser revision is pinned by CI, but the standalone runner
only hashes the binaries and does not verify their revisions.

The `--synthesize-fixed-loops` native CLI option is experimental and off by
default. It also enables existing arithmetic-loop synthesis (the old flag is
still accepted). For the restricted call pattern `receiver:method((value + n)
% constant)` with consecutive `n=1..4` to `1..8`, it can synthesize a numeric
loop, retaining call/lookup ordering. The emitted comment explicitly says the
original loop is unknown: identical input may come from manual unrolling.

In [native CI run 45079304528](https://github.com/AnnonyA/Luau-testing/actions/runs/45079304528),
the `records` O2/g2 fixture's normalized structural ratio improved from
0.855814 to 1.0 with the option, while all 11 behavioral observations matched.
The deliberately unrolled `effects` fixture demonstrates why this is inference
rather than original-source recovery: it tests `__index` and a changing
captured operand across calls. All 20 profile comparisons passed in both modes.
The broader [native stress run 45079304458](https://github.com/AnnonyA/Luau-testing/actions/runs/45079304458)
passed 258/258 profiles in each mode with all 43 mutation controls detected.
