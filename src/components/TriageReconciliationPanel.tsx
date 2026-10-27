import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAgendamentos } from '@/contexts/AgendamentosContext';
import { useFila } from '@/contexts/FilaContext';
import { supabase } from '@/integrations/supabase/client';
import { confirmCareArrival } from '@/services/careFlowService';
import { nowTimeBrazilStr, todayLocalStr } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface PendingArrival { id: string; pacienteId: string; pacienteNome: string; profissionalNome: string; unidadeId: string; hora: string }

/** Read-only detection; a named operator must explicitly authorize each repair. */
export default function TriageReconciliationPanel() {
  const { user } = useAuth();
  const { agendamentos, applyCareFlowAgendamentoUpdate } = useAgendamentos();
  const { fila, refreshFila } = useFila();
  const [candidates, setCandidates] = useState<PendingArrival[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [verifiedScope, setVerifiedScope] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const allowed = (user?.role === 'master' || ['recepcao', 'recepção'].includes(user?.role || '')) && (user?.usuario === 'admin.sms' || !!user?.unidadeId);
  useEffect(() => {
    if (!allowed) return;
    const refresh = () => setRevision(value => value + 1);
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [allowed]);
  const day = todayLocalStr();
  const scopeKey = `${user?.id || ''}|${user?.unidadeId || ''}|${user?.usuario || ''}|${day}`;
  const localCandidates = useMemo(() => allowed ? agendamentos.filter(a => a.data === day &&
    ['confirmado_chegada', 'chegada_confirmada', 'aguardando_triagem'].includes(a.status) &&
    (user?.usuario === 'admin.sms' || (!!user?.unidadeId && a.unidadeId === user.unidadeId))) : [],
  [allowed, agendamentos, day, user?.usuario, user?.unidadeId]);
  const key = localCandidates.map(a => `${a.id}:${a.status}`).sort().join('|');
  const candidateIds = new Set(localCandidates.map(a => a.id));
  const queueKey = fila.filter(f => candidateIds.has(f.id)).map(f => `${f.id}:${f.status}`).sort().join('|');
  useEffect(() => {
    let active = true;
    if (!allowed) { setMissing([]); return; }
    void (async () => {
      // Read only today's pending arrivals, even when the Agenda displays another month.
      const pending: PendingArrival[] = [];
      for (let from = 0; ; from += 200) {
        let query = supabase.from('agendamentos').select('id,paciente_id,paciente_nome,profissional_nome,unidade_id,hora')
          .eq('data', day).in('status', ['confirmado_chegada', 'chegada_confirmada', 'aguardando_triagem']).order('id').range(from, from + 199);
        if (user?.usuario !== 'admin.sms') query = query.eq('unidade_id', user?.unidadeId || '');
        const { data, error } = await query;
        if (error) throw error;
        if (!data) throw new Error('Não foi possível conferir as chegadas de hoje.');
        pending.push(...data.map(a => ({ id: a.id, pacienteId: a.paciente_id, pacienteNome: a.paciente_nome, profissionalNome: a.profissional_nome, unidadeId: a.unidade_id, hora: a.hora })));
        if (data.length < 200) break;
      }
      const ids = pending.map(a => a.id);
      const existing = new Map<string, string>();
      for (let from = 0; from < ids.length; from += 200) {
        let query = supabase.from('fila_espera').select('id,status').in('id', ids.slice(from, from + 200));
        if (user?.usuario !== 'admin.sms') query = query.eq('unidade_id', user?.unidadeId || '');
        const { data, error } = await query;
        if (error) throw error;
        if (!data) throw new Error('A consulta de reconciliação não retornou dados.');
        data.forEach(row => existing.set(row.id, row.status));
      }
      if (active) { setVerifiedScope(scopeKey); setCandidates(pending); setMissing(ids.filter(id => !existing.has(id) || existing.get(id) === 'excluido_da_fila_triagem')); }
    })().catch(error => console.error('Não foi possível verificar a fila de triagem:', error));
    return () => { active = false; };
  }, [allowed, day, key, queueKey, scopeKey, revision, user?.usuario, user?.unidadeId]);
  if (!allowed || verifiedScope !== scopeKey || missing.length === 0) return null;
  const synchronize = async (id: string) => {
    const appointment = candidates.find(a => a.id === id);
    if (!appointment || busy) return;
    setBusy(id);
    try {
      const result = await confirmCareArrival({ id, userId: user?.id || '', userName: user?.nome || '', unitId: appointment.unidadeId, expectedPatientId: appointment.pacienteId, arrivalTime: nowTimeBrazilStr().slice(0, 5), reconcile: true });
      applyCareFlowAgendamentoUpdate(result.agendamento);
      setMissing(old => old.filter(value => value !== id));
      void refreshFila().catch(error => console.error('Erro ao atualizar a fila:', error));
      toast.success(result.already_processed ? 'A fila já foi sincronizada por outro terminal.' : result.status === 'apto_atendimento' ? 'Triagem desabilitada para o profissional. Paciente liberado para atendimento direto.' : 'Paciente sincronizado com a Triagem.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível sincronizar. Atualize a tela.'); }
    finally { setBusy(null); }
  };
  return <div role="region" aria-label="Reconciliação de chegadas de hoje" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
    <p>Há chegadas de hoje sem fila ativa de triagem. Confira o paciente antes de sincronizar.</p>
    {candidates.filter(a => missing.includes(a.id)).map(a => <div key={a.id} className="flex flex-wrap items-center justify-between gap-2">
      <span>{a.pacienteNome} · {a.profissionalNome} · {a.hora}</span>
      <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void synchronize(a.id)}>{busy === a.id ? 'Sincronizando...' : 'Sincronizar com a Triagem'}</Button>
    </div>)}
  </div>;
}
