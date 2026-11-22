// Decompile raw Luau bytecode with the exact prebuilt WASM used by our website.
import { readFile } from 'node:fs/promises';
const [input, scriptName = ''] = process.argv.slice(2);
if (!input) { console.error('Usage: node scripts/decompile_browser_wasm.mjs input.luaubc [script-name]'); process.exit(2); }
try {
  const wasm = await readFile(new URL('../docs/assets/v26/tovek/tovek.wasm', import.meta.url));
  const bytes = await readFile(input), name = Buffer.from(scriptName);
  if (!bytes.length || bytes.length > 16 * 1024 * 1024) throw new Error('input must be 1..16 MiB');
  const { instance: { exports: e } } = await WebAssembly.instantiate(wasm, {});
  const inputPtr = e.tovek_alloc(bytes.length), namePtr = e.tovek_alloc(name.length);
  new Uint8Array(e.memory.buffer, inputPtr, bytes.length).set(bytes);
  new Uint8Array(e.memory.buffer, namePtr, name.length).set(name);
  // form=raw (1), key=plain (1), default flags, CLI control-flow policy.
  const ptr = e.tovek_decompile(inputPtr, bytes.length, 1, 1, 0, 0, namePtr, name.length);
  const view = new DataView(e.memory.buffer, ptr, 16);
  const status = view.getUint32(0, true), len = view.getUint32(12, true);
  const body = Buffer.from(new Uint8Array(e.memory.buffer, ptr + 16, len));
  e.tovek_free(ptr, 16 + len); e.tovek_free(inputPtr, bytes.length); e.tovek_free(namePtr, name.length);
  if (status !== 0) { process.stderr.write(body); process.exitCode = 1; }
  else process.stdout.write(body);
} catch (error) { console.error(error.message || error); process.exitCode = 1; }
