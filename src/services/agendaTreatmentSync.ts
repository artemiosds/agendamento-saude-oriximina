import { supabase } from '@/integrations/supabase/client';
export async function updateAgendaWithTreatment(id: string, patch: Record<string, unknown>, expected?: { data: string; hora: string; profissionalId: string }) {
  const { data, error } = await (supabase as any).rpc('update_agenda_treatment_appointment', {
    p_id: id, p_patch: patch,
    p_expected: expected ? { data: expected.data, hora: expected.hora, profissional_id: expected.profissionalId } : null,
  });
  if (error) throw new Error(error.code === 'PGRST202' ? 'Sincronização com Tratamentos ainda não ativada. Nenhuma alteração foi salva.' : error.message || 'Não foi possível sincronizar Agenda e sessão.');
  if (data?.id !== id) throw new Error('Atualização não confirmada. Recarregue a Agenda antes de tentar novamente.');
  return { data, error: null };
}
