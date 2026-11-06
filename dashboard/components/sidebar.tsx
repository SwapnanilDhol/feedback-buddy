"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Plus, ShieldCheck } from "lucide-react";

import { AppIcon } from "@/components/app-icon";
import type { ProjectWithCounts } from "@/lib/api";
import { cn } from "@/lib/utils";

function Item({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13.5px] text-foreground/80 hover:bg-muted hover:text-foreground md:h-8",
        active && "bg-muted font-medium text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

export function Sidebar({ projects }: { projects: ProjectWithCounts[] }) {
  const pathname = usePathname();
  return (
    <aside className="border-b border-border bg-sidebar px-3 pt-6 pb-3 md:sticky md:top-0 md:flex md:h-screen md:w-[232px] md:shrink-0 md:flex-col md:overflow-y-auto md:border-r md:border-b-0">
      <div className="mb-5 flex items-center justify-between px-2">
        <Link href="/" className="text-sm font-semibold leading-5">
          FeedbackBuddy
        </Link>
        <form action="/api/auth/logout" method="post" className="md:hidden">
          <button className="text-xs text-muted-foreground hover:text-foreground" type="submit">
            Sign out
          </button>
        </form>
      </div>
      <nav className="flex flex-wrap gap-1 md:flex-col md:gap-0.5">
        <Item href="/" active={pathname === "/"}>
          <LayoutGrid className="size-4 text-muted-foreground" />
          <span>Overview</span>
        </Item>
        <div className="hidden px-2 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:block">Apps</div>
        {projects.map((project) => (
          <Item key={project.id} href={`/p/${project.id}`} active={pathname.startsWith(`/p/${project.id}`)}>
            <AppIcon project={project} />
            <span className="truncate">{project.name}</span>
            {project.counts.todo > 0 ? <span className="ml-auto text-xs font-semibold tabular-nums text-blue-600 dark:text-blue-400">{project.counts.todo}</span> : null}
          </Item>
        ))}
        <Item href="/apps/new" active={pathname === "/apps/new"}>
          <span className="grid size-5 place-items-center rounded-[22%] border border-dashed border-border text-muted-foreground">
            <Plus className="size-3" />
          </span>
          <span className="text-muted-foreground">New app</span>
        </Item>
        <div className="hidden px-2 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:block">Account</div>
        <Item href="/security" active={pathname === "/security"}>
          <ShieldCheck className="size-4 text-muted-foreground" />
          <span>Security</span>
        </Item>
      </nav>
      <form action="/api/auth/logout" method="post" className="mt-auto hidden border-t border-border pt-3 md:block">
        <button className="h-8 rounded-md px-2 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground" type="submit">
          Sign out
        </button>
      </form>
    </aside>
  );
}

/** Same footprint as the real sidebar, shown while projects load. */
export function SidebarSkeleton() {
  return (
    <aside className="shrink-0 border-b border-border bg-card px-3 pt-6 pb-4 md:sticky md:top-0 md:h-screen md:w-[232px] md:border-r md:border-b-0" aria-hidden="true">
      <div className="px-2 pb-5 text-sm font-semibold">FeedbackBuddy</div>
      <div className="space-y-1.5 px-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-6 w-full animate-pulse rounded-md bg-muted" style={{ width: `${70 - (index % 3) * 10}%` }} />
        ))}
      </div>
    </aside>
  );
}
