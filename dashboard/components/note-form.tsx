"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { saveNote } from "@/app/(app)/p/[id]/f/[fid]/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function NoteForm({ projectId, feedbackId, note }: { projectId: string; feedbackId: string; note: string }) {
  const [value, setValue] = useState(note);
  const [pending, startTransition] = useTransition();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveNote(projectId, feedbackId, value);
          if ("error" in result) toast.error(`Could not save the note (${result.error}).`);
          else toast.success("Note saved.");
        });
      }}
    >
      <Textarea value={value} onChange={(event) => setValue(event.target.value)} rows={3} maxLength={4000} placeholder="Only visible here and in the admin API." />
      <div className="mt-3">
        <Button type="submit" variant="outline" size="sm" disabled={pending || value === note}>
          Save note
        </Button>
      </div>
    </form>
  );
}
