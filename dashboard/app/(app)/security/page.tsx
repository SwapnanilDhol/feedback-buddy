import type { Metadata } from "next";

import { BackLink, PageHeader } from "@/components/page-header";
import { PasskeysPanel } from "@/components/passkeys-panel";
import { Card } from "@/components/ui/card";
import { passkeysOrEmpty } from "@/lib/api";
import { relyingParty } from "@/lib/auth-helpers";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage() {
  let passkeys: Awaited<ReturnType<typeof passkeysOrEmpty>> = [];
  let available = true;
  try {
    passkeys = await passkeysOrEmpty((await relyingParty()).rp_id);
  } catch {
    available = false;
  }
  return (
    <>
      <PageHeader crumb={<BackLink href="/" label="Overview" />} title="Security" meta="How you sign in. Apps use project keys and never see this." />
      <PasskeysPanel passkeys={passkeys} available={available} />
      <Card className="gap-0 py-0">
        <div className="border-b border-border px-5 py-2.5 text-sm font-semibold">Password</div>
        <p className="px-5 py-4 text-[13.5px] text-muted-foreground">
          The operator password is the <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">ADMIN_PASSWORD</code> secret on the Worker and remains the recovery path. Rotate it with{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">npx wrangler secret put ADMIN_PASSWORD</code>. Scripts and agents use <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">ADMIN_API_TOKEN</code> and are unaffected by passkeys.
        </p>
      </Card>
    </>
  );
}
