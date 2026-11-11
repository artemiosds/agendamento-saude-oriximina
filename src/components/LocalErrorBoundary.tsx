import React from "react";

interface Props { children: React.ReactNode; onReset?: () => void; label?: string }
interface State { hasError: boolean }

/** Barreira local: falha num modal não derruba a tela inteira. */
export class LocalErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(): State { return { hasError: true }; }
  componentDidCatch(error: unknown) { console.error("[LocalErrorBoundary]", this.props.label, error); }
  reset = () => { this.setState({ hasError: false }); this.props.onReset?.(); };
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div role="alert" className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
        <div className="max-w-sm rounded-lg border bg-card p-5 text-card-foreground shadow-lg space-y-3">
          <p className="font-semibold">Não foi possível abrir {this.props.label || "esta janela"}.</p>
          <p className="text-sm text-muted-foreground">Seu prontuário e o que foi digitado continuam salvos na tela.</p>
          <button onClick={this.reset} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Fechar</button>
        </div>
      </div>
    );
  }
}
export default LocalErrorBoundary;
