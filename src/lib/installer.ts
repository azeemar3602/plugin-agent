import { existsSync, statSync } from "node:fs";
import path from "node:path";

import { appRoot } from "./paths";

export type InstallerInfo = {
  path: string;
  filename: string;
  size: number;
};

export function findWindowsInstaller(): InstallerInfo | null {
  const names = ["PluginAgentSetup.exe", "PluginAgent-Setup.exe"];
  const dirs = [
    process.env.PLUGIN_AGENT_INSTALLER_DIR,
    path.join(appRoot(), "release"),
    "/opt/cursor/artifacts",
  ].filter((dir): dir is string => Boolean(dir));

  for (const dir of dirs) {
    for (const filename of names) {
      const filePath = path.join(dir, filename);
      if (!existsSync(filePath)) continue;
      const size = statSync(filePath).size;
      if (size < 1024) continue;
      return { path: filePath, filename: "PluginAgentSetup.exe", size };
    }
  }
  return null;
}
