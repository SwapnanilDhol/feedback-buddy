"use client";

import { useOptimistic, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { setStatus } from "@/app/(app)/p/[id]/f/[fid]/actions";
import { StatusIcon } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Status } from "@/lib/api";
import { statusLabels, statuses } from "@/lib/format";

export function StatusMenu({ projectId, feedbackId, status }: { projectId: string; feedbackId: string; status: Status }) {
  const [optimistic, setOptimistic] = useOptimistic(status);
  const [pending, startTransition] = useTransition();

  function choose(next: Status) {
    if (next === optimistic) return;
    startTransition(async () => {
      setOptimistic(next);
      const result = await setStatus(projectId, feedbackId, next);
      if ("error" in result) toast.error(`Could not update status (${result.error}).`);
      else toast.success(`Marked ${statusLabels[next]}.`);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="min-w-[132px] justify-between" disabled={pending} aria-label="Change status">
          <span className="inline-flex items-center gap-2">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={optimistic} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.12 }} className="inline-flex">
                <StatusIcon status={optimistic} />
              </motion.span>
            </AnimatePresence>
            {statusLabels[optimistic]}
          </span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {statuses.map((value) => (
          <DropdownMenuItem key={value} onSelect={() => choose(value)} className="gap-2">
            <StatusIcon status={value} />
            {statusLabels[value]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
