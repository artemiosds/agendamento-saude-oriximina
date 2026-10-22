import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { getMissingSessionNumbers, suggestTreatmentSessionDate, type CycleIntegritySnapshot, type CycleIntegrityIssue, type SessionIntegritySnapshot } from '@/lib/treatmentCycleIntegrity';
import type { TreatmentAppointmentSnapshot } from '@/lib/treatmentSessionIntegrity';
import { isActiveTreatmentAppointmentStatus } from '@/lib/treatmentSessionIntegrity';
import { todayLocalStr } from '@/lib/utils';

const dateLabel = (date: string) => date.split('-').reverse().join('/');

export function TreatmentCyclePendingPanel({ cycle, sessions, issues, appointments, canReview, availableDates, onChanged }: {
  cycle: CycleIntegritySnapshot & { frequency: string };
  sessions: (SessionIntegritySnapshot & { id: string })[];
  issues: CycleIntegrityIssue[];
  appointments: Record<string, TreatmentAppointmentSnapshot>;
  canReview: boolean;
  availableDates: string[];
  onChanged: () => Promise<void>;
}) {
  const [action, setAction] = useState<{ kind: 'clear' | 'date' | 'missing'; session?: SessionIntegritySnapshot & { id: string }; number: number } | null>(null);
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const missing = getMissingSessionNumbers(cycle.total_sessions, sessions);
  const begin = (next: NonNullable<typeof action>) => { setAction(next); setReason(''); setDate(''); setConfirmed(false); };
  const protectedSession = (session: SessionIntegritySnapshot) => {
    const a = session.appointment_id ? appointments[session.appointment_id] : null;
    return !!a && isActiveTreatmentAppointmentStatus(a.status) && a.data === session.scheduled_date && a.paciente_id === cycle.patient_id && a.profissional_id === cycle.professional_id && a.unidade_id === cycle.unit_id;
  };
  const save = async () => {
    if (!canReview || !action || !confirmed || !reason.trim() || saving) return;
    setSaving(true);
    try {
      const session = action.session;
      const args = action.kind === 'missing'
        ? { p_cycle_id: cycle.id, p_session_number: action.number, p_date: date || null, p_reason: reason.trim(), p_confirmed: true }
        : action.kind === 'clear'
          ? { p_session_id: session!.id, p_expected_date: session!.scheduled_date, p_reason: reason.trim(), p_confirmed: true }
          : { p_session_id: session!.id, p_expected_date: session!.scheduled_date, p_date: date, p_reason: reason.trim() };
      const name = action.kind === 'missing' ? 'restore_missing_treatment_session' : action.kind === 'clear' ? 'clear_duplicate_treatment_session_date' : 'review_treatment_session_date';
      const { data, error } = await (supabase as any).rpc(name, args);
      if (error) throw error;
      toast.success(data?.message || 'Regularização manual registrada com justificativa e auditoria.');
      setAction(null);
      await onChanged();
    } catch (error: any) { toast.error(error?.message || 'Não foi possível registrar a revisão.'); }
    finally { setSaving(false); }
  };
  if (!issues.length) return null;
  const suggestion = action && action.kind !== 'clear' ? suggestTreatmentSessionDate(sessions, action.number, availableDates, todayLocalStr(), cycle.frequency) : null;
  return <section className="mb-4 space-y-3 rounded-lg border border-[#2A6F97]/30 bg-[#2A6F97]/5 p-4" aria-label="Pendências de revisão">
    <h3 className="font-semibold text-[#2A6F97] dark:text-sky-300">Pendências de revisão</h3>
    {issues.map((issue, index) => <div key={`${issue.code}-${index}`} className="space-y-2 text-sm">
      <p>{issue.message}</p>
      {issue.code === 'date' && (() => {
        const involved = sessions.filter((s) => issue.sessionIds.includes(s.id));
        const protectedRows = involved.filter(protectedSession);
        return <div className="space-y-2">
          <p>{protectedRows.length ? `Agendamento protegido: sessão nº ${protectedRows.map((s) => s.session_number).join(', ')} permanece em ${dateLabel(protectedRows[0].scheduled_date!)}.` : 'Não foi identificado um único vínculo válido para proteger. Confira os vínculos antes de regularizar.'}</p>
          {canReview && protectedRows.length > 0 && involved.filter((s) => !s.appointment_id && s.status === 'pendente_agendamento').map((s) => <Button key={s.id} size="sm" variant="outline" disabled={saving} onClick={() => begin({ kind: 'clear', session: s, number: s.session_number })}>Retirar data duplicada da sessão nº {s.session_number}</Button>)}
          <p className="text-muted-foreground">A retirada preserva a sessão e seu número. Nenhuma nova data ou reserva é criada.</p>
        </div>;
      })()}
      {issue.code === 'undated' && canReview && issue.sessionIds.map((id) => {
        const session = sessions.find((s) => s.id === id);
        return session && !session.appointment_id && session.status === 'pendente_agendamento' ? <Button key={id} size="sm" variant="outline" disabled={saving} onClick={() => begin({ kind: 'date', session, number: session.session_number })}>Escolher data da sessão nº {session.session_number}</Button> : null;
      })}
    </div>)}
    {!!missing.length && <div className="space-y-2"><p className="text-sm">Sessões faltantes: {missing.join(', ')}. A reposição exige conferência individual e não renumera as sessões existentes.</p>
      {canReview && sessions.length < cycle.total_sessions && missing.map((number) => <Button key={number} size="sm" variant="outline" disabled={saving} onClick={() => begin({ kind: 'missing', number })}>Registrar manualmente sessão nº {number} faltante</Button>)}
    </div>}
    {action && <div className="space-y-3 rounded-lg border bg-background p-3" aria-label="Regularização manual">
      <p className="text-sm font-medium">{action.kind === 'clear' ? 'Retirar somente a data duplicada' : action.kind === 'missing' ? 'Completar somente o registro faltante' : 'Definir nova data'} — sessão nº {action.number}</p>
      {action.kind !== 'clear' && <div className="space-y-2"><Label htmlFor="review-session-date">Nova data {action.kind === 'missing' ? '(opcional)' : ''}</Label><Input id="review-session-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        {suggestion && <p className="text-sm">Sugestão: {dateLabel(suggestion)}. <Button size="sm" variant="ghost" onClick={() => setDate(suggestion)}>Usar sugestão no formulário</Button></p>}
      </div>}
      <div><Label htmlFor="review-session-reason">Motivo da alteração (obrigatório)</Label><Textarea id="review-session-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <label className="flex gap-2 text-sm"><Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} />Conferi os dados e confirmo esta regularização manual.</label>
      <div className="flex gap-2"><Button disabled={saving || !confirmed || !reason.trim() || (action.kind === 'date' && !date)} onClick={save}>{saving ? 'Registrando…' : 'Confirmar regularização'}</Button><Button variant="outline" disabled={saving} onClick={() => setAction(null)}>Cancelar</Button></div>
    </div>}
  </section>;
}
