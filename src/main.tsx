import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Catch unhandled promise rejections
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
});

// Catch runtime errors
window.addEventListener("error", (event) => {
  console.error("Runtime error:", event.error);
});

const rootElement = document.getElementById("root");

if (!rootElement) {
  console.error("Root element not found!");
} else {
  try {
    createRoot(rootElement).render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );
  } catch (err) {
    console.error("Failed to render app:", err);
    rootElement.innerHTML = `
      <div style="padding: 2rem; font-family: sans-serif;">
        <h1>Erro ao carregar aplicação</h1>
        <p>Verifique o console para mais detalhes.</p>
        <pre style="background: #f5f5f5; padding: 1rem; overflow: auto;">${err instanceof Error ? err.message : String(err)}</pre>
      </div>
    `;
  }
}