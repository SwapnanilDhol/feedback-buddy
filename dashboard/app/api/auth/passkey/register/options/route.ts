import { NextResponse } from "next/server";

import { ApiError, api } from "@/lib/api";
import { issueChallenge, relyingParty } from "@/lib/auth-helpers";

export async function POST() {
  try {
    const options = await api.passkeyRegistrationOptions(await relyingParty());
    await issueChallenge(options.challenge, "registration");
    return NextResponse.json(options);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 502;
    return NextResponse.json({ error: error instanceof ApiError ? error.code : "upstream_unavailable" }, { status });
  }
}
