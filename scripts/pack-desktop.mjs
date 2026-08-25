import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packDir = path.join(root, "pack");
const standaloneDest = path.join(packDir, "standalone");
const releaseDir = path.join(root, "release");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!process.env.SKIP_BUILD) {
  run("npx", ["next", "build"]);
}

const standaloneSrc = path.join(root, ".next", "standalone");
if (!existsSync(path.join(standaloneSrc, "server.js"))) {
  console.error("next build did not produce .next/standalone/server.js");
  process.exit(1);
}

rmSync(packDir, { recursive: true, force: true });
mkdirSync(packDir, { recursive: true });
cpSync(standaloneSrc, standaloneDest, { recursive: true });
cpSync(path.join(root, ".next", "static"), path.join(standaloneDest, ".next", "static"), {
  recursive: true,
});
if (existsSync(path.join(root, "public"))) {
  cpSync(path.join(root, "public"), path.join(standaloneDest, "public"), { recursive: true });
}
cpSync(path.join(root, "bridge"), path.join(standaloneDest, "bridge"), { recursive: true });
if (existsSync(path.join(root, "scripts"))) {
  cpSync(path.join(root, "scripts"), path.join(standaloneDest, "scripts"), { recursive: true });
}
if (existsSync(path.join(root, "examples"))) {
  cpSync(path.join(root, "examples"), path.join(standaloneDest, "examples"), { recursive: true });
}

for (const junk of ["data", "src", "desktop", "installer", "AGENTS.md", "CLAUDE.md"]) {
  rmSync(path.join(standaloneDest, junk), { recursive: true, force: true });
}

const electronVersion = require("electron/package.json").version;
mkdirSync(releaseDir, { recursive: true });

run("npx", [
  "@electron/packager",
  path.join(root, "desktop"),
  "PluginAgent",
  "--platform=win32",
  "--arch=x64",
  `--out=${releaseDir}`,
  "--overwrite",
  `--extra-resource=${standaloneDest}`,
  `--electron-version=${electronVersion}`,
  "--app-version=1.0.0",
]);

const packaged = path.join(releaseDir, "PluginAgent-win32-x64");
if (!existsSync(path.join(packaged, "PluginAgent.exe"))) {
  console.error("electron-packager did not produce PluginAgent.exe");
  process.exit(1);
}

const nsi = path.join(root, "installer", "plugin-agent.nsi");
const makensis = spawnSync("makensis", ["-V2", nsi], { cwd: root, stdio: "inherit" });
if (makensis.error && makensis.error.code === "ENOENT") {
  console.warn("makensis not found; skipping PluginAgentSetup.exe (portable folder is in release/)");
} else if (makensis.status !== 0) {
  process.exit(makensis.status ?? 1);
}

writeFileSync(
  path.join(releaseDir, "README.txt"),
  [
    "Plugin Agent for Windows",
    "",
    "Double-click PluginAgentSetup.exe and follow the prompts.",
    "No Node.js install is required.",
    "",
    "If Windows SmartScreen appears, choose More info → Run anyway.",
    "Site passwords are stored only on this PC under %APPDATA%\\plugin-agent\\data.",
    "",
    "Portable option: unzip PluginAgent-win32-x64 and run PluginAgent.exe.",
    "",
  ].join("\r\n"),
);

console.log("Windows build is in", releaseDir);
