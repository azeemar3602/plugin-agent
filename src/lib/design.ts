import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { analyzeDesignBuffer } from "./analyze-image";
import { buildElementorDocument, type DesignAnalysis } from "./elementor-builder";
import { pageTitle } from "./layout-plan";
import {
  activePluginKeys,
  availableWidgets,
  mergeRemoteWidgets,
  type WidgetRole,
} from "./elementor-widgets";
import { appRoot, dataDir } from "./paths";
import { isPdfFilename, rasterizePdfToJpeg } from "./pdf-raster";
import { runPythonScript } from "./python";
import type { RemoteElementorWidget, RemotePlugin } from "./wordpress";

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
  repairs: Array<{ from: string; to: string; reason: string }>;
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
  if (isPdfFilename(name) || buffer.subarray(0, 5).toString("utf8") === "%PDF-") {
    const jpeg = await rasterizePdfToJpeg(buffer);
    return analyzeDesignBuffer(jpeg, name.replace(/\.pdf$/i, ".jpg") || "design.jpg");
  }
  const script = path.join(appRoot(), "scripts", "analyze_design.py");
  try {
    const { stdout, stderr } = await runPythonScript([script, filePath], {
      timeout: 30000,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (!stdout.trim()) {
      throw new Error(stderr.trim() || "Could not read that design file.");
    }
    try {
      return JSON.parse(stdout) as DesignAnalysis;
    } catch {
      throw new Error("The design analyzer returned output that was not JSON.");
    }
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : "Could not read that PDF. Drop a JPEG, PNG, or PDF of the design.",
    );
  }
}

/**
 * Analyze a raster we already hold in memory. JPEG, PNG and PDF are decoded
 * from the buffer, so they never need to touch the disk; only the formats that
 * fall through to the Python analyzer (webp) need a real file, and that one is
 * written to a temp dir that is removed afterwards.
 */
export async function analyzeRasterBuffer(
  name: string,
  buffer: Buffer,
): Promise<DesignAnalysis> {
  if (/\.(jpe?g|png|pdf)$/i.test(name) || buffer.subarray(0, 5).toString("utf8") === "%PDF-") {
    return analyzeDesignFile(name, buffer);
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), "pa-design-"));
  try {
    const filePath = path.join(dir, name);
    await writeFile(filePath, buffer);
    return await analyzeDesignFile(filePath, buffer);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
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

  // Only template.json is ever read back (by /api/design/[id]). Keeping a copy
  // of the source design here cost several MB per drop and nothing read it, so
  // it is written only when the analyzer still has to be run off a real file.
  const analysis = options.analysis ?? (await analyzeRasterBuffer(sourceName, options.buffer));
  const widgets = mergeRemoteWidgets(availableWidgets(options.plugins), options.remoteWidgets ?? []);
  const keys = activePluginKeys(options.plugins);
  const title = pageTitle(analysis, widgets, options.filename);
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
    filename: options.filename,
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
    repairs: built.repairs,
  };
}
