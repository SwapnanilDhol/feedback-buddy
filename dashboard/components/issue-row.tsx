import Link from "next/link";
import { ImageIcon } from "lucide-react";

import { AppIcon } from "@/components/app-icon";
import { CategoryTag } from "@/components/category-dot";
import { StatusBadge } from "@/components/status-badge";
import type { Feedback, Project } from "@/lib/api";
import { excerpt, relativeTime } from "@/lib/format";

export function IssueRow({ feedback, href, app }: { feedback: Feedback; href: string; app?: Project }) {
  return (
    <li className="border-t border-border first:border-t-0">
      <Link
        href={href}
        className="grid min-h-11 grid-cols-[16px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-4 py-2 hover:bg-muted/60 md:grid-cols-[16px_64px_minmax(0,1fr)_auto] md:py-0"
      >
        <StatusBadge status={feedback.status} iconOnly />
        <span className="hidden font-mono text-xs text-muted-foreground md:block">{feedback.key}</span>
        <span className="issue-title text-sm font-medium">
          {app ? <AppIcon project={app} className="mr-1.5 inline-block align-[-5px]" /> : null}
          <span className="font-mono text-xs text-muted-foreground md:hidden">{feedback.key} </span>
          {excerpt(feedback.message, 140)}
          {feedback.name ? <span className="font-normal text-muted-foreground"> · {feedback.name}</span> : null}
        </span>
        <span className="col-start-2 flex items-center gap-3 text-xs tabular-nums text-muted-foreground md:col-start-auto">
          {feedback.attachment ? <ImageIcon className="size-3.5" aria-label="has image" /> : null}
          <CategoryTag category={feedback.category} />
          <span>{feedback.context.app_version}</span>
          <span>{relativeTime(feedback.created_at)}</span>
        </span>
      </Link>
    </li>
  );
}
