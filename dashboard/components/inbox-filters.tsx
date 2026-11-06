"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Category, Status } from "@/lib/api";
import { categories, categoryLabels, statusLabels, statuses } from "@/lib/format";

const ANY = "__any__";

export function InboxFilters({ projectId, projectKey, status, category, appVersion, q, versions }: { projectId: string; projectKey: string; status: string; category: string; appVersion: string; q: string; versions: string[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState(q);
  const filtered = status !== "open" || category || appVersion || q;

  function apply(next: Partial<{ status: string; category: string; app_version: string; q: string }>) {
    const values = { status, category, app_version: appVersion, q, ...next };
    const params = new URLSearchParams();
    if (values.status !== "open") params.set("status", values.status);
    if (values.category) params.set("category", values.category);
    if (values.app_version) params.set("app_version", values.app_version);
    if (values.q) params.set("q", values.q);
    startTransition(() => router.push(`/p/${projectId}${params.size ? `?${params}` : ""}`));
  }

  return (
    <form
      className="grid grid-cols-2 gap-2 border-b border-border p-3 md:grid-cols-[120px_130px_130px_minmax(0,1fr)_auto] md:items-center"
      onSubmit={(event) => {
        event.preventDefault();
        apply({ q: query.trim() });
      }}
    >
      <Select value={status} onValueChange={(value) => apply({ status: value === ANY ? "" : value })}>
        <SelectTrigger size="sm" className="w-full" aria-label="Status">
          <SelectValue>{status === "open" ? "Open" : status === "" ? "Any status" : statusLabels[status as Status]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value={ANY}>Any status</SelectItem>
          {statuses.map((value) => (
            <SelectItem key={value} value={value}>
              {statusLabels[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={category || ANY} onValueChange={(value) => apply({ category: value === ANY ? "" : value })}>
        <SelectTrigger size="sm" className="w-full" aria-label="Category">
          <SelectValue>{category ? categoryLabels[category as Category] : "Any category"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any category</SelectItem>
          {categories.map((value) => (
            <SelectItem key={value} value={value}>
              {categoryLabels[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={appVersion || ANY} onValueChange={(value) => apply({ app_version: value === ANY ? "" : value })}>
        <SelectTrigger size="sm" className="w-full" aria-label="Version">
          <SelectValue>{appVersion || "Any version"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any version</SelectItem>
          {versions.map((value) => (
            <SelectItem key={value} value={value}>
              {value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input className="col-span-2 h-8 md:col-span-1" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search message, name, email or ${projectKey}-12`} aria-label="Search" />
      <div className="col-span-2 flex h-5 justify-end md:col-span-1 md:h-auto">
        {filtered ? (
          <Link href={`/p/${projectId}`} className="text-xs text-muted-foreground hover:text-foreground">
            Clear
          </Link>
        ) : null}
      </div>
    </form>
  );
}
