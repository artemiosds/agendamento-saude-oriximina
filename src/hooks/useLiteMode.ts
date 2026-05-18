import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "lite_mode";
const HTML_CLASS = "lite-mode";

type Source = "user" | "auto" | "off";

interface NavigatorConnectionLike {
  saveData?: boolean;
  effectiveType?: string;
}

function autoDetect(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // 1. User OS-level reduced motion → respect it
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return true;
    // 2. Low device memory (Chrome only) — <= 2GB
    const mem = (navigator as any).deviceMemory;
    if (typeof mem === "number" && mem > 0 && mem <= 2) return true;
    // 3. Save-Data header / slow effective connection
    const conn = (navigator as any).connection as NavigatorConnectionLike | undefined;
    if (conn?.saveData) return true;
    if (conn?.effectiveType && /(^|-)(2g|slow-2g)$/.test(conn.effectiveType)) return true;
    // 4. Low logical cpu count
    if (typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 2) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function readStoredPreference(): boolean | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
    return null;
  } catch {
    return null;
  }
}

function applyHtmlClass(active: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(HTML_CLASS, active);
}

/**
 * Lite Mode — global low-resource flag.
 *
 * - Auto-detected on slow hardware / save-data / reduced-motion.
 * - User can override via toggle (persisted in localStorage).
 * - Applies `.lite-mode` class on <html> so CSS can strip blur,
 *   heavy shadows, gradients and non-essential animations.
 */
export function useLiteMode() {
  const [active, setActive] = useState<boolean>(() => {
    const stored = readStoredPreference();
    if (stored !== null) return stored;
    return autoDetect();
  });
  const [source, setSource] = useState<Source>(() =>
    readStoredPreference() !== null ? "user" : autoDetect() ? "auto" : "off",
  );

  useEffect(() => {
    applyHtmlClass(active);
  }, [active]);

  // React to OS reduced-motion changes while running
  useEffect(() => {
    if (readStoredPreference() !== null) return;
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const handler = () => setActive(autoDetect());
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  const setLite = useCallback((on: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
    setSource("user");
    setActive(on);
  }, []);

  const resetToAuto = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    const auto = autoDetect();
    setSource(auto ? "auto" : "off");
    setActive(auto);
  }, []);

  return { active, source, setLite, resetToAuto, toggle: () => setLite(!active) };
}

/** Apply class on boot, before React mounts, to avoid a visual flash. */
export function bootstrapLiteMode() {
  if (typeof document === "undefined") return;
  const stored = readStoredPreference();
  const on = stored !== null ? stored : autoDetect();
  applyHtmlClass(on);
}
