import { supabase } from '@/integrations/supabase/client';

type StartResult = {
  status: 'em_atendimento'; already_processed: boolean; agendamento: Record<string, unknown>;
  hora_inicio: string; iniciado_em: string | null; atendimento_id: string;
};
export async function startClinicalAttendance(appointmentId: string, patientId: string, roomId = ''): Promise<StartResult> {
  const request = async () => {
    try {
      return await supabase.rpc('start_clinical_attendance', {
        p_agendamento_id: appointmentId, p_patient_id: patientId, p_room_id: roomId,
      });
    } catch {
      throw new Error('A conexão foi interrompida antes da confirmação. Atualize a Agenda para conferir se o atendimento já foi iniciado.');
    }
  };
  const { data, error } = await request();
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.status !== 'em_atendimento'
    || typeof data.hora_inicio !== 'string' || !/^\d{2}:\d{2}$/.test(data.hora_inicio)
    || !data.agendamento || typeof data.agendamento !== 'object' || Array.isArray(data.agendamento)
    || data.agendamento.id !== appointmentId) {
    throw new Error('O banco não confirmou o início do atendimento. Atualize a Agenda antes de tentar novamente.');
  }
  return data as StartResult;
}
