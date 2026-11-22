// The UI uses the upstream worker-backed WebAssembly build, never a remote API.
export function initializeDecompiler({
  document,
  loadEngine,
  fetchSample,
  makeFile,
}) {
  const $ = (id) => document.getElementById(id);
  const input = $("bytecode-file"),
    drop = $("file-drop"),
    run = $("run-decompiler");
  const sample = $("try-sample"),
    copy = $("copy-output"),
    save = $("save-output");
  const status = $("browser-status"),
    key = $("bytecode-key");
  const maxBytes = 16 * 1024 * 1024;
  let file = null,
    output = null,
    serial = 0,
    engine = null,
    engineReady = false,
    busy = false;

  function notice(text, success = false) {
    status.textContent = text;
    status.classList.toggle("success", success);
    status.hidden = !text;
  }
  function clearOutput() {
    output = null;
    $("result-code").textContent = "";
    $("result-name").textContent = "result.luau";
    $("result-details").textContent = "UTF-8 / LUAU";
    $("result-empty").hidden = false;
    $("result-pre").hidden = true;
    copy.disabled = save.disabled = true;
  }
  function cancelCurrent() {
    serial++;
    if (busy && engineReady && engine) {
      engine.cancel();
      engineReady = false;
    }
    busy = false;
    sample.disabled = false;
    run.firstElementChild.textContent = "Decompile file";
  }
  function selectFile(candidate) {
    cancelCurrent();
    clearOutput();
    file = null;
    run.disabled = true;
    $("file-title").textContent = "Drop your file here";
    $("file-subtitle").textContent = "or choose a file from your device";
    $("file-meta").textContent = "BYTECODE / BASE64 · MAX 16 MiB";
    $("engine-status").textContent = "WAITING FOR A FILE";
    if (!candidate || !candidate.size || candidate.size > maxBytes) {
      if (candidate)
        notice(
          candidate.size
            ? "This file exceeds the 16 MiB limit."
            : "This file is empty. Choose a bytecode file.",
        );
      return;
    }
    file = candidate;
    notice("");
    $("file-title").textContent = candidate.name;
    $("file-subtitle").textContent = "File selected · click to change";
    $("file-meta").textContent =
      `${(candidate.size / 1024).toFixed(1)} KiB · READY`;
    $("engine-status").textContent = "FILE SELECTED";
    run.disabled = false;
  }
  async function decompile() {
    if (!file || busy) return;
    const current = file,
      token = ++serial;
    busy = true;
    run.disabled = sample.disabled = true;
    run.firstElementChild.textContent = "Decompiling…";
    clearOutput();
    notice("");
    $("engine-status").textContent = "LOADING ENGINE";
    try {
      engine = await loadEngine();
      if (token !== serial) return;
      // The upstream worker's job timeout starts after loading; bound loading too.
      let timer;
      try {
        await Promise.race([
          engine.load(),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("Engine loading timed out.")),
              60000,
            );
          }),
        ]);
      } catch (error) {
        if (token === serial) engine.cancel();
        throw error;
      } finally {
        clearTimeout(timer);
      }
      if (token !== serial) return;
      engineReady = true;
      $("engine-status").textContent = "DECOMPILING";
      const result = await engine.decompile(current, {
        name: current.name,
        key: key.value,
        timeout: 60000,
      });
      if (token !== serial) return;
      if (result.error !== undefined) {
        if (["timeout", "cancelled", "load"].includes(result.stage))
          engineReady = false;
        throw new Error(result.error);
      }
      if (typeof result.source !== "string")
        throw new Error("The engine returned an invalid response.");
      output = result.source;
      $("result-code").textContent = output;
      $("result-name").textContent =
        current.name.replace(/\.[^.]+$/, "") + ".luau";
      $("result-empty").hidden = true;
      $("result-pre").hidden = false;
      $("engine-status").textContent = "DECOMPILATION COMPLETE";
      $("result-details").textContent =
        `${output.split("\n").length} LINES / LUAU`;
      copy.disabled = save.disabled = false;
    } catch (error) {
      if (token === serial) {
        $("engine-status").textContent = "DECOMPILATION FAILED";
        notice(
          `Could not decompile: ${error.message || error}. Check the bytecode and its origin, or try another browser.`,
        );
      }
    } finally {
      if (token === serial) {
        busy = false;
        run.disabled = !file;
        sample.disabled = false;
        run.firstElementChild.textContent = "Decompile file";
      }
    }
  }
  input.addEventListener("change", () => {
    if (input.files.length) selectFile(input.files[0]);
    input.value = "";
  });
  drop.addEventListener("click", () => input.click());
  drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      input.click();
    }
  });
  for (const type of ["dragenter", "dragover"])
    drop.addEventListener(type, (e) => {
      e.preventDefault();
      drop.classList.add("dragover");
    });
  for (const type of ["dragleave", "drop"])
    drop.addEventListener(type, (e) => {
      e.preventDefault();
      drop.classList.remove("dragover");
    });
  drop.addEventListener("drop", (e) => {
    if (e.dataTransfer.files.length) selectFile(e.dataTransfer.files[0]);
  });
  key.addEventListener("change", () => {
    if (!busy && output === null) return;
    cancelCurrent();
    clearOutput();
    run.disabled = !file;
    $("engine-status").textContent = file
      ? "FILE SELECTED"
      : "WAITING FOR A FILE";
    notice("Bytecode origin changed. Decompile the file again.");
  });
  run.addEventListener("click", decompile);
  sample.addEventListener("click", async () => {
    if (busy) return;
    const token = ++serial;
    busy = true;
    sample.disabled = run.disabled = true;
    notice("");
    $("engine-status").textContent = "LOADING SAMPLE";
    try {
      const bytes = await fetchSample();
      if (token !== serial) return;
      selectFile(makeFile(bytes));
      key.value = "auto";
      await decompile();
    } catch (error) {
      if (token === serial) {
        notice(`Could not load the sample: ${error.message || error}.`);
        $("engine-status").textContent = file
          ? "FILE SELECTED"
          : "WAITING FOR A FILE";
        busy = false;
        sample.disabled = false;
        run.disabled = !file;
      }
    }
  });
  copy.addEventListener("click", async () => {
    if (output === null) return;
    try {
      await navigator.clipboard.writeText(output);
      notice("Code copied to clipboard.", true);
    } catch {
      notice(
        "Could not copy automatically. Select and copy the output manually.",
      );
    }
  });
  save.addEventListener("click", () => {
    if (output === null) return;
    const url = URL.createObjectURL(
      new Blob([output], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = $("result-name").textContent;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

if (typeof document !== "undefined") {
  initializeDecompiler({
    document,
    loadEngine: () => import("./engine/tovek.js"),
    fetchSample: async () => {
      const response = await fetch(
        new URL("./engine/SpawnShield.luaubc", import.meta.url),
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    },
    makeFile: (bytes) =>
      new File([bytes], "SpawnShield.luaubc", {
        type: "application/octet-stream",
      }),
  });
}
