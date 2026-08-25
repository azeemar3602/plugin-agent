import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

import { findWindowsInstaller } from "@/lib/installer";

export const dynamic = "force-dynamic";

function notFound() {
  return Response.json(
    { available: false, error: "Windows installer is not in this build yet." },
    { status: 404 },
  );
}

export async function HEAD() {
  const installer = findWindowsInstaller();
  if (!installer) {
    return new Response(null, { status: 404 });
  }
  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(installer.size),
      "Content-Disposition": `attachment; filename="${installer.filename}"`,
    },
  });
}

export async function GET() {
  const installer = findWindowsInstaller();
  if (!installer) return notFound();

  const stream = createReadStream(installer.path);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(installer.size),
      "Content-Disposition": `attachment; filename="${installer.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
