import { supabase } from '@/integrations/supabase/client';

type AvailabilitySlot = {
  salaId: string;
  horaInicio: string;
  horaFim: string;
  vagasPorHora: number;
  vagasPorDia: number;
  diasSemana: number[];
  duracaoConsulta: number;
};

type AvailabilityGroup = {
  profissionalId: string;
  unidadeId: string;
  dataInicio: string;
  dataFim: string;
};

export type { AvailabilitySlot };

export async function saveAvailabilityGroup(
  previousIds: string[],
  group: AvailabilityGroup,
  slots: AvailabilitySlot[],
) {
  const { data, error } = await supabase.rpc('save_availability_group' as never, {
    p_previous_ids: previousIds,
    p_profissional_id: group.profissionalId,
    p_unidade_id: group.unidadeId,
    p_data_inicio: group.dataInicio,
    p_data_fim: group.dataFim,
    p_slots: slots.map(slot => ({
      sala_id: slot.salaId,
      hora_inicio: slot.horaInicio,
      hora_fim: slot.horaFim,
      vagas_por_hora: slot.vagasPorHora,
      vagas_por_dia: slot.vagasPorDia,
      dias_semana: slot.diasSemana,
      duracao_consulta: slot.duracaoConsulta,
    })),
  } as never);

  if (error) throw error;
  if (data !== (slots.length || previousIds.length)) {
    throw new Error('O banco não confirmou todos os horários da grade. Atualize a página e confira os dados.');
  }
}
