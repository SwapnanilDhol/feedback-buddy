import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="mb-2 h-5 w-24" />
      <div className="mb-5 flex items-center gap-3.5">
        <Skeleton className="size-11 rounded-[22%]" />
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>
      <div className="rounded-lg border border-border">
        <div className="flex gap-2 border-b border-border p-3">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 flex-1" />
        </div>
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 border-t border-border px-4 py-3 first:border-t-0">
            <Skeleton className="size-3.5 rounded-full" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
