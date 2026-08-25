import { NextResponse } from "next/server";

import { readStore, toPublicStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = await readStore();
  return NextResponse.json(toPublicStore(store));
}
