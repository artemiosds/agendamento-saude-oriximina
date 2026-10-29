import { memo, useSyncExternalStore } from 'react';
import { AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';

type Status = 'idle' | 'saving' | 'saved' | 'error';
/** One store per editor instance; status updates never set state on ProntuarioPage. */
export function createAutosaveIndicator() {
  let snapshot: { status: Status; at: Date | null } = { status: 'idle', at: null };
  const listeners = new Set<() => void>();
  const publish = (next: typeof snapshot) => {
    if (next.status === snapshot.status && next.at === snapshot.at) return;
    snapshot = next;
    listeners.forEach(listener => listener());
  };
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    setStatus: (status: Status) => publish({ ...snapshot, status }),
    setAt: (at: Date | null) => publish({ ...snapshot, at }),
  };
}
export type AutosaveIndicator = ReturnType<typeof createAutosaveIndicator>;

export default memo(function AutosaveBadge({ indicator }: { indicator: AutosaveIndicator }) {
  const { status, at } = useSyncExternalStore(indicator.subscribe, indicator.getSnapshot, indicator.getSnapshot);
  return <div className="text-xs flex items-center gap-1.5" aria-live="polite">
    {status === 'saving' && <span className="text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Salvando…</span>}
    {status === 'saved' && at && <span className="text-success flex items-center gap-1.5"><CheckCircle className="w-3 h-3" /> Salvo automaticamente às {at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
    {status === 'error' && <span className="text-destructive flex items-center gap-1.5"><AlertTriangle className="w-3 h-3" /> Falha ao salvar — tentaremos novamente</span>}
  </div>;
});
