import { supabase } from "@/integrations/supabase/client";

const ARRIVAL_ALREADY_PROCESSED = new Set([
  "triagem_concluida", "aguardando_enfermagem", "aguardando_atendimento",
  "apto_atendimento", "chamado", "em_atendimento", "concluido",
  "finalizado", "atendido", "atendimento_encerrado", "prontuario_finalizado",
]);

export const isArrivalAlreadyProcessed = (status: string): boolean => ARRIVAL_ALREADY_PROCESSED.has(status);

/** Consulta o estado persistido antes de devolver um atendimento à triagem. */
export async function hasConfirmedTriage(agendamentoId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("triage_records")
    .select("id")
    .eq("agendamento_id", agendamentoId)
    .not("confirmado_em", "is", null)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}
