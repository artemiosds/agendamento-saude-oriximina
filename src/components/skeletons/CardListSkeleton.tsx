import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

interface CardListSkeletonProps {
  count?: number;
  /** Show a search bar skeleton at the top */
  showSearch?: boolean;
  /** Show filter chips skeleton */
  showFilters?: boolean;
}

export function CardListSkeleton({ count = 4, showSearch = true, showFilters = false }: CardListSkeletonProps) {
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {showSearch && (
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1 max-w-sm rounded-md" />
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
      )}
      {showFilters && (
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={`f-${i}`} className="h-8 w-24 rounded-full" />
          ))}
        </div>
      )}
      {Array.from({ length: count }).map((_, i) => (
        <Card key={`card-${i}`} className="border-0 shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/5 rounded" />
                <Skeleton className="h-3 w-2/5 rounded" />
              </div>
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
