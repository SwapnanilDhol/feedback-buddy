"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { redeliver } from "@/app/(app)/p/[id]/f/[fid]/actions";
import { Button } from "@/components/ui/button";

export function RedeliverButton({ projectId, feedbackId }: { projectId: string; feedbackId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await redeliver(projectId, feedbackId);
          if ("error" in result) toast.error(`Could not retry (${result.error}).`);
          else toast.success(result.requeued ? `Retried ${result.requeued} deliver${result.requeued === 1 ? "y" : "ies"}.` : "Nothing to retry.");
        })
      }
    >
      Retry failed
    </Button>
  );
}
