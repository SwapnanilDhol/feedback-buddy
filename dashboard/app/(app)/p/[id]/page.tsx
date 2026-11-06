import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppIcon } from "@/components/app-icon";
import { InboxFilters } from "@/components/inbox-filters";
import { IssueRow } from "@/components/issue-row";
import { BackLink, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApiError, api, type Category, type StatusFilter } from "@/lib/api";
import { categories, statuses } from "@/lib/format";

type Search = { status?: string; category?: string; app_version?: string; q?: string; cursor?: string };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const { project } = await api.project(id);
    return { title: project.name };
  } catch {
    return { title: "Not found" };
  }
}

export default async function InboxPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const statusParam = search.status === undefined ? "open" : search.status;
  const status = (["open", ...statuses] as string[]).includes(statusParam) ? (statusParam as StatusFilter) : undefined;
  const category = categories.includes(search.category as Category) ? (search.category as Category) : undefined;
  let project;
  try {
    project = (await api.project(id)).project;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const [{ feedback, next_cursor }, versions] = await Promise.all([
    api.feedbackList(id, { status, category, app_version: search.app_version, q: search.q, cursor: search.cursor, limit: 50 }),
    api.feedbackList(id, { limit: 100 }).then((r) => [...new Set(r.feedback.map((item) => item.context.app_version))].sort().reverse()),
  ]);
  const filtered = Boolean((status && status !== "open") || category || search.app_version || search.q);
  const older = new URLSearchParams();
  if (statusParam !== "open") older.set("status", statusParam);
  if (category) older.set("category", category);
  if (search.app_version) older.set("app_version", search.app_version);
  if (search.q) older.set("q", search.q);
  if (next_cursor) older.set("cursor", next_cursor);

  return (
    <>
      <PageHeader crumb={<BackLink href="/" label="Overview" />} title={project.name} meta={project.bundle_id ?? project.slug} icon={<AppIcon project={project} size="xl" />}>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/p/${project.id}/settings`}>Settings</Link>
        </Button>
      </PageHeader>
      <Card className="gap-0 overflow-hidden py-0">
        <InboxFilters projectId={project.id} projectKey={project.key} status={statusParam} category={category ?? ""} appVersion={search.app_version ?? ""} q={search.q ?? ""} versions={versions} />
        {feedback.length === 0 ? (
          <p className="px-5 py-9 text-center text-[13.5px] text-muted-foreground">
            {filtered ? "No feedback matches these filters." : status === "open" ? "Nothing open. Feedback from the app will appear here as it arrives." : "Feedback from the app will appear here as it arrives."}
          </p>
        ) : (
          <ul>
            {feedback.map((item) => (
              <IssueRow key={item.id} feedback={item} href={`/p/${project.id}/f/${item.id}`} />
            ))}
          </ul>
        )}
        {next_cursor ? (
          <div className="flex justify-center border-t border-border p-3">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/p/${project.id}?${older}`}>Older</Link>
            </Button>
          </div>
        ) : null}
      </Card>
    </>
  );
}
