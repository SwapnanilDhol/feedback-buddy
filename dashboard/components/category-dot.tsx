import type { Category } from "@/lib/api";
import { categoryLabels } from "@/lib/format";
import { cn } from "@/lib/utils";

const colors: Record<Category, string> = { feedback: "bg-blue-500", bug: "bg-red-500", idea: "bg-amber-500" };

export function CategoryTag({ category, className }: { category: Category; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground", className)}>
      <span className={cn("size-1.5 rounded-full", colors[category])} />
      {categoryLabels[category]}
    </span>
  );
}
