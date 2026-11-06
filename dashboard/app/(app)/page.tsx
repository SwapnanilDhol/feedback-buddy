import type { Metadata } from "next";
import Link from "next/link";

import { AppIcon } from "@/components/app-icon";
import { IssueRow } from "@/components/issue-row";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { api, type ProjectWithCounts } from "@/lib/api";

export const metadata: Metadata = { title: "Overview" };


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
  const { projects, stats: server, latest } = await api.overview();
  const byId = new Map(projects.map((project) => [project.id, project]));
  const stats = { open: server.open, todo: server.todo, openBugs: server.open_bugs, week: server.last_7_days, awaitingReply: server.awaiting_reply };

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
