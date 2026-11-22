# Luau-testing

Testing / improvement fork. The main content is a clone of
[Tovek](https://github.com/Kiet1308/Tovek) — a high-readability,
high-performance Luau decompiler (Rust workspace) — vendored under
[`Tovek/`](Tovek/) so it can be improved here.

## Layout

- `Tovek/` — the Tovek clone (upstream: `Kiet1308/Tovek`, imported at
  `ce2ea3325547fa3896f274b68013386338039040`, 2026-11-15). See
  [`Tovek/README.md`](Tovek/README.md) for the full upstream docs.
  - `Tovek/luau-lifter/` — the `luau-lifter` CLI (single-file + `decompile-folder`)
  - `Tovek/web-server/` — local HTTP server (`POST /decompile`, `/decompile/raw`, `/decompile/batch`)
  - `Tovek/ast/`, `Tovek/cfg/`, `Tovek/restructure/` — decompiler core crates
  - `Tovek/decompile.client.luau`, `Tovek/decompile-batch.client.luau` — executor-side clients
  - `Tovek/scripts/` — Python audit / round-trip / fuzz tooling + `test_*.py` unit tests

> Note: `Tovek/.gitignore` is upstream's (it ignores `*.md` / `*.json`
> scratch). The initial import was force-added (`git add -f Tovek`) so the
> tracked set matches upstream; new docs/fixtures may need `-f` too.

## Build & test (Tovek)

Requires the pinned nightly toolchain (`Tovek/rust-toolchain.toml`:
`nightly-2026-06-15`) and Python 3.11+ for the scripts.

```sh
cd Tovek
cargo +nightly-2026-06-15 test --workspace --all-targets
cargo +nightly-2026-06-15 build --release -p luau-lifter
python3 -m unittest discover -s scripts -p 'test_*.py'
```

## Improvements in this fork

On top of the upstream import:

- **Python 3.11 compat:** fixed an f-string backslash in
  `scripts/test_fuzz_roundtrip.py` that was a `SyntaxError` before 3.12;
  `python3 -m unittest discover` now passes on 3.11 (358 tests).
- **CI:** pinned Python 3.12 explicitly in the `fixtures` job
  (`actions/setup-python`, matching `release.yaml`) instead of relying on
  the runner image default.
- **Executor clients:** `decompile.client.luau` and
  `decompile-batch.client.luau` now `pcall` the HTTP request and
  `getscriptbytecode`, handle nil/empty responses, allow overriding the
  server URL via `getgenv().TOVEK_SERVER_URL`, and warn instead of erroring
  when SynSaveInstance fails to load.
- **CLI:** added `--jobs` as a visible alias for `--threads` in
  `decompile-folder` / `validate-folder` (issue #10 suggestion), with help
  text about memory on constrained machines.
- **Docs:** new "Large dumps: threads and memory" section in
  `Tovek/README.md` (issue #10) — how `--jobs` trades wall time for peak
  memory and how to isolate a runaway file.
- **Typo:** `recieved` → `received` in `web-server` error message.

Open upstream issues tracked for follow-up: #10 (unbounded memory on one
ModuleScript) and #11 (11/5,979 scripts fail: residual goto/label,
open-call tuple-order proof, open SETLIST in PlayerModule). Both need the
private game bytecode repros and a Rust toolchain to fix properly.
