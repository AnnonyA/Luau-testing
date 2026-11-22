// Static preview with a same-origin proxy to the local Rust server.
import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.dirname(fileURLToPath(import.meta.url));
const target = new URL(process.env.TOVEK_API_ORIGIN || "http://127.0.0.1:3000");
const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/studio.css", ["studio.css", "text/css; charset=utf-8"]],
  ["/studio.js", ["studio.js", "text/javascript; charset=utf-8"]],
]);
http
  .createServer((req, res) => {
    if (req.method === "POST" && req.url === "/decompile/raw") {
      const proxy = http.request(
        new URL(req.url, target),
        { method: "POST", headers: { ...req.headers, host: target.host } },
        (upstream) => {
          res.writeHead(upstream.statusCode, upstream.headers);
          upstream.pipe(res);
        },
      );
      proxy.on("error", () => {
        if (!res.headersSent)
          res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
        res.end(
          "El servidor Tovek no está disponible. Inicia cargo run -p web-server.",
        );
      });
      req.on("error", () => proxy.destroy());
      req.pipe(proxy);
      return;
    }
    const asset = assets.get(req.url);
    if (req.method !== "GET" || !asset) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "content-type": asset[1],
      "cache-control": "no-store",
    });
    fs.createReadStream(path.join(root, asset[0])).pipe(res);
  })
  .listen(Number(process.env.PORT || 4173), "0.0.0.0", () =>
    console.log(`Studio preview listening on port ${process.env.PORT || 4173}`),
  );
