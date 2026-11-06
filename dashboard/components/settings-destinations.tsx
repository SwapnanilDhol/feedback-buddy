"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { addDestination, removeDestination, testDestination, toggleDestination } from "@/app/(app)/p/[id]/settings/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Category, Destination, DestinationKind } from "@/lib/api";
import { categories, categoryLabels } from "@/lib/format";

const kindLabels: Record<DestinationKind, string> = { email: "Email", slack_webhook: "Slack incoming webhook", webhook: "Signed webhook" };

export function DestinationsPanel({ projectId, destinations }: { projectId: string; destinations: Destination[] }) {
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<DestinationKind>("email");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [selected, setSelected] = useState<Category[]>([]);

  return (
    <Card className="mb-4 gap-0 py-0">
      <div className="border-b border-border px-5 py-2.5 text-sm font-semibold">Destinations</div>
      {destinations.length === 0 ? <p className="px-5 py-6 text-center text-[13.5px] text-muted-foreground">None yet. Feedback is stored here either way.</p> : null}
      <ul>
        {destinations.map((destination) => (
          <li key={destination.id} className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3 first:border-t-0">
            <div className="min-w-0 flex-1 basis-56">
              <div className="text-sm font-medium">
                {kindLabels[destination.kind].replace(" incoming webhook", "").replace("Signed ", "")}{" "}
                <span className="font-normal text-muted-foreground">· {destination.categories.length ? destination.categories.map((c) => categoryLabels[c]).join(", ") : "all categories"}</span>
              </div>
              <div className="truncate text-xs text-muted-foreground">{destination.url}</div>
            </div>
            <span className={`text-xs ${destination.enabled ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>● {destination.enabled ? "on" : "off"}</span>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => startTransition(async () => { const r = await testDestination(projectId, destination.id); if ("error" in r) toast.error(`Test failed: ${r.error}.`); else toast.success("Test delivery succeeded."); })}>
              Test
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => startTransition(async () => { const r = await toggleDestination(projectId, destination.id, !destination.enabled); if ("error" in r) toast.error(`Could not update (${r.error}).`); })}>
              {destination.enabled ? "Disable" : "Enable"}
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={pending} onClick={() => { if (!window.confirm("Remove this destination?")) return; startTransition(async () => { const r = await removeDestination(projectId, destination.id); if ("error" in r) toast.error(`Could not remove (${r.error}).`); else toast.success("Destination removed."); }); }}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="border-t border-border px-5 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await addDestination(projectId, { kind, url, secret, categories: selected });
            if ("error" in result) toast.error(kind === "email" ? "Enter a valid email address." : kind === "webhook" ? "Webhooks need an https URL and a secret of 8+ characters." : "Enter an https URL.");
            else {
              toast.success("Destination added.");
              setUrl(""); setSecret(""); setSelected([]);
            }
          });
        }}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[190px_minmax(0,1fr)_200px]">
          <div className="space-y-1.5">
            <Label>Kind</Label>
            <Select value={kind} onValueChange={(value) => setKind(value as DestinationKind)}>
              <SelectTrigger className="w-full"><SelectValue>{kindLabels[kind]}</SelectValue></SelectTrigger>
              <SelectContent>
                {(Object.keys(kindLabels) as DestinationKind[]).map((value) => (
                  <SelectItem key={value} value={value}>{kindLabels[value]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dest-url">{kind === "email" ? "Address" : "URL"}</Label>
            <Input id="dest-url" value={url} onChange={(e) => setUrl(e.target.value)} required placeholder={kind === "email" ? "you@example.com" : "https://hooks.slack.com/services/…"} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dest-secret">Secret {kind === "webhook" ? "" : "(webhooks only)"}</Label>
            <Input id="dest-secret" type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="at least 8 characters" disabled={kind !== "webhook"} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-[13px]">
            {categories.map((category) => (
              <label key={category} className="inline-flex items-center gap-1.5">
                <input type="checkbox" className="size-3.5" checked={selected.includes(category)} onChange={(e) => setSelected(e.target.checked ? [...selected, category] : selected.filter((c) => c !== category))} />
                {categoryLabels[category]}
              </label>
            ))}
            <span className="text-xs text-muted-foreground">none checked = all</span>
          </div>
          <Button type="submit" variant="outline" size="sm" disabled={pending}>Add destination</Button>
        </div>
      </form>
    </Card>
  );
}
