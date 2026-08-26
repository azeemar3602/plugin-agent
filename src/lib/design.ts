import { execFile as execFileCb } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { analyzeDesignBuffer } from "./analyze-image";
import { buildElementorDocument, type DesignAnalysis } from "./elementor-builder";
import { landingPageTitle, looksLikeLanding } from "./layout-plan";
import {
  activePluginKeys,
  availableWidgets,
  mergeRemoteWidgets,
  titleFromDetectedWidgets,
  type WidgetRole,
} from "./elementor-widgets";
import { appRoot, dataDir } from "./paths";
import type { RemoteElementorWidget, RemotePlugin } from "./wordpress";

const execFile = promisify(execFileCb);

export type DesignBuild = {
  id: string;
  title: string;
  jsonPath: string;
  json: string;
  widgetsUsed: string[];
  sectionRoles: string[];
  pluginsConsidered: string[];
  detectedWidgets: string[];
  generatedRoles: WidgetRole[];
};

function isDesignName(name: string): boolean {
  return /\.(jpe?g|png|webp|pdf)$/i.test(name);
}

export function isDesignFile(filename: string): boolean {
  return isDesignName(filename);
}

export async function analyzeDesignFile(filePath: string, buffer: Buffer): Promise<DesignAnalysis> {
  const name = path.basename(filePath);
  if (/\.(jpe?g|png)$/i.test(name)) {
    return analyzeDesignBuffer(buffer, name);
  }
  const script = path.join(appRoot(), "scripts", "analyze_design.py");
  try {
    const { stdout, stderr } = await execFile("python3", [script, filePath], {
      timeout: 30000,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (!stdout.trim()) {
      throw new Error(stderr.trim() || "Could not read that PDF.");
    }
    return JSON.parse(stdout) as DesignAnalysis;
  } catch {
    throw new Error(
      "PDF analysis needs Python on this machine. Export the first page as a JPEG or PNG and drop that instead.",
    );
  }
}

export async function buildDesignTemplate(options: {
  filename: string;
  buffer: Buffer;
  plugins: RemotePlugin[];
  remoteWidgets?: RemoteElementorWidget[];
  analysis?: DesignAnalysis;
  generatedRoles?: WidgetRole[];
}): Promise<DesignBuild> {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const dir = path.join(dataDir(), "designs", id);
  await mkdir(dir, { recursive: true });
  const sourceName = options.filename.replace(/[^\w.-]+/g, "-") || "design";
  const sourcePath = path.join(dir, sourceName);
  await writeFile(sourcePath, options.buffer);

  const analysis = options.analysis ?? (await analyzeDesignFile(sourcePath, options.buffer));
  const widgets = mergeRemoteWidgets(availableWidgets(options.plugins), options.remoteWidgets ?? []);
  const keys = activePluginKeys(options.plugins);
  const title = looksLikeLanding(analysis)
    ? landingPageTitle()
    : titleFromDetectedWidgets(widgets) || `Design: ${sourceName.replace(/\.[^.]+$/, "")}`;
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
    detectedWidgets: widgets
      .filter((widget) => widget.source === "remote")
      .map((widget) => widget.label),
    generatedRoles: options.generatedRoles ?? [],
  };
}
