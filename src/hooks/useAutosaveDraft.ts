import { useEffect, useRef, useState, useCallback } from "react";

const PREFIX = "draft:";

function readDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeDraft<T>(key: string, value: T) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota / serialization error — ignore */
  }
}

/**
 * Lightweight autosave for form values.
 *
 * - Persists `value` to localStorage under `draft:<key>` after `debounceMs`.
 * - Survives network loss, accidental refresh, or chunk reload.
 * - Caller decides when to clear (after successful submit) via `clear()`.
 *
 * Usage:
 *   const draft = useAutosaveDraft("prontuario-123", form);
 *   useEffect(() => { if (draft.restored) setForm(draft.restored); }, []);
 *   ...
 *   await save(form); draft.clear();
 */
export function useAutosaveDraft<T>(key: string, value: T, debounceMs = 800) {
  const [restored] = useState<T | null>(() => readDraft<T>(key));
  const firstRun = useRef(true);

  useEffect(() => {
    // Skip writing the very first render (it would just rewrite restored data).
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const handle = window.setTimeout(() => writeDraft(key, value), debounceMs);
    return () => window.clearTimeout(handle);
  }, [key, value, debounceMs]);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  }, [key]);

  return { restored, clear };
}
