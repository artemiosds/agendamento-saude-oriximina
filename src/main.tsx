import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { runPhoneNormalizationMigration } from "@/lib/phoneNormalizationMigration";

// Run one-time phone normalization on startup (idempotent)
runPhoneNormalizationMigration();

// Global handler: catches chunk-load failures that escape React's boundary
// (e.g. unhandled promise rejections from dynamic imports after a fresh deploy)
function isChunkLoadMessage(message: string): boolean {
  return (
    message.includes('dynamically imported module') ||
    message.includes('Failed to fetch') ||
    message.includes('Loading chunk') ||
    message.includes('Loading CSS chunk') ||
    message.includes('Importing a module script failed')
  );
}

function maybeReloadOnce() {
  const key = 'chunk_global_reload';
  const last = sessionStorage.getItem(key);
  const now = Date.now();
  if (!last || now - Number(last) > 15_000) {
    sessionStorage.setItem(key, String(now));
    window.location.reload();
  }
}

window.addEventListener('unhandledrejection', (event) => {
  const message = String((event.reason as any)?.message || event.reason || '');
  if (isChunkLoadMessage(message)) {
    event.preventDefault();
    maybeReloadOnce();
  }
});

window.addEventListener('error', (event) => {
  const message = String(event.message || (event.error as any)?.message || '');
  if (isChunkLoadMessage(message)) {
    event.preventDefault();
    maybeReloadOnce();
  }
});

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
