import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true">
      <div className="mb-5 h-5 w-24"><Skeleton className="h-5 w-24" /></div>
      <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[68px] rounded-lg" />
        ))}
      </div>
      <Skeleton className="mb-5 h-[260px] rounded-lg" />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-[62px] rounded-lg" />
        ))}
      </div>
    </div>
  );
}
