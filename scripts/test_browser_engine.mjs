import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const base = new URL("../docs/assets/v26/tovek/", import.meta.url);
const bytes = await readFile(new URL("tovek.wasm", base));
const metadata = JSON.parse(
  await readFile(new URL("build.json", base), "utf8"),
);
const sample = await readFile(new URL("samples/SpawnShield.luaubc", base));
const samples = JSON.parse(
  await readFile(new URL("samples/index.json", base), "utf8"),
);
const hash = (data) => createHash("sha256").update(data).digest("hex");

test("checked-in WASM matches its provenance and decompiles the real sample", async () => {
  assert.equal(hash(bytes), metadata.sha256);
  const {
    instance: { exports: e },
  } = await WebAssembly.instantiate(bytes, {});
  function run(input, name) {
    const nameBytes = Buffer.from(name),
      ptr = e.tovek_alloc(input.length),
      np = e.tovek_alloc(nameBytes.length);
    new Uint8Array(e.memory.buffer, ptr, input.length).set(input);
    new Uint8Array(e.memory.buffer, np, nameBytes.length).set(nameBytes);
    const result = e.tovek_decompile(
      ptr,
      input.length,
      0,
      0,
      0,
      0,
      np,
      nameBytes.length,
    );
    const view = new DataView(e.memory.buffer, result, 16);
    const status = view.getUint32(0, true),
      length = view.getUint32(12, true);
    const text = Buffer.from(
      new Uint8Array(e.memory.buffer, result + 16, length),
    );
    e.tovek_free(result, 16 + length);
    e.tovek_free(ptr, input.length);
    e.tovek_free(np, nameBytes.length);
    return { status, text };
  }
  assert.notEqual(run(Buffer.from([99]), "invalid").status, 0);
  const output = run(sample, "SpawnShield.lua");
  assert.equal(output.status, 0);
  assert.equal(
    hash(output.text),
    samples.samples.find((row) => row.id === "SpawnShield").native.sha256,
  );
  assert.match(output.text.toString(), /GetService\("Players"\)/);
});

test("site build includes the unchanged engine and sample", async () => {
  assert.equal(
    hash(
      await readFile(
        new URL("../dist/site/engine/tovek.wasm", import.meta.url),
      ),
    ),
    metadata.sha256,
  );
  assert.deepEqual(
    await readFile(
      new URL("../dist/site/engine/SpawnShield.luaubc", import.meta.url),
    ),
    sample,
  );
});
