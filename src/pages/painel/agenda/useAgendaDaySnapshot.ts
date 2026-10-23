import { useEffect, useRef } from 'react';

// Keep only a fully loaded snapshot from this date and authorization scope.
// A definitive empty response replaces it. Never reuse a different selection.
export function useAgendaDaySnapshot<T>(scope: string, rows: T[], ready: boolean) {
  const snapshot = useRef<{ scope: string; rows: T[] } | null>(null);
  useEffect(() => {
    if (ready) snapshot.current = { scope, rows };
    else if (snapshot.current?.scope !== scope) snapshot.current = null;
  }, [scope, rows, ready]);
  const retained = !ready && snapshot.current?.scope === scope;
  return { rows: ready ? rows : retained ? snapshot.current!.rows : [], retained };
}
