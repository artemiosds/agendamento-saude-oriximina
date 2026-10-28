import { supabase } from '@/integrations/supabase/client';
import { assertTreatmentCycle, isActiveCycleSession, type CycleIntegritySnapshot, type SessionIntegritySnapshot } from '@/lib/treatmentCycleIntegrity';

type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: { message?: string; code?: string } | null }> };

/** One transaction on the server; no client-side compensation or partial success. */
export function createTreatmentCycleWriter(client: RpcClient) {
  async function persist(cycle: CycleIntegritySnapshot & Record<string, unknown>, dates: string[], reason: string | null, existing: SessionIntegritySnapshot[] = []) {
    const isExtension = reason !== null;
    const previousTotal = isExtension ? cycle.total_sessions - dates.length : 0;
    if (!isExtension) {
      const sessions = dates.map((date, index) => ({
        cycle_id: cycle.id, patient_id: cycle.patient_id, professional_id: cycle.professional_id,
        scheduled_date: date, session_number: index + 1,
        status: 'pendente_agendamento', appointment_id: null,
      }));
      assertTreatmentCycle(cycle, sessions);
    } else {
      // Pendências antigas não bloqueiam extensão: só verifica as novas datas.
      if (!reason.trim()) throw new Error('Informe a justificativa da alteração.');
      if (new Set(dates).size !== dates.length) throw new Error('Data repetida nas novas sessões.');
      const taken = existing.find((s) => isActiveCycleSession(s) && s.scheduled_date && dates.includes(s.scheduled_date));
      if (taken) throw new Error(`Já existe a sessão nº ${taken.session_number} neste ciclo em ${taken.scheduled_date!.split('-').reverse().join('/')}. Escolha outra data.`);
    }
    const { data, error } = await client.rpc('save_treatment_cycle_plan', {
      p_cycle: cycle, p_dates: dates, p_reason: reason?.trim() ?? null,
      p_expected_total: previousTotal,
    });
    if (error) {
      if (error.code === 'PGRST202') throw new Error('Validação transacional de sessões ainda não ativada no banco. Nenhuma sessão foi gravada.');
      throw new Error(error.message || 'Não foi possível registrar o plano de sessões.');
    }
    const recorded = Number(data?.registered_sessions);
    if (!data?.cycle?.id || (!isExtension && recorded !== cycle.total_sessions)) {
      throw new Error(`Gravação não confirmada: ${cycle.total_sessions} sessões previstas e ${Number.isFinite(recorded) ? recorded : 'quantidade não confirmada'} registradas. Recarregue o ciclo para revisão; não repita a geração.`);
    }
    return data.cycle;
  }
  return {
    create: (cycle: CycleIntegritySnapshot & Record<string, unknown>, dates: string[]) => persist(cycle, dates, null),
    extend: (cycle: CycleIntegritySnapshot & Record<string, unknown>, existing: SessionIntegritySnapshot[], dates: string[], reason: string) => persist(cycle, dates, reason, existing),
  };
}

export const treatmentCycleWriter = createTreatmentCycleWriter(supabase as unknown as RpcClient);

/** Fresh rows, used before scheduling and clinical conclusion; never creates missing rows. */
export async function loadTreatmentCycleSnapshot(cycleId: string) {
  const [cycleResult, sessionsResult] = await Promise.all([
    supabase.from('treatment_cycles').select('id, patient_id, professional_id, unit_id, total_sessions, end_date_predicted, status').eq('id', cycleId).single(),
    supabase.from('treatment_sessions').select('id, cycle_id, patient_id, professional_id, session_number, scheduled_date, status, appointment_id').eq('cycle_id', cycleId).order('session_number').limit(10000),
  ]);
  if (cycleResult.error) throw cycleResult.error;
  if (sessionsResult.error) throw sessionsResult.error;
  const cycle = cycleResult.data;
  const sessions = sessionsResult.data || [];
  return { cycle, sessions };
}

export async function assertStoredTreatmentCycle(cycleId: string) {
  const snapshot = await loadTreatmentCycleSnapshot(cycleId);
  assertTreatmentCycle(snapshot.cycle, snapshot.sessions);
  return snapshot;
}
