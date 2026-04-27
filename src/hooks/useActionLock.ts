import { useCallback, useRef, useState } from "react";

/**
 * Anti double-click / double-submit hook.
 *
 * Wraps an async handler and guarantees only one execution runs at a time,
 * regardless of how fast the user clicks the button. Returns an `isLocked`
 * flag that can be used to disable the button and show loading state.
 *
 * Usage:
 *   const { run, isLocked } = useActionLock();
 *   <Button disabled={isLocked} onClick={() => run(async () => { await save(); })}>
 *     {isLocked ? "Salvando..." : "Salvar"}
 *   </Button>
 *
 * Or wrap a handler:
 *   const handleSave = useActionLock().wrap(async (data) => { await save(data); });
 */
export function useActionLock() {
  const lockedRef = useRef(false);
  const [isLocked, setIsLocked] = useState(false);

  const run = useCallback(async <T,>(fn: () => Promise<T> | T): Promise<T | undefined> => {
    if (lockedRef.current) return undefined;
    lockedRef.current = true;
    setIsLocked(true);
    try {
      return await fn();
    } finally {
      lockedRef.current = false;
      setIsLocked(false);
    }
  }, []);

  const wrap = useCallback(
    <Args extends unknown[], R>(fn: (...args: Args) => Promise<R> | R) => {
      return async (...args: Args): Promise<R | undefined> => {
        if (lockedRef.current) return undefined;
        lockedRef.current = true;
        setIsLocked(true);
        try {
          return await fn(...args);
        } finally {
          lockedRef.current = false;
          setIsLocked(false);
        }
      };
    },
    [],
  );

  return { run, wrap, isLocked };
}
