import { hue } from "@/lib/format";
import { cn } from "@/lib/utils";

const sizes = { sm: "size-5 rounded-[22%]", md: "size-7 rounded-[22%]", lg: "size-9 rounded-[22%]", xl: "size-11 rounded-[22%]" } as const;

export function AppIcon({ project, size = "sm", className }: { project: { slug: string; name: string; icon_url: string | null }; size?: keyof typeof sizes; className?: string }) {
  return (
    <span className={cn("inline-grid shrink-0 place-items-center overflow-hidden bg-muted ring-1 ring-inset ring-black/5 dark:ring-white/10", sizes[size], className)} aria-hidden="true">
      {project.icon_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- Apple CDN artwork, already sized; avoids the image optimizer on a private dashboard.
        <img src={project.icon_url} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <span className="rounded-full" style={{ width: "35%", height: "35%", background: `hsl(${hue(project.slug)} 55% 50%)` }} />
      )}
    </span>
  );
}
