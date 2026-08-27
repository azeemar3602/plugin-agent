// Production start. Prefers the standalone server (output: "standalone"), and
// honours PORT/HOSTNAME so a host like Hostinger can pick the port. Falls back
// to `next start` when the standalone bundle is not there.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PORT || "43177";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const server = path.join(root, ".next", "standalone", "server.js");

const env = {
  ...process.env,
  PORT: port,
  HOSTNAME: hostname,
  NODE_ENV: "production",
  // Keep bridge/, HANDOFF.md and data/ resolving to the checkout, not to
  // .next/standalone, so a redeploy does not strand the store.
  PLUGIN_AGENT_ROOT: process.env.PLUGIN_AGENT_ROOT || root,
};

const child = existsSync(server)
  ? spawn(process.execPath, [server], { cwd: root, stdio: "inherit", env })
  : spawn("npx", ["next", "start", "--hostname", hostname, "--port", port], {
      cwd: root,
      stdio: "inherit",
      env,
    });

child.on("exit", (code) => process.exit(code ?? 0));
