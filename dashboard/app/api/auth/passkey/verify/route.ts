import { NextResponse } from "next/server";

import { ApiError, api } from "@/lib/api";
import { relyingParty, startSession, takeChallenge } from "@/lib/auth-helpers";

export async function POST(request: Request) {
  const challenge = await takeChallenge("authentication");
  if (!challenge) return NextResponse.json({ error: "challenge_missing" }, { status: 400 });
  const response = (await request.json().catch(() => null)) as unknown;
  if (!response || typeof response !== "object") return NextResponse.json({ error: "invalid_credential" }, { status: 422 });
  try {
    await api.authenticatePasskey({ ...(await relyingParty()), challenge, response });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 502;
    return NextResponse.json({ error: error instanceof ApiError ? error.code : "upstream_unavailable" }, { status });
  }
  await startSession();
  return NextResponse.json({ ok: true });
}
