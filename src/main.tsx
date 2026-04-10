import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { runPhoneNormalizationMigration } from "@/lib/phoneNormalizationMigration";

// Run one-time phone normalization on startup (idempotent)
runPhoneNormalizationMigration();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
