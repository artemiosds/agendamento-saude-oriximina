import { WifiOff, Zap } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useLiteMode } from "@/hooks/useLiteMode";

/**
 * Discreet top banner. Shows when:
 *  - the browser loses connectivity, or
 *  - Lite Mode is active (low-resource devices) — informs the user once.
 */
export function SystemStatusBanner() {
  const online = useOnlineStatus();
  const { active: lite, source, setLite } = useLiteMode();

  if (online && !lite) return null;

  if (!online) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="w-full bg-warning/15 text-warning-foreground/90 border-b border-warning/30 px-3 py-1.5 text-xs flex items-center gap-2 justify-center"
      >
        <WifiOff className="h-3.5 w-3.5" />
        <span className="font-medium">Sem conexão.</span>
        <span className="opacity-80">Suas alterações ficam salvas localmente e serão sincronizadas quando voltar.</span>
      </div>
    );
  }

  // Lite mode notice (subtle, dismissible by user via toggle)
  return (
    <div
      role="status"
      className="w-full bg-muted/60 text-muted-foreground border-b border-border px-3 py-1 text-[11px] flex items-center gap-2 justify-center"
    >
      <Zap className="h-3 w-3" />
      <span>Modo leve {source === "auto" ? "(automático)" : "ativo"} — visuais simplificados para melhor performance.</span>
      {source === "auto" && (
        <button
          type="button"
          onClick={() => setLite(false)}
          className="underline hover:text-foreground"
        >
          Desativar
        </button>
      )}
    </div>
  );
}

export default SystemStatusBanner;
