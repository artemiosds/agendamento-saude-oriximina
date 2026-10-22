import { supabase } from '@/integrations/supabase/client';

export interface DeletedTreatmentCycle {
  sessions_removed: number;
  appointments_removed: number;
}

type RpcClient = Pick<typeof supabase, 'rpc'>;

/** One database transaction removes the unused cycle and only its linked future appointments. */
export async function deleteTreatmentCycle(
  cycleId: string,
  reason: string,
  client: RpcClient = supabase,
): Promise<DeletedTreatmentCycle> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new Error('Informe a justificativa para excluir o ciclo.');

  const { data, error } = await (client as any).rpc('delete_treatment_cycle_with_appointments', {
    p_cycle_id: cycleId,
    p_reason: trimmedReason,
  });
  if (error) {
    if (error.code === 'PGRST202' || /delete_treatment_cycle_with_appointments.*not found/i.test(error.message || '')) {
      throw new Error('A atualização do banco para excluir ciclos com agendamentos ainda não foi aplicada. Nenhum dado foi alterado.');
    }
    throw error;
  }
  if (!data || !Number.isInteger(data.sessions_removed) || !Number.isInteger(data.appointments_removed)) {
    throw new Error('O banco não confirmou a exclusão do ciclo. Atualize a página para conferir.');
  }
  return data as DeletedTreatmentCycle;
}
