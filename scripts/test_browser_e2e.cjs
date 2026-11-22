// Full browser smoke test; CI provides Playwright and Chrome outside the repo.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve("dist/site");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
};
const nonGet = [];
const server = http.createServer((req, res) => {
  if (req.method !== "GET") nonGet.push(req.method);
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith("/Luau-testing/")) {
    res.writeHead(404).end();
    return;
  }
  const relative = url.pathname.slice("/Luau-testing/".length) || "index.html";
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (error, bytes) => {
    if (error) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
    });
    res.end(bytes);
  });
});
(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({
      executablePath:
        process.env.BROWSER_EXECUTABLE || "/usr/bin/google-chrome",
      args: ["--no-sandbox"],
      headless: true,
    });
    const page = await browser.newPage({
      viewport: { width: 1360, height: 900 },
      acceptDownloads: true,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const base = `http://127.0.0.1:${server.address().port}/Luau-testing/`;
    await page.goto(base, { waitUntil: "networkidle" });
    await page.locator("#try-sample").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#engine-status").textContent ===
        "DECOMPILATION COMPLETE",
      null,
      { timeout: 60000 },
    );
    assert.match(
      await page.locator("#result-code").innerText(),
      /GetService\("Players"\)/,
    );
    assert.equal(await page.locator("#copy-output").isEnabled(), true);
    const pendingDownload = page.waitForEvent("download");
    await page.locator("#save-output").click();
    assert.equal(
      (await pendingDownload).suggestedFilename(),
      "SpawnShield.luau",
    );
    await page
      .locator("#bytecode-file")
      .setInputFiles("docs/assets/v26/tovek/samples/SpawnShield.client.txt");
    await page.locator("#run-decompiler").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#engine-status").textContent ===
        "DECOMPILATION COMPLETE",
      null,
      { timeout: 60000 },
    );
    assert.match(
      await page.locator("#result-code").innerText(),
      /GetService\("Players"\)/,
    );
    await page
      .locator("#bytecode-file")
      .setInputFiles({
        name: "bad.bin",
        mimeType: "application/octet-stream",
        buffer: Buffer.from([99]),
      });
    await page.locator("#run-decompiler").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#engine-status").textContent ===
        "DECOMPILATION FAILED",
      null,
      { timeout: 60000 },
    );
    assert.equal(await page.locator("#save-output").isDisabled(), true);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      "mobile page should not overflow",
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(nonGet, [], "the browser must never upload bytecode");
    console.log(
      "Browser smoke test passed: sample, Roblox text, errors, download, mobile and no uploads.",
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
