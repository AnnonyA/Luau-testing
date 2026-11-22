// Assemble only the public site and the checked-in upstream browser engine.
import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "dist", "site");
const engine = path.join(root, "docs", "assets", "v26", "tovek");
await rm(target, { recursive: true, force: true });
await mkdir(path.join(target, "engine"), { recursive: true });
await cp(path.join(root, "site"), target, { recursive: true });
for (const file of ["tovek.js", "tovek.wasm", "worker.js", "build.json"]) {
  await cp(path.join(engine, file), path.join(target, "engine", file));
}
await cp(
  path.join(engine, "samples", "SpawnShield.luaubc"),
  path.join(target, "engine", "SpawnShield.luaubc"),
);
console.log("Site built in dist/site");
