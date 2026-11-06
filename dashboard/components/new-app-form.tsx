"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createProject } from "@/app/(app)/apps/new/actions";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NewAppForm() {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [bundleId, setBundleId] = useState("");
  const [retention, setRetention] = useState("30");
  const [created, setCreated] = useState<{ id: string; public_key: string } | null>(null);

  if (created) {
    return (
      <Card className="gap-0 py-0">
        <div className="border-b border-border px-5 py-2.5 text-sm font-semibold">Your public key</div>
        <div className="px-5 py-4">
          <p className="mb-2 text-[13.5px] text-muted-foreground">Copy it now. It is shown once and stored only as a hash.</p>
          <code className="block break-all rounded-md bg-muted px-3 py-2 font-mono text-[13px]">{created.public_key}</code>
          <div className="mt-3 flex gap-2">
            <CopyButton text={created.public_key} label="Copy key" />
            <Button asChild>
              <Link href={`/p/${created.id}/settings`}>Open settings</Link>
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="gap-0 py-0">
      <form
        className="px-5 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await createProject({ name, bundle_id: bundleId, retention_days: Number(retention) || 30 });
            if ("error" in result) toast.error(`Could not create the app (${result.error}).`);
            else setCreated(result);
          });
        }}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_150px]">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="Goaley" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bundle_id">Bundle identifier</Label>
            <Input id="bundle_id" value={bundleId} onChange={(e) => setBundleId(e.target.value)} maxLength={120} placeholder="com.example.app" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="retention_days">Retention (days)</Label>
            <Input id="retention_days" type="number" min={1} max={365} value={retention} onChange={(e) => setRetention(e.target.value)} />
          </div>
        </div>
        <p className="mt-2.5 text-xs text-muted-foreground">The bundle identifier is optional, but with it the app icon is fetched from the App Store automatically.</p>
        <div className="mt-3 flex gap-2">
          <Button type="submit" disabled={pending}>Create app</Button>
          <Button variant="outline" asChild>
            <Link href="/">Cancel</Link>
          </Button>
        </div>
      </form>
    </Card>
  );
}
