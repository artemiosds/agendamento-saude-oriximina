import { startTransition, useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';

const DEBOUNCE_MS = 350;

/**
 * Buffer exclusivo do PTS. O DebouncedTextarea em modo buffered entrega cada
 * tecla ao ref sem re-renderizar o formulário. A publicação ao React ocorre
 * após a pausa; as ações explícitas leem o snapshot síncrono (mesmo sem blur).
 */
export function usePtsDebouncedForm<T extends object>(initial: T) {
  const [value, setRendered] = useState(initial);
  const [resetKey, setResetKey] = useState(0);
  const latest = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => cancelTimer, [cancelTimer]);

  const read = useCallback(() => latest.current, []);
  const flush = useCallback(() => {
    cancelTimer();
    const snapshot = latest.current;
    setRendered(snapshot);
    return snapshot;
  }, [cancelTimer]);

  // Atualizações não textuais preservam o buffer; substituições explícitas
  // (novo registro, restauração, descarte) invalidam a edição anterior.
  const setValue = useCallback((action: SetStateAction<T>) => {
    cancelTimer();
    const functional = typeof action === 'function';
    const next = functional ? (action as (previous: T) => T)(latest.current) : action as T;
    latest.current = next;
    setRendered(next);
    if (!functional) setResetKey(key => key + 1);
  }, [cancelTimer]);

  const setText = useCallback(<K extends keyof T>(field: K, text: T[K]) => {
    latest.current = { ...latest.current, [field]: text };
    cancelTimer();
    timer.current = setTimeout(() => {
      timer.current = null;
      const snapshot = latest.current;
      startTransition(() => setRendered(snapshot));
    }, DEBOUNCE_MS);
  }, [cancelTimer]);

  return { value, setValue, setText, read, flush, resetKey };
}
