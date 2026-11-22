import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(
  new URL("../site/index.html", import.meta.url),
  "utf8",
);
const js = fs.readFileSync(new URL("../site/site.js", import.meta.url), "utf8");

test("site uses relative assets, valid section links, and explains browser engine", () => {
  for (const asset of [
    "style.css",
    "site.js",
    "decompiler.mjs",
    "favicon.svg",
  ]) {
    assert.ok(html.includes(`./${asset}`));
    assert.ok(fs.existsSync(new URL(`../site/${asset}`, import.meta.url)));
  }
  for (const [, anchor] of html.matchAll(/href="#([\w-]+)"/g)) {
    assert.ok(html.includes(`id="${anchor}"`), `Missing anchor ${anchor}`);
  }
  assert.match(html, /file stays in your browser/i);
  assert.match(html, /upstream commit\s+bd8055d/i);
  assert.match(html, /id="decompiler"/);
  assert.match(html, /cargo run --release -p web-server/);
});

test("copy controls show success and permission errors accessibly", async () => {
  let listener, copied;
  const toast = { textContent: "", hidden: true };
  const button = {
    dataset: { copy: "cargo run" },
    addEventListener: (_, fn) => {
      listener = fn;
    },
  };
  const clipboard = {
    writeText: async (text) => {
      copied = text;
    },
  };
  vm.runInNewContext(js, {
    document: { getElementById: () => toast, querySelectorAll: () => [button] },
    navigator: { clipboard },
    clearTimeout() {},
    setTimeout() {
      return 1;
    },
  });
  await listener();
  assert.equal(copied, "cargo run");
  assert.equal(toast.hidden, false);
  assert.match(toast.textContent, /copied/i);
  clipboard.writeText = async () => {
    throw new Error("denied");
  };
  await listener();
  assert.match(toast.textContent, /could not copy/i);
});
