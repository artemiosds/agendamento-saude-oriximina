import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Title */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-60 rounded" />
        <Skeleton className="h-4 w-40 rounded" />
      </div>

      {/* Stat cards row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={`s1-${i}`} className="border-0 shadow-card">
            <CardContent className="p-5 flex items-center gap-4">
              <Skeleton className="h-12 w-12 rounded-xl shrink-0" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-3 w-20 rounded" />
                <Skeleton className="h-6 w-14 rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Stat cards row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={`s2-${i}`} className="border-0 shadow-card">
            <CardContent className="p-5 flex items-center gap-4">
              <Skeleton className="h-12 w-12 rounded-xl shrink-0" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-3 w-20 rounded" />
                <Skeleton className="h-6 w-14 rounded" />
                <Skeleton className="h-2 w-24 rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-0 shadow-card">
          <CardContent className="p-5">
            <Skeleton className="h-5 w-48 rounded mb-4" />
            <Skeleton className="h-[250px] w-full rounded" />
          </CardContent>
        </Card>
        <Card className="border-0 shadow-card">
          <CardContent className="p-5">
            <Skeleton className="h-5 w-48 rounded mb-4" />
            <Skeleton className="h-[250px] w-full rounded" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
