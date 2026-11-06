"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { toast } from "sonner";

import { removePasskey } from "@/app/(app)/security/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Passkey } from "@/lib/api";
import { relativeTime } from "@/lib/format";

export function PasskeysPanel({ passkeys, available }: { passkeys: Passkey[]; available: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  async function add() {
    setBusy(true);
    try {
      const optionsResponse = await fetch("/api/auth/passkey/register/options", { method: "POST" });
      if (!optionsResponse.ok) throw new Error((await optionsResponse.json().catch(() => ({}))).error ?? `http_${optionsResponse.status}`);
      const options = await optionsResponse.json();
      const credential = await startRegistration({ optionsJSON: options });
      const verify = await fetch("/api/auth/passkey/register/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, response: credential }) });
      if (!verify.ok) throw new Error((await verify.json().catch(() => ({}))).error ?? `http_${verify.status}`);
      toast.success(`Passkey “${name.trim() || "Passkey"}” added.`);
      setName("");
      router.refresh();
    } catch (error) {
      const err = error instanceof Error ? error : new Error("unknown");
      toast.error(err.name === "NotAllowedError" ? "The passkey prompt was cancelled." : err.name === "InvalidStateError" ? "This device already has a passkey for FeedbackBuddy." : `Could not add the passkey: ${err.message}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4 gap-0 py-0">
      <div className="border-b border-border px-5 py-2.5 text-sm font-semibold">Passkeys</div>
      {!available ? <p className="px-5 py-6 text-center text-[13.5px] text-muted-foreground">Passkeys are not available on this FeedbackBuddy API yet. The password still works.</p> : null}
      {available && passkeys.length === 0 ? <p className="px-5 py-6 text-center text-[13.5px] text-muted-foreground">No passkeys yet. The password works until you add one and stays as a recovery option after.</p> : null}
      <ul>
        {passkeys.map((passkey) => (
          <li key={passkey.id} className="flex items-center gap-3 border-t border-border px-5 py-3 first:border-t-0">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{passkey.name}</div>
              <div className="text-xs text-muted-foreground">
                {passkey.device_type === "multiDevice" ? "Synced passkey" : "Device-bound passkey"} · added {relativeTime(passkey.created_at)}
                {passkey.last_used_at ? ` · last used ${relativeTime(passkey.last_used_at)}` : " · never used"}
              </div>
            </div>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={pending} onClick={() => { if (!window.confirm(`Remove the passkey “${passkey.name}”?`)) return; startTransition(async () => { const r = await removePasskey(passkey.id); if ("error" in r) toast.error(`Could not remove (${r.error}).`); else toast.success("Passkey removed."); }); }}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
      {available ? (
        <form className="border-t border-border px-5 py-4" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="passkey-name">Add a passkey</Label>
              <Input id="passkey-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Name it, e.g. iPhone" />
            </div>
            <Button type="submit" disabled={busy}>Add passkey</Button>
          </div>
          <p className="mt-2.5 text-xs text-muted-foreground">Uses Face ID, Touch ID or your device PIN and syncs through iCloud Keychain. Bound to this dashboard’s address; enrol again if it changes.</p>
        </form>
      ) : null}
    </Card>
  );
}
