import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
      <ChevronLeft className="size-3.5" />
      <span>{label}</span>
    </Link>
  );
}

export function PageHeader({ crumb, title, meta, icon, children }: { crumb?: React.ReactNode; title: string; meta?: React.ReactNode; icon?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-5 grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:gap-4">
      <div className="min-w-0">
        <div className="mb-2 flex h-5 items-center text-[12.5px] leading-5">{crumb}</div>
        <div className="flex min-h-12 items-center gap-3.5">
          {icon}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold leading-7 tracking-tight">{title}</h1>
            <div className="h-5 truncate text-[13px] leading-5 text-muted-foreground">{meta}</div>
          </div>
        </div>
      </div>
      {children ? <div className="flex items-center gap-2 md:pb-2">{children}</div> : null}
    </div>
  );
}
