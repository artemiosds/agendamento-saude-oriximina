import { useCallback, useRef, useState } from 'react';

/**
 * Prevents double-clicks and provides loading state for async actions.
 * Usage:
 *   const { guard, loading } = useActionGuard();
 *   <Button disabled={loading} onClick={guard(async () => { ... })}>
 */
export function useActionGuard(debounceMs = 300) {
  const [loading, setLoading] = useState(false);
  const lastCallRef = useRef(0);

  const guard = useCallback(
    <T>(fn: () => Promise<T>) => {
      return async () => {
        const now = Date.now();
        if (now - lastCallRef.current < debounceMs) return;
        if (loading) return;
        lastCallRef.current = now;
        setLoading(true);
        try {
          await fn();
        } finally {
          setLoading(false);
        }
      };
    },
    [loading, debounceMs],
  );

  return { guard, loading };
}
