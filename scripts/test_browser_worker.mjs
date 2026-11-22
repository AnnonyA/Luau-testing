import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { performance } from "node:perf_hooks";

// Exercise the actual upstream browser wrapper and worker together. The shim
// supplies a Worker and local fetch in Node; no decompiler behaviour is mocked.
test("the bundled wrapper and worker decompile the sample without a server", async () => {
  const workerSource = await readFile(
    new URL("../dist/site/engine/worker.js", import.meta.url),
    "utf8",
  );
  const sample = await readFile(
    new URL("../dist/site/engine/SpawnShield.luaubc", import.meta.url),
  );
  const requests = [];
  class WorkerShim {
    constructor() {
      this.self = {
        postMessage: (data) => queueMicrotask(() => this.onmessage?.({ data })),
      };
      const localFetch = async (url) => {
        requests.push(String(url));
        return new Response(await readFile(new URL(url)), {
          headers: { "Content-Type": "application/wasm" },
        });
      };
      vm.runInNewContext(workerSource, {
        self: this.self,
        fetch: localFetch,
        WebAssembly,
        TextDecoder,
        TextEncoder,
        Uint8Array,
        DataView,
        performance,
        Promise,
        console,
      });
    }
    postMessage(data) {
      queueMicrotask(() => this.self.onmessage({ data }));
    }
    terminate() {}
  }
  const oldWorker = globalThis.Worker;
  globalThis.Worker = WorkerShim;
  try {
    const engine = await import("../dist/site/engine/tovek.js");
    const info = await engine.load({ warm: false });
    assert.equal(info.version, "V2.7");
    const bad = await engine.decompile(new Uint8Array([99]), {
      name: "bad",
      timeout: 30000,
    });
    assert.ok(bad.error);
    const result = await engine.decompile(new Uint8Array(sample), {
      name: "SpawnShield.lua",
      timeout: 30000,
    });
    assert.match(result.source, /GetService\("Players"\)/);
    assert.equal(result.key, 1);
    assert.equal(requests.length, 1);
    assert.ok(requests[0].endsWith("/engine/tovek.wasm"));
    engine.cancel();
  } finally {
    globalThis.Worker = oldWorker;
  }
});
