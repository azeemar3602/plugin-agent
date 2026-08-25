import { existsSync, statSync } from "node:fs";
import path from "node:path";

export type InstallerInfo = {
  path: string;
  filename: string;
  size: number;
};

export function findWindowsInstaller(): InstallerInfo | null {
  const candidates = [
    path.join(process.cwd(), "release", "PluginAgentSetup.exe"),
    "/opt/cursor/artifacts/PluginAgentSetup.exe",
  ];
  for (const filePath of candidates) {
    if (!existsSync(/* turbopackIgnore: true */ filePath)) continue;
    const size = statSync(/* turbopackIgnore: true */ filePath).size;
    if (size < 1024) continue;
    return { path: filePath, filename: "PluginAgentSetup.exe", size };
  }
  return null;
}
