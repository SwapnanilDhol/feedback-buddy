import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { ApiError, api } from "@/lib/api";
import { relyingParty, takeChallenge } from "@/lib/auth-helpers";

export async function POST(request: Request) {
  const challenge = await takeChallenge("registration");
  if (!challenge) return NextResponse.json({ error: "challenge_missing" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { name?: unknown; response?: unknown } | null;
  if (!body || typeof body.response !== "object" || body.response === null) return NextResponse.json({ error: "invalid_credential" }, { status: 422 });
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 60) : "Passkey";
  try {
    const result = await api.registerPasskey({ ...(await relyingParty()), challenge, name, response: body.response });
    revalidatePath("/security");
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 502;
    return NextResponse.json({ error: error instanceof ApiError ? error.code : "upstream_unavailable" }, { status });
  }
}
