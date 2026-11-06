import type { Status } from "@/lib/api";
import { statusLabels } from "@/lib/format";
import { cn } from "@/lib/utils";

const colors: Record<Status, string> = {
  todo: "text-muted-foreground",
  in_progress: "text-amber-600 dark:text-amber-400",
  done: "text-violet-600 dark:text-violet-400",
  wont_do: "text-muted-foreground",
};

export function StatusIcon({ status, className }: { status: Status; className?: string }) {
  const common = { viewBox: "0 0 16 16", "aria-hidden": true, className: cn("size-3.5 shrink-0", colors[status], className) } as const;
  switch (status) {
    case "todo":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.5 2.2" />
        </svg>
      );
    case "in_progress":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 8V2.6A5.4 5.4 0 0 1 13.4 8Z" fill="currentColor" />
        </svg>
      );
    case "done":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.6" fill="currentColor" />
          <path d="M5 8.2l2 2 4-4.4" fill="none" stroke="var(--background)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "wont_do":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
  }
}

export function StatusBadge({ status, iconOnly, className }: { status: Status; iconOnly?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12.5px] leading-none", colors[status], className)} title={statusLabels[status]}>
      <StatusIcon status={status} />
      {iconOnly ? null : <span>{statusLabels[status]}</span>}
    </span>
  );
}
