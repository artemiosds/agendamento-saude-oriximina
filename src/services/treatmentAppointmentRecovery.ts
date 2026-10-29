import { supabase } from '@/integrations/supabase/client';
interface Session { id: string; cycle_id: string; status: string; appointment_id: string | null; scheduled_date: string | null }
/** Only server-confirmed absence can release a reservation; never infer absence from RLS/network results. */
export async function recoverMissingTreatmentAppointments<T extends Session>(cycleId: string, sessions: T[], visibleAppointmentIds: ReadonlySet<string>): Promise<T[]> {
  if (!sessions.some(s => s.status === 'agendada' && s.appointment_id && !visibleAppointmentIds.has(s.appointment_id))) return sessions;
  const { data, error } = await (supabase as any).rpc('recover_missing_treatment_appointments', { p_cycle_id: cycleId });
  if (error) throw error;
  if (!Array.isArray(data?.recovered_ids) || !data.recovered_ids.every((id: unknown) => typeof id === 'string')) throw new Error('A recuperação do vínculo não foi confirmada. Atualize os dados.');
  const recovered = new Set<string>(data.recovered_ids);
  return sessions.map(s => recovered.has(s.id) && s.cycle_id === cycleId
    ? { ...s, status: 'pendente_agendamento', appointment_id: null, scheduled_date: null } : s);
}
