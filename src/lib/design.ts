import { execFile as execFileCb } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { buildElementorDocument, type DesignAnalysis } from "./elementor-builder";
import { activePluginKeys, availableWidgets } from "./elementor-widgets";
import type { RemotePlugin } from "./wordpress";

const execFile = promisify(execFileCb);

export type DesignBuild = {
  id: string;
  title: string;
  jsonPath: string;
  json: string;
  widgetsUsed: string[];
  sectionRoles: string[];
  pluginsConsidered: string[];
};

function isDesignName(name: string): boolean {
  return /\.(jpe?g|png|webp|pdf)$/i.test(name);
}

export function isDesignFile(filename: string): boolean {
  return isDesignName(filename);
}

export async function analyzeDesignFile(filePath: string): Promise<DesignAnalysis> {
  const script = path.join(process.cwd(), "scripts", "analyze_design.py");
  const { stdout, stderr } = await execFile("python3", [script, filePath], {
    timeout: 30000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (!stdout.trim()) {
    throw new Error(stderr.trim() || "Could not read that JPEG, PNG, or PDF.");
  }
  return JSON.parse(stdout) as DesignAnalysis;
}

export async function buildDesignTemplate(options: {
  filename: string;
  buffer: Buffer;
  plugins: RemotePlugin[];
}): Promise<DesignBuild> {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const dir = path.join(process.cwd(), "data", "designs", id);
  await mkdir(dir, { recursive: true });
  const sourceName = options.filename.replace(/[^\w.-]+/g, "-") || "design";
  const sourcePath = path.join(dir, sourceName);
  await writeFile(sourcePath, options.buffer);

  const analysis = await analyzeDesignFile(sourcePath);
  const widgets = availableWidgets(options.plugins);
  const keys = activePluginKeys(options.plugins);
  const title = `Design: ${sourceName.replace(/\.[^.]+$/, "")}`;
  const built = buildElementorDocument({
    title,
    analysis,
    widgets,
    extras: {
      donation: keys.has("give"),
      search: keys.has("queryra-ai-search"),
      form: keys.has("formlayer") || keys.has("formlayer-pro") || keys.has("elementor-pro"),
      language: keys.has("polylang"),
    },
  });

  const jsonPath = path.join(dir, "template.json");
  await writeFile(jsonPath, built.json, "utf8");

  return {
    id,
    title,
    jsonPath,
    json: built.json,
    widgetsUsed: built.widgetsUsed,
    sectionRoles: built.sectionRoles,
    pluginsConsidered: [...keys],
  };
}
