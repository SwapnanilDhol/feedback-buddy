"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteFeedback } from "@/app/(app)/p/[id]/f/[fid]/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function DeleteFeedbackButton({ projectId, feedbackId }: { projectId: string; feedbackId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this feedback?</DialogTitle>
          <DialogDescription>The message and its image are removed permanently. This cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteFeedback(projectId, feedbackId);
                if (result && "error" in result) toast.error(`Could not delete (${result.error}).`);
              })
            }
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
