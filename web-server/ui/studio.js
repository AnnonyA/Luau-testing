(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const input = $("file-input"),
    dropzone = $("dropzone"),
    run = $("decompile");
  const copy = $("copy"),
    download = $("download"),
    message = $("message");
  const maxBytes = 16 * 1024 * 1024;
  let file = null,
    result = "",
    controller = null;

  function notice(text, success = false) {
    message.textContent = text;
    message.classList.toggle("success", success);
    message.hidden = !text;
  }
  function clearResult() {
    result = "";
    $("code-content").textContent = "";
    $("code").hidden = true;
    $("empty-state").hidden = false;
    copy.disabled = download.disabled = true;
    $("output-filename").textContent = "resultado.luau";
    $("result-meta").textContent = "UTF-8 / LUAU";
  }
  function selectFile(candidate) {
    if (controller) {
      controller.abort();
      controller = null;
    }
    clearResult();
    file = null;
    run.disabled = true;
    run.firstElementChild.textContent = "Decompilar archivo";
    if (!candidate || candidate.size === 0 || candidate.size > maxBytes) {
      $("drop-title").textContent = "Arrastra tu archivo aquí";
      $("drop-sub").innerHTML =
        "o <span>selecciona un archivo</span> desde tu equipo";
      $("drop-meta").textContent = "BYTECODE LUAU · MÁX. 16 MiB";
      $("result-status").textContent = "ESPERANDO ARCHIVO";
      if (candidate)
        notice(
          candidate.size === 0
            ? "El archivo está vacío. Selecciona un archivo con bytecode."
            : "El archivo supera el límite de 16 MiB.",
        );
      return;
    }
    file = candidate;
    notice("");
    $("drop-title").textContent = file.name;
    $("drop-sub").textContent =
      "Archivo seleccionado · haz clic para cambiarlo";
    $("drop-meta").textContent =
      `${(file.size / 1024).toFixed(1)} KB · LISTO PARA DECOMPILAR`;
    $("result-status").textContent = "ARCHIVO SELECCIONADO";
    run.disabled = false;
  }
  input.addEventListener("change", () => {
    if (input.files.length) selectFile(input.files[0]);
    input.value = "";
  });
  dropzone.addEventListener("click", () => input.click());
  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      input.click();
    }
  });
  for (const type of ["dragenter", "dragover"])
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.add("dragover");
    });
  for (const type of ["dragleave", "drop"])
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.remove("dragover");
    });
  dropzone.addEventListener("drop", (event) => {
    if (event.dataTransfer.files.length)
      selectFile(event.dataTransfer.files[0]);
  });
  $("encode-key").addEventListener("change", () => {
    const hadWork = !!result || !!controller;
    if (controller) {
      controller.abort();
      controller = null;
    }
    if (hadWork) {
      clearResult();
      $("result-status").textContent = file
        ? "ARCHIVO SELECCIONADO"
        : "ESPERANDO ARCHIVO";
      run.disabled = !file;
      run.firstElementChild.textContent = "Decompilar archivo";
      notice("Cambiaste el formato. Vuelve a decompilar el archivo.");
    }
  });
  run.addEventListener("click", async () => {
    if (!file || controller) return;
    const current = file;
    const request = new AbortController();
    controller = request;
    clearResult();
    notice("");
    run.disabled = true;
    run.firstElementChild.textContent = "Decompilando…";
    $("result-status").textContent = "PROCESANDO";
    try {
      const response = await fetch("/decompile/raw", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-encode-key": $("encode-key").value,
        },
        body: current,
        signal: request.signal,
      });
      const text = await response.text();
      if (!response.ok)
        throw new Error(text || `Error del servidor (${response.status}).`);
      if (!text) throw new Error("El servidor devolvió una respuesta vacía.");
      if (controller !== request) return;
      result = text;
      $("code-content").textContent = text;
      $("empty-state").hidden = true;
      $("code").hidden = false;
      $("output-filename").textContent =
        current.name.replace(/\.[^.]+$/, "") + ".luau";
      $("result-status").textContent = "DECOMPILACIÓN COMPLETA";
      $("result-meta").textContent = `${text.split("\n").length} LÍNEAS / LUAU`;
      copy.disabled = download.disabled = false;
    } catch (error) {
      if (error.name !== "AbortError" && controller === request) {
        $("result-status").textContent = "NO SE PUDO DECOMPILAR";
        notice(
          `No se pudo decompilar: ${error.message}. Revisa el archivo, su formato y que el servidor Tovek esté disponible.`,
        );
      }
    } finally {
      if (controller === request) {
        controller = null;
        run.disabled = !file;
        run.firstElementChild.textContent = "Decompilar archivo";
      }
    }
  });
  copy.addEventListener("click", async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      notice("Código copiado al portapapeles.", true);
    } catch {
      notice(
        "No se pudo copiar automáticamente. Puedes seleccionar el código y copiarlo manualmente.",
      );
    }
  });
  download.addEventListener("click", () => {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([result], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = $("output-filename").textContent;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();
