import { supabase } from '@/integrations/supabase/client';

export interface CareFlowResult {
  already_processed: boolean;
  reconciled?: boolean;
  status: string;
  agendamento: Record<string, unknown>;
  fila: Record<string, unknown> | null;
  triage_id?: string;
}

async function callCareFlow(name: string, params: Record<string, unknown>): Promise<CareFlowResult> {
  let response: { data: any; error: any };
  try { response = await (supabase as any).rpc(name, params); }
  catch { throw new Error('A conexão foi interrompida antes da confirmação da resposta. Tente novamente: o sistema confere se a operação já foi concluída.'); }
  const { data, error } = response;
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') throw new Error('A operação segura ainda não está disponível. Atualize o sistema ou contate o suporte. Nenhuma gravação alternativa foi feita.');
    if (error.code === '55P03') throw new Error('Outro terminal está atualizando este atendimento. Aguarde e tente novamente.');
    if (!error.code && /fetch|network|conex|timeout/i.test(error.message || '')) throw new Error('Não foi possível confirmar a resposta do servidor. Tente novamente: o sistema confere se a operação já foi concluída.');
    if (error.code === '22003') throw new Error('Um sinal vital excede o limite permitido. Confira os valores da ficha.');
    throw Object.assign(new Error(error.message || 'Não foi possível confirmar a gravação. Atualize a fila antes de repetir a ação.'), { code: error.code });
  }
  if (!data || typeof data.status !== 'string' || !data.agendamento?.id) throw new Error('O banco não confirmou o resultado. Atualize a fila antes de repetir a ação.');
  return data as CareFlowResult;
}

export function confirmCareArrival(input: { id: string; userId: string; userName: string; unitId: string; arrivalTime: string; expectedPatientId?: string; reconcile?: boolean }) {
  return callCareFlow('confirmar_chegada_atendimento', {
    p_agendamento_id: input.id, p_usuario_id: input.userId, p_usuario_nome: input.userName,
    p_unidade_id: input.unitId, p_hora_chegada: input.arrivalTime, p_reconciliar: input.reconcile === true, p_paciente_id_esperado: input.expectedPatientId || null,
  });
}
export const startCareTriage = (id: string, userId: string, expectedPatientId: string) => callCareFlow('iniciar_triagem_atendimento', { p_agendamento_id: id, p_tecnico_id: userId, p_paciente_id_esperado: expectedPatientId });
export const saveCareTriageDraft = (id: string, userId: string, data: Record<string, unknown>) => callCareFlow('salvar_rascunho_triagem_atendimento', { p_agendamento_id: id, p_tecnico_id: userId, p_dados_triagem: data });
export const completeCareTriage = (id: string, userId: string, data: Record<string, unknown>, nursing: boolean) => callCareFlow('concluir_triagem_atendimento', { p_agendamento_id: id, p_tecnico_id: userId, p_dados_triagem: data, p_encaminhar_enfermagem: nursing });
