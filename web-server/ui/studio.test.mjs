import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const script = fs.readFileSync(new URL("./studio.js", import.meta.url), "utf8");
function setup(fetchImpl) {
  const ids = [
    "file-input",
    "dropzone",
    "decompile",
    "copy",
    "download",
    "message",
    "code-content",
    "code",
    "empty-state",
    "output-filename",
    "result-meta",
    "drop-title",
    "drop-sub",
    "drop-meta",
    "result-status",
    "encode-key",
  ];
  const elements = Object.fromEntries(
    ids.map((id) => [
      id,
      {
        id,
        textContent: "",
        innerHTML: "",
        hidden: false,
        disabled: false,
        value: "",
        files: [],
        firstElementChild: { textContent: "" },
        listeners: {},
        classList: { toggle() {}, add() {}, remove() {} },
        addEventListener(type, callback) {
          this.listeners[type] = callback;
        },
        click() {},
        fire(type, event = {}) {
          return this.listeners[type]?.({ preventDefault() {}, ...event });
        },
      },
    ]),
  );
  elements["encode-key"].value = "203";
  const document = {
    getElementById: (id) => elements[id],
    createElement: () => ({ click() {} }),
  };
  vm.runInNewContext(script, {
    document,
    fetch: fetchImpl,
    AbortController,
    navigator: { clipboard: { writeText: async () => {} } },
    URL,
    Blob,
    setTimeout,
  });
  return elements;
}
function choose(elements, file) {
  elements["file-input"].files = [file];
  elements["file-input"].fire("change");
}

test("sends selected bytes and key to the raw endpoint and renders text safely", async () => {
  const file = { name: "script.luac", size: 40 };
  const calls = [];
  const elements = setup(async (path, options) => {
    calls.push([path, options]);
    return { ok: true, text: async () => 'return "<script>"\n' };
  });
  choose(elements, file);
  assert.equal(elements.decompile.disabled, false);
  await elements.decompile.fire("click");
  assert.equal(calls[0][0], "/decompile/raw");
  assert.equal(calls[0][1].body, file);
  assert.equal(calls[0][1].headers["x-encode-key"], "203");
  assert.equal(elements["code-content"].textContent, 'return "<script>"\n');
  assert.equal(elements["output-filename"].textContent, "script.luau");
  assert.equal(elements.copy.disabled, false);
  assert.equal(elements["empty-state"].hidden, true);
});

test("rejects empty and oversized files and displays server failures", async () => {
  const elements = setup(async () => ({
    ok: false,
    status: 400,
    text: async () => "bytecode inválido",
  }));
  choose(elements, { name: "empty", size: 0 });
  assert.equal(elements.decompile.disabled, true);
  assert.match(elements.message.textContent, /vacío/);
  choose(elements, { name: "big", size: 16 * 1024 * 1024 + 1 });
  assert.equal(elements.decompile.disabled, true);
  assert.match(elements.message.textContent, /límite/);
  choose(elements, { name: "bad", size: 1 });
  elements["encode-key"].value = "1";
  await elements.decompile.fire("click");
  assert.match(elements.message.textContent, /bytecode inválido/);
  assert.equal(elements.copy.disabled, true);
  assert.equal(elements.decompile.disabled, false);
});

test("replacing a file prevents a stale response from overwriting the result", async () => {
  let resolve;
  const elements = setup(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  choose(elements, { name: "first.luac", size: 5 });
  const pending = elements.decompile.fire("click");
  choose(elements, { name: "second.luac", size: 10 });
  resolve({ ok: true, text: async () => "old output" });
  await pending;
  assert.equal(elements["code-content"].textContent, "");
  assert.equal(elements["drop-title"].textContent, "second.luac");
  assert.equal(elements.decompile.disabled, false);
});

test("changing bytecode format cancels in-flight work and allows retry", async () => {
  let resolve;
  const elements = setup(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  choose(elements, { name: "test.luac", size: 5 });
  const pending = elements.decompile.fire("click");
  elements["encode-key"].value = "1";
  elements["encode-key"].fire("change");
  resolve({ ok: true, text: async () => "outdated output" });
  await pending;
  assert.equal(elements["code-content"].textContent, "");
  assert.equal(elements.decompile.disabled, false);
  assert.match(elements.message.textContent, /formato/);
});
