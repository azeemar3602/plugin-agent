import { NextResponse } from "next/server";

import { selectStoredSite } from "@/lib/agent";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { id?: string };
  if (!body.id) {
    return NextResponse.json({ error: "Missing site id." }, { status: 400 });
  }
  try {
    const store = await selectStoredSite(body.id);
    return NextResponse.json(store);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not switch site." },
      { status: 400 },
    );
  }
}
