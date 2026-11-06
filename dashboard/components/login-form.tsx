"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { KeyRound, Loader2 } from "lucide-react";

import { loginWithPassword, type LoginState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ hasPasskeys, showPassword, next }: { hasPasskeys: boolean; showPassword: boolean; next: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginWithPassword, {});
  const [passkeyStatus, setPasskeyStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  async function signInWithPasskey() {
    setPasskeyBusy(true);
    setPasskeyStatus({ text: "Waiting for your passkey…" });
    try {
      const optionsResponse = await fetch("/api/auth/passkey/options", { method: "POST" });
      if (!optionsResponse.ok) throw new Error((await optionsResponse.json().catch(() => ({}))).error ?? `http_${optionsResponse.status}`);
      const options = await optionsResponse.json();
      const credential = await startAuthentication({ optionsJSON: options });
      const verify = await fetch("/api/auth/passkey/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credential) });
      if (!verify.ok) throw new Error((await verify.json().catch(() => ({}))).error ?? `http_${verify.status}`);
      router.replace(next);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      setPasskeyStatus({
        error: true,
        text:
          message === "NotAllowedError" || (error instanceof Error && error.name === "NotAllowedError")
            ? "The passkey prompt was cancelled."
            : message === "passkey_rejected"
              ? "That passkey was not accepted."
              : message === "no_passkeys"
                ? "No passkeys are enrolled yet. Use the password."
                : `Could not sign in: ${message}.`,
      });
      setPasskeyBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <h1 className="text-lg font-semibold">Sign in</h1>
        <p className="mb-5 text-[13.5px] text-muted-foreground">Your feedback inbox, across every app.</p>
        {hasPasskeys && !showPassword ? (
          <div>
            <Button className="w-full" onClick={signInWithPasskey} disabled={passkeyBusy}>
              {passkeyBusy ? <Loader2 className="animate-spin" /> : <KeyRound />}
              Continue with passkey
            </Button>
            <p className={`mt-3 min-h-5 text-[13px] ${passkeyStatus?.error ? "text-destructive" : "text-muted-foreground"}`}>{passkeyStatus?.text}</p>
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              <Link className="underline-offset-4 hover:underline" href={`/login?password=1${next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}`}>
                Use the password instead
              </Link>
            </p>
          </div>
        ) : (
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="next" value={next} />
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
            </div>
            {state.error ? <p className="text-[13px] text-destructive">{state.error}</p> : null}
            <Button className="w-full" type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Sign in
            </Button>
            {hasPasskeys ? (
              <p className="text-[12.5px] text-muted-foreground">
                <Link className="underline-offset-4 hover:underline" href="/login">
                  Use a passkey instead
                </Link>
              </p>
            ) : null}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
