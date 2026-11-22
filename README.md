# Tovek Studio

An open-source Luau bytecode decompiler based on [Tovek](https://github.com/Kiet1308/Tovek), with a local web interface, CLI, and HTTP API.

## Get started

Install Rust with `rustup`; the toolchain is pinned in `rust-toolchain.toml`.

```sh
cargo run --release -p web-server
```

Open **http://127.0.0.1:3000**, select a Luau bytecode file (up to 16 MiB), choose its origin, and decompile. Copy or download the result. Files are sent to the server serving the interface; when it runs on your computer, files stay there.

For the CLI:

```sh
cargo run --release -p luau-lifter -- --help
```

The server also provides `POST /decompile/raw` (binary bytecode), `POST /decompile` (base64), and `POST /decompile/batch`. Luau clients are in the repository root.

## Tests

```sh
cargo test --workspace --all-targets
python3 -m unittest discover -s scripts -p 'test_*.py'
node --test web-server/ui/studio.test.mjs
node --test scripts/test_site.mjs
```

To work on the interface alone, run `node web-server/ui/dev-server.mjs`. The preview listens on port 4173 and proxies requests to the local Rust server on port 3000. Decompilation still requires the Rust server.

## Project site

GitHub Pages hosts the static project site, not the decompiler server. In repository **Settings → Pages**, set the source to **GitHub Actions**. Once this workflow is merged into `main`, changes to `site/` deploy automatically. If Pages is enabled after the merge, run **Deploy project site** manually from the Actions tab.

## Roadmap

- [x] Single-file web interface with copy and download.
- [ ] Reproducible quality and performance comparisons.
- [ ] Per-file time and memory limits.
- [ ] Reduce control-flow, open-call, and `SETLIST` refusals.
- [ ] Recover more names and types with reliable evidence.
- [ ] Batch processing in the interface.

Decompilation cannot guarantee recovery of the original source. Unsupported cases are rejected rather than emitting invalid Luau.

## Credits and license

A fork of [Kiet1308/Tovek](https://github.com/Kiet1308/Tovek), derived from medal. See [LICENSE.txt](LICENSE.txt).
