import { execFile as execFileCb } from "node:child_process";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { promisify } from "node:util";
import { ZipArchive, type EntryData } from "archiver";

const execFile = promisify(execFileCb);

export type PluginHeader = {
  name: string;
  version: string;
  description: string;
  author?: string;
};

export type InspectedPlugin = {
  path: string;
  slug: string;
  mainFile: string;
  header: PluginHeader;
  files: string[];
};

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".next",
  "vendor",
  "dist",
  ".svn",
]);

export function isWindowsAbsPath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value);
}

export function resolvePluginPath(input: string): string {
  let value = input.trim().replace(/^['"]|['"]$/g, "");
  if (isWindowsAbsPath(value) && process.platform !== "win32") {
    throw new Error(
      `That folder is on your Windows PC (${value}). This agent is running on Linux, so it cannot open it. Zip the plugin folder (the one with the main .php file) and upload it with the paperclip next to Send, or run npm run dev on that PC.`,
    );
  }
  if (value.startsWith("~")) {
    value = path.join(os.homedir(), value.slice(1));
  }
  if (!path.isAbsolute(value)) {
    value = path.resolve(process.cwd(), value);
  }
  return path.normalize(value);
}

export function parsePluginHeader(source: string): PluginHeader | null {
  const headerBlock = source.slice(0, 8192);
  const name = matchHeader(headerBlock, "Plugin Name");
  if (!name) return null;
  return {
    name,
    version: matchHeader(headerBlock, "Version") ?? "0.0.0",
    description: matchHeader(headerBlock, "Description") ?? "",
    author: matchHeader(headerBlock, "Author"),
  };
}

function matchHeader(source: string, key: string): string | undefined {
  const re = new RegExp(`^\\s*\\*?\\s*${key}\\s*:\\s*(.+)$`, "im");
  const match = source.match(re);
  return match?.[1]?.trim();
}

export async function inspectPlugin(inputPath: string): Promise<InspectedPlugin> {
  const abs = resolvePluginPath(inputPath);
  let info;
  try {
    info = await stat(abs);
  } catch {
    throw new Error(
      `I cannot find that path: ${abs}. Save the plugin locally, then send me the folder path.`,
    );
  }

  if (!info.isDirectory()) {
    throw new Error(
      `${abs} is a file. Point me at the plugin folder (the directory that contains the main PHP file).`,
    );
  }

  const rootPhp = (await readdir(abs))
    .filter((name) => name.toLowerCase().endsWith(".php"))
    .sort((a, b) => {
      const slug = path.basename(abs);
      if (a === `${slug}.php`) return -1;
      if (b === `${slug}.php`) return 1;
      return a.localeCompare(b);
    });

  if (rootPhp.length === 0) {
    throw new Error(
      `${abs} has no PHP files in the root. A WordPress plugin needs a main PHP file with a Plugin Name header.`,
    );
  }

  let chosen: { file: string; header: PluginHeader } | null = null;
  for (const file of rootPhp) {
    const source = await readFile(path.join(abs, file), "utf8");
    const header = parsePluginHeader(source);
    if (header) {
      chosen = { file, header };
      break;
    }
  }

  if (!chosen) {
    throw new Error(
      `${abs} does not look like a WordPress plugin. Add a header like this to the main PHP file:\n\nPlugin Name: My Plugin\nVersion: 1.0.0\nDescription: What it does`,
    );
  }

  const files = await listPluginFiles(abs);

  return {
    path: abs,
    slug: path.basename(abs),
    mainFile: chosen.file,
    header: chosen.header,
    files,
  };
}

async function listPluginFiles(root: string, rel = ""): Promise<string[]> {
  const dir = path.join(root, rel);
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".htaccess") continue;
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    if (entry.name.endsWith(".zip")) continue;

    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...(await listPluginFiles(root, childRel)));
    } else if (entry.isFile()) {
      out.push(childRel);
    }
  }

  return out.sort();
}

export async function zipPlugin(absDir: string, slug: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const passthrough = new PassThrough();

    passthrough.on("data", (chunk: Buffer) => chunks.push(chunk));
    passthrough.on("end", () => resolve(Buffer.concat(chunks)));
    passthrough.on("error", reject);

    archive.on("error", reject);
    archive.pipe(passthrough);

    archive.directory(
      absDir,
      slug,
      (entry: EntryData) => {
        const name = entry.name.replace(/\\/g, "/");
        const parts = name.split("/");
        if (parts.some((part: string) => SKIP_DIR_NAMES.has(part))) return false;
        if (parts.some((part: string) => part === ".git")) return false;
        if (name.endsWith(".zip")) return false;
        if (parts.some((part: string) => part === ".DS_Store")) return false;
        return entry;
      },
    );

    archive.finalize();
  });
}

const UNZIP_PY = `
import zipfile, sys, os
src, dest = sys.argv[1], sys.argv[2]
dest = os.path.abspath(dest)
os.makedirs(dest, exist_ok=True)
with zipfile.ZipFile(src) as z:
    for info in z.infolist():
        name = info.filename.replace("\\\\", "/")
        if not name or name.endswith("/"):
            continue
        parts = [p for p in name.split("/") if p and p != "."]
        if any(p == ".." for p in parts):
            continue
        target = os.path.abspath(os.path.join(dest, *parts))
        if not target.startswith(dest + os.sep):
            continue
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with z.open(info) as srcf, open(target, "wb") as out:
            out.write(srcf.read())
`;

export async function extractUploadedZip(buffer: Buffer): Promise<string> {
  const root = path.join(process.cwd(), "data", "uploads");
  await mkdir(root, { recursive: true });
  const stamp = Date.now().toString();
  const zipPath = path.join(root, `${stamp}.zip`);
  const dest = path.join(root, stamp);
  await writeFile(zipPath, buffer);
  try {
    await execFile("python3", ["-c", UNZIP_PY, zipPath, dest]);
  } finally {
    await unlink(zipPath).catch(() => undefined);
  }

  const entries = await readdir(dest, { withFileTypes: true });
  const phpAtRoot = entries.some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".php"));
  const dirs = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith("__"));
  if (!phpAtRoot && dirs.length === 1) {
    return path.join(dest, dirs[0].name);
  }
  return dest;
}

export async function saveUploadedPhp(buffer: Buffer, filename: string): Promise<string> {
  const slug = path.basename(filename, ".php").replace(/[^\w-]+/g, "-") || "uploaded-plugin";
  const dest = path.join(process.cwd(), "data", "uploads", `${Date.now()}-${slug}`);
  await mkdir(dest, { recursive: true });
  await writeFile(path.join(dest, `${slug}.php`), buffer);
  return dest;
}

export function toPluginRecord(
  inspected: InspectedPlugin,
  existingId?: string,
): import("./types").PluginRecord {
  return {
    id: existingId ?? crypto.randomUUID(),
    path: inspected.path,
    slug: inspected.slug,
    name: inspected.header.name,
    version: inspected.header.version,
    description: inspected.header.description,
    mainFile: inspected.mainFile,
    fileCount: inspected.files.length,
    lastInspectedAt: new Date().toISOString(),
  };
}
