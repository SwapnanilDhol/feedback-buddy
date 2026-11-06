import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="mb-2 h-5 w-32" />
      <div className="mb-5 flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-8 w-32" />
      </div>
      <Skeleton className="mb-4 h-28 w-full rounded-lg" />
      <Skeleton className="mb-4 h-44 w-full rounded-lg" />
      <Skeleton className="h-36 w-full rounded-lg" />
    </div>
  );
}
