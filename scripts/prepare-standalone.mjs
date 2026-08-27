// `next build` with output: "standalone" writes a server bundle that is missing
// the static assets and the files the app reads at runtime. Copy them in so
// `node .next/standalone/server.js` can be started from a clean checkout —
// which is how Hostinger (and any Node host) runs this app.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next", "standalone");

if (!existsSync(path.join(standalone, "server.js"))) {
  console.error("prepare-standalone: .next/standalone/server.js is missing — did next build run?");
  process.exit(1);
}

mkdirSync(path.join(standalone, ".next"), { recursive: true });
cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), {
  recursive: true,
});

// Read at runtime by /api/bridge, /api/handoff, the installer and the packer.
for (const dir of ["public", "bridge", "scripts", "examples", "templates", "plugins"]) {
  const src = path.join(root, dir);
  if (existsSync(src)) cpSync(src, path.join(standalone, dir), { recursive: true });
}
for (const file of ["HANDOFF.md", "requirements.txt"]) {
  const src = path.join(root, file);
  if (existsSync(src)) cpSync(src, path.join(standalone, file));
}

console.log("prepare-standalone: .next/standalone is ready to run");
