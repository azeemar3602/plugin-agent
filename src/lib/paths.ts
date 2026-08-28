import path from "node:path";

export function appRoot(): string {
  return process.env.PLUGIN_AGENT_ROOT || process.cwd();
}

export function dataDir(): string {
  return process.env.PLUGIN_AGENT_DATA || path.join(appRoot(), "data");
}

/**
 * Where finished newsletter HTML is copied so it is easy to find, rather than
 * being buried in the app's data directory. Unset means no export copy.
 */
export function exportDir(): string {
  return process.env.PLUGIN_AGENT_EXPORT_DIR || "";
}
