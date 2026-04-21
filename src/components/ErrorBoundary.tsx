import React from "react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryState {
  hasError: boolean;
  isChunkError: boolean;
}

function isChunkLoadError(error: unknown): boolean {
  const message = String((error as any)?.message || error || '');
  return (
    message.includes('dynamically imported module') ||
    message.includes('Failed to fetch') ||
    message.includes('Loading chunk') ||
    message.includes('Loading CSS chunk') ||
    message.includes('Importing a module script failed')
  );
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false, isChunkError: false };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, isChunkError: isChunkLoadError(error) };
  }

  public componentDidCatch(error: Error) {
    console.error("Unhandled render error:", error);

    // Auto-reload once on chunk load failures (stale deploy)
    if (isChunkLoadError(error)) {
      const key = "chunk_error_reload";
      const last = sessionStorage.getItem(key);
      const now = Date.now();
      if (!last || now - Number(last) > 15_000) {
        sessionStorage.setItem(key, String(now));
        // Hard reload to bypass cached HTML pointing to stale chunks
        window.location.reload();
      }
    }
  }

  private handleReload = () => {
    sessionStorage.removeItem("chunk_reload_ts");
    sessionStorage.removeItem("chunk_error_reload");
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const title = this.state.isChunkError
        ? "Atualizando o sistema..."
        : "Ocorreu um erro inesperado";
      const description = this.state.isChunkError
        ? "Detectamos uma nova versão. Recarregando para aplicar as atualizações."
        : "A tela foi recuperada com segurança. Clique para recarregar e continuar.";

      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center space-y-4">
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
            <Button onClick={this.handleReload} className="w-full">
              Recarregar agora
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
