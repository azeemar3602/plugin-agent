import path from "node:path";

export function appRoot(): string {
  return process.env.PLUGIN_AGENT_ROOT || process.cwd();
}

export function dataDir(): string {
  return process.env.PLUGIN_AGENT_DATA || path.join(appRoot(), "data");
}
