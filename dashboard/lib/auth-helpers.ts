import "server-only";
import { cookies, headers } from "next/headers";

import { CHALLENGE_COOKIE, SESSION_COOKIE, challengeCookieOptions, createChallengeValue, createSessionValue, readChallengeValue, sessionCookieOptions } from "@/lib/session";

/** The dashboard's own host and origin, which are the WebAuthn relying party. */
export async function relyingParty(): Promise<{ rp_id: string; origin: string }> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return { rp_id: host.split(":")[0] ?? host, origin: `${proto}://${host}` };
}

export async function startSession(): Promise<void> {
  const { value, expires } = await createSessionValue();
  (await cookies()).set(SESSION_COOKIE, value, sessionCookieOptions(expires));
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function issueChallenge(challenge: string, kind: "registration" | "authentication"): Promise<void> {
  (await cookies()).set(CHALLENGE_COOKIE, await createChallengeValue(challenge, kind), challengeCookieOptions());
}

export async function takeChallenge(kind: "registration" | "authentication"): Promise<string | null> {
  const store = await cookies();
  const challenge = await readChallengeValue(store.get(CHALLENGE_COOKIE)?.value, kind);
  store.delete(CHALLENGE_COOKIE);
  return challenge;
}
