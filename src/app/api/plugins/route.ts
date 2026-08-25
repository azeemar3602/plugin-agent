import { NextResponse } from "next/server";

import { inspectPlugin, toPluginRecord } from "@/lib/plugin";
import { mutateStore, toPublicStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { path?: string };
  if (!body.path) {
    return NextResponse.json({ error: "Plugin path is required." }, { status: 400 });
  }

  try {
    const inspected = await inspectPlugin(body.path);
    const store = await mutateStore((current) => {
      const existing = current.plugins.find(
        (plugin) => plugin.path === inspected.path || plugin.slug === inspected.slug,
      );
      const record = toPluginRecord(inspected, existing?.id);
      if (existing) Object.assign(existing, record);
      else current.plugins.push(record);
      current.lastPluginId = record.id;
    });
    return NextResponse.json(toPublicStore(store));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not read plugin." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const store = await mutateStore((current) => {
    current.plugins = current.plugins.filter((plugin) => plugin.id !== id);
    if (current.lastPluginId === id) current.lastPluginId = current.plugins[0]?.id;
  });

  return NextResponse.json(toPublicStore(store));
}
