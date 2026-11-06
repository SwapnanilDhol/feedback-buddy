"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { saveProject } from "@/app/(app)/p/[id]/settings/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Project } from "@/lib/api";

export function ProjectForm({ project }: { project: Project }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(project.name);
  const [bundleId, setBundleId] = useState(project.bundle_id ?? "");
  const [retention, setRetention] = useState(String(project.retention_days));
  return (
    <Card className="gap-0 py-0">
      <div className="border-b border-border px-5 py-2.5 text-sm font-semibold">Project</div>
      <form
        className="px-5 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await saveProject(project.id, { name, bundle_id: bundleId, retention_days: Number(retention) || project.retention_days });
            if ("error" in result) toast.error(`Could not save (${result.error}).`);
            else toast.success("Project saved.");
          });
        }}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_150px]">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bundle_id">Bundle identifier</Label>
            <Input id="bundle_id" value={bundleId} onChange={(e) => setBundleId(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="retention_days">Retention (days)</Label>
            <Input id="retention_days" type="number" min={1} max={365} value={retention} onChange={(e) => setRetention(e.target.value)} />
          </div>
        </div>
        <div className="mt-3">
          <Button type="submit" variant="outline" size="sm" disabled={pending}>Save</Button>
        </div>
      </form>
    </Card>
  );
}
