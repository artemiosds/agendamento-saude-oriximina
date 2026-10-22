import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface PendingCycle { cycle: { id: string; total_sessions: number }; patient_name: string; registered_sessions: number; issues: string[] }

/** On-demand, paginated and read-only. Authorization is also enforced by the RPC. */
export function TreatmentIntegrityReview({ open, onOpenChange, isMaster, onSelect }: {
  open: boolean; onOpenChange: (open: boolean) => void; isMaster: boolean;
  onSelect?: (cycle: any) => void;
}) {
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<PendingCycle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || !isMaster) return;
    let stale = false;
    setLoading(true);
    setError('');
    void Promise.resolve((supabase as any).rpc('get_treatment_integrity_pending', { p_page: page, p_limit: 20 }))
      .then(({ data, error }) => {
        if (stale) return;
        if (error) { setError('Não foi possível consultar as pendências. Verifique se a validação de integridade foi ativada no banco.'); setRows([]); }
        else setRows(data || []);
      })
      .catch(() => { if (!stale) setError('Falha de conexão ao consultar as pendências.'); })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [open, isMaster, page]);
  if (!isMaster) return null;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle className="text-[#2A6F97]">Pendências de integridade — revisão Master</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">Consulta sem alterações. Nenhuma sessão ou agendamento será criado, excluído, renumerado ou vinculado automaticamente.</p>
      {loading ? <p role="status">Consultando…</p> : error ? <p role="alert">{error}</p> : rows.length === 0 ? <p>Nenhuma pendência nesta página.</p> : rows.map((row) => <div key={row.cycle.id} className="rounded-lg border border-amber-500/40 p-3 space-y-1">
        <p className="font-medium">{row.patient_name}</p>
        <p>{row.registered_sessions} de {row.cycle.total_sessions} sessões registradas</p>
        {row.issues.map((issue, index) => <p key={index} className="text-sm">{issue}</p>)}
        {onSelect && <Button variant="outline" size="sm" onClick={() => { onSelect(row.cycle); onOpenChange(false); }}>Abrir ciclo para conferência</Button>}
      </div>)}
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" disabled={loading || page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
        <span>Página {page + 1}</span>
        <Button variant="outline" disabled={loading || !!error || rows.length < 20} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
