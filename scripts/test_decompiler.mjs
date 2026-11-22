import { test } from "node:test";
import assert from "node:assert/strict";
import { initializeDecompiler } from "../site/decompiler.mjs";
function setup(engine) {
  const ids = [
    "bytecode-file",
    "file-drop",
    "run-decompiler",
    "try-sample",
    "copy-output",
    "save-output",
    "browser-status",
    "bytecode-key",
    "result-code",
    "result-name",
    "result-details",
    "result-empty",
    "result-pre",
    "file-title",
    "file-subtitle",
    "file-meta",
    "engine-status",
  ];
  const elements = Object.fromEntries(
    ids.map((id) => [
      id,
      {
        id,
        textContent: "",
        hidden: false,
        disabled: false,
        value: "",
        files: [],
        firstElementChild: { textContent: "" },
        listeners: {},
        classList: { toggle() {}, add() {}, remove() {} },
        addEventListener(type, fn) {
          this.listeners[type] = fn;
        },
        click() {},
        fire(type, e = {}) {
          return this.listeners[type]?.({ preventDefault() {}, ...e });
        },
      },
    ]),
  );
  elements["bytecode-key"].value = "auto";
  initializeDecompiler({
    document: { getElementById: (id) => elements[id] },
    loadEngine: async () => engine,
    fetchSample: async () => new Uint8Array([1]),
    makeFile: (bytes) => ({ name: "sample.luaubc", size: bytes.length }),
  });
  return elements;
}
function choose(e, file) {
  e["bytecode-file"].files = [file];
  e["bytecode-file"].fire("change");
}
test("decompiles selected file locally and renders result as text", async () => {
  let received;
  const e = setup({
    load: async () => {},
    decompile: async (file, options) => {
      received = [file, options];
      return { source: 'return "<script>"' };
    },
    cancel() {},
  });
  const file = { name: "test.luac", size: 20 };
  choose(e, file);
  await e["run-decompiler"].fire("click");
  assert.equal(received[0], file);
  assert.equal(received[1].key, "auto");
  assert.equal(received[1].timeout, 60000);
  assert.equal(e["result-code"].textContent, 'return "<script>"');
  assert.equal(e["result-name"].textContent, "test.luau");
  assert.equal(e["copy-output"].disabled, false);
});
test("rejects oversized files and surfaces worker failures", async () => {
  const e = setup({
    load: async () => {},
    decompile: async () => ({ error: "bad bytecode", stage: "input" }),
    cancel() {},
  });
  choose(e, { name: "big", size: 16 * 1024 * 1024 + 1 });
  assert.equal(e["run-decompiler"].disabled, true);
  assert.match(e["browser-status"].textContent, /16 MiB/);
  choose(e, { name: "bad", size: 1 });
  await e["run-decompiler"].fire("click");
  assert.match(e["browser-status"].textContent, /bad bytecode/);
  assert.equal(e["save-output"].disabled, true);
});
test("changing files cancels an active job and ignores stale results", async () => {
  let resolve,
    cancelled = 0;
  const e = setup({
    load: async () => {},
    decompile: () =>
      new Promise((r) => {
        resolve = r;
      }),
    cancel() {
      cancelled++;
    },
  });
  choose(e, { name: "first", size: 1 });
  const task = e["run-decompiler"].fire("click");
  while (!resolve) await new Promise((r) => setImmediate(r));
  choose(e, { name: "second", size: 1 });
  resolve({ source: "stale" });
  await task;
  assert.equal(cancelled, 1);
  assert.equal(e["result-code"].textContent, "");
  assert.equal(e["file-title"].textContent, "second");
});
test("sample uses the same browser engine", async () => {
  let name;
  const e = setup({
    load: async () => {},
    decompile: async (file) => {
      name = file.name;
      return { source: "return 7" };
    },
    cancel() {},
  });
  await e["try-sample"].fire("click");
  assert.equal(name, "sample.luaubc");
  assert.equal(e["result-code"].textContent, "return 7");
});
