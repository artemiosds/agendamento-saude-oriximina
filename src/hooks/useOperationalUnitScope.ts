import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** A view-only filter: untrusted URL values never widen the user's unit scope. */
export function useOperationalUnitScope(units: Array<{ id: string }>, enabled: boolean) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('unidade');
  const unitId = enabled && requested && units.some(unit => unit.id === requested) ? requested : 'all';

  const setUnitId = useCallback((nextId: string) => {
    if (!enabled || (nextId !== 'all' && !units.some(unit => unit.id === nextId))) return;
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      if (nextId === 'all') next.delete('unidade');
      else next.set('unidade', nextId);
      return next;
    }, { replace: true });
  }, [enabled, units, setSearchParams]);

  return { unitId, setUnitId };
}
