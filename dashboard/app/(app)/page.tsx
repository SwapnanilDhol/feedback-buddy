import type { Metadata } from "next";
import Link from "next/link";

import { AppIcon } from "@/components/app-icon";
import { IssueRow } from "@/components/issue-row";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { api, type Feedback, type ProjectWithCounts } from "@/lib/api";

export const metadata: Metadata = { title: "Overview" };

function weekAgoMs(): number {
  return Date.now() - 7 * 24 * 60 * 60 * 1000;
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "accent" | "warn" }) {
  const color = tone === "accent" && value > 0 ? "text-blue-600 dark:text-blue-400" : tone === "warn" && value > 0 ? "text-red-600 dark:text-red-400" : "";
  return (
    <Card className="gap-0.5 px-4 py-3.5">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold leading-tight tabular-nums tracking-tight ${color}`}>{value}</div>
    </Card>
  );
}

export default async function OverviewPage() {
  const projects = await api.projects();
  const lists = await Promise.all(projects.map((project) => api.feedbackList(project.id, { limit: 50 }).then((r) => r.feedback)));
  const all = lists.flat();
  const byId = new Map(projects.map((project) => [project.id, project]));
  const weekAgo = weekAgoMs();
  const open = (item: Feedback) => item.status === "todo" || item.status === "in_progress";
  const stats = {
    open: projects.reduce((sum, project) => sum + project.counts.todo + project.counts.in_progress, 0),
    todo: projects.reduce((sum, project) => sum + project.counts.todo, 0),
    openBugs: all.filter((item) => item.category === "bug" && open(item)).length,
    week: all.filter((item) => Date.parse(item.created_at) >= weekAgo).length,
    awaitingReply: all.filter((item) => open(item) && item.reply_email).length,
  };
  const latest = all.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 12);

  return (
    <>
      <PageHeader title="Overview" meta={`${projects.length} ${projects.length === 1 ? "app" : "apps"} · ${stats.open} open · ${stats.todo} to do`} />
      <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3">
        <Stat label="Open" value={stats.open} tone="accent" />
        <Stat label="Open bugs" value={stats.openBugs} tone="warn" />
        <Stat label="Last 7 days" value={stats.week} />
        <Stat label="Awaiting reply" value={stats.awaitingReply} />
      </div>

      <div className="mb-2.5 flex items-baseline gap-2.5">
        <h2 className="text-[13px] font-semibold">Latest</h2>
        <span className="text-xs text-muted-foreground">across all apps</span>
      </div>
      <Card className="mb-5 gap-0 overflow-hidden py-0">
        {latest.length === 0 ? (
          <p className="px-5 py-9 text-center text-[13.5px] text-muted-foreground">
            {projects.length === 0 ? "Add an app to start receiving feedback." : "No feedback yet. It will show up here the moment it arrives."}
          </p>
        ) : (
          <ul>
            {latest.map((item) => {
              const project = byId.get(item.project_id) as ProjectWithCounts;
              return <IssueRow key={item.id} feedback={item} href={`/p/${project.id}/f/${item.id}`} app={project} />;
            })}
          </ul>
        )}
      </Card>

      <div className="mb-2.5 flex items-baseline gap-2.5">
        <h2 className="text-[13px] font-semibold">Apps</h2>
        <Link href="/apps/new" className="text-xs text-muted-foreground hover:text-foreground">
          New app
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/p/${project.id}`}
            className="grid grid-cols-[36px_minmax(0,1fr)] items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3 hover:bg-muted/60"
            title={`${project.counts.todo} to do · ${project.counts.in_progress} in progress · ${project.counts.done} done · ${project.counts.wont_do} won't do`}
          >
            <AppIcon project={project} size="lg" />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 truncate text-[13.5px] font-medium">
                {project.name} <span className="font-mono text-[11px] font-normal text-muted-foreground">{project.key}</span>
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {project.counts.todo > 0 ? <b className="font-semibold text-blue-600 dark:text-blue-400">{project.counts.todo} to do</b> : "0 to do"}
                {project.counts.in_progress > 0 ? ` · ${project.counts.in_progress} in progress` : ""}
                {project.counts.todo === 0 && project.counts.in_progress === 0 ? ` · ${project.counts.done} done` : ""}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
