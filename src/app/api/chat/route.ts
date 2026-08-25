import { NextResponse } from "next/server";

import { handleAgentMessage } from "@/lib/agent";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { message?: string };
  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "Message is empty." }, { status: 400 });
  }

  try {
    const result = await handleAgentMessage(message);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Agent failed." },
      { status: 500 },
    );
  }
}
