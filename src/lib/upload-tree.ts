import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { dataDir } from "./paths";

export async function saveUploadedTree(
  files: Array<{ relativePath: string; buffer: Buffer }>,
): Promise<string> {
  const dest = path.join(dataDir(), "uploads", String(Date.now()));
  await mkdir(dest, { recursive: true });
  for (const file of files) {
    const rel = file.relativePath.replace(/\\/g, "/");
    const parts = rel.split("/").filter((part) => part && part !== ".." && part !== ".");
    if (parts.length === 0) continue;
    const target = path.join(dest, ...parts);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.buffer);
  }
  const entries = await readdir(dest, { withFileTypes: true });
  const phpAtRoot = entries.some(
    (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".php"),
  );
  const dirs = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith("__"));
  if (!phpAtRoot && dirs.length === 1) {
    return path.join(dest, dirs[0].name);
  }
  return dest;
}
