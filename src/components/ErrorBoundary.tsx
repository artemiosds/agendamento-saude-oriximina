import React from "react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error) {
    console.error("Unhandled render error:", error);

    // Auto-reload once on chunk load failures (stale deploy)
    const isChunkError =
      error?.message?.includes("dynamically imported module") ||
      error?.message?.includes("Failed to fetch") ||
      error?.message?.includes("Loading chunk") ||
      error?.message?.includes("Loading CSS chunk");

    if (isChunkError) {
      const key = "chunk_error_reload";
      const last = sessionStorage.getItem(key);
      const now = Date.now();
      if (!last || now - Number(last) > 10_000) {
        sessionStorage.setItem(key, String(now));
        window.location.reload();
        return;
      }
    }
  }

  private handleReload = () => {
    // Clear caches and force reload
    sessionStorage.removeItem("chunk_reload");
    sessionStorage.removeItem("chunk_error_reload");
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center space-y-4">
            <h1 className="text-xl font-semibold">Ocorreu um erro inesperado</h1>
            <p className="text-sm text-muted-foreground">
              A tela foi recuperada com segurança. Clique para recarregar e continuar.
            </p>
            <Button onClick={this.handleReload} className="w-full">
              Recarregar
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
