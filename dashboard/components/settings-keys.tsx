"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createKey, revokeKey } from "@/app/(app)/p/[id]/settings/actions";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ApiKey } from "@/lib/api";
import { relativeTime } from "@/lib/format";

export function KeysPanel({ projectId, keys }: { projectId: string; keys: ApiKey[] }) {
  const [pending, startTransition] = useTransition();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<ApiKey | null>(null);

  return (
    <Card className="mb-4 gap-0 py-0">
      <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
        <span className="text-sm font-semibold">Public keys</span>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await createKey(projectId);
              if ("error" in result) toast.error(`Could not create a key (${result.error}).`);
              else setNewKey(result.public_key);
            })
          }
        >
          New key
        </Button>
      </div>
      <ul>
        {keys.map((key) => (
          <li key={key.id} className="flex items-center gap-3 border-t border-border px-5 py-3 first:border-t-0">
            <div className="min-w-0 flex-1">
              <code className="font-mono text-[13px]">{key.prefix}…</code>
              <div className="text-xs text-muted-foreground">Created {relativeTime(key.created_at)}</div>
            </div>
            {key.revoked_at ? (
              <span className="text-xs text-muted-foreground">revoked</span>
            ) : (
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmRevoke(key)}>
                Revoke
              </Button>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={newKey !== null} onOpenChange={(open) => !open && setNewKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New public key</DialogTitle>
            <DialogDescription>Copy it now. It is shown once and stored only as a hash.</DialogDescription>
          </DialogHeader>
          <code className="block break-all rounded-md bg-muted px-3 py-2 font-mono text-[13px]">{newKey}</code>
          <DialogFooter>
            {newKey ? <CopyButton text={newKey} label="Copy key" /> : null}
            <Button onClick={() => setNewKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmRevoke !== null} onOpenChange={(open) => !open && setConfirmRevoke(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke this key?</DialogTitle>
            <DialogDescription>Apps still using {confirmRevoke?.prefix}… will stop being able to send feedback.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRevoke(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                const key = confirmRevoke;
                if (!key) return;
                startTransition(async () => {
                  const result = await revokeKey(projectId, key.id);
                  if ("error" in result) toast.error(`Could not revoke (${result.error}).`);
                  else toast.success("Key revoked.");
                  setConfirmRevoke(null);
                });
              }}
            >
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
