import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export function AgendaSkeleton() {
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Skeleton className="h-10 w-10 rounded-md" />
        <Skeleton className="h-10 w-36 rounded-md" />
        <Skeleton className="h-10 w-10 rounded-md" />
        <Skeleton className="h-10 w-40 rounded-md" />
        <Skeleton className="h-10 w-40 rounded-md" />
        <div className="flex-1" />
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>

      {/* Calendar mini */}
      <Skeleton className="h-8 w-64 rounded mb-2" />

      {/* Appointments */}
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="border-0 shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-5 w-14 rounded" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-48 rounded" />
                <Skeleton className="h-3 w-32 rounded" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-8 w-8 rounded" />
                <Skeleton className="h-8 w-8 rounded" />
                <Skeleton className="h-8 w-8 rounded" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
