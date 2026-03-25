import { supabase } from '@/integrations/supabase/client';

export interface AbsenceInfo {
  totalFaltas: number;
  consecutivas: number;
  alternadas: number;
  nivel: 'ok' | 'alerta' | 'revisao' | 'desligamento';
  mensagem: string;
}

export async function getPatientAbsenceInfo(patientId: string): Promise<AbsenceInfo> {
  // Get sessions with falta status
  const { data: sessions } = await (supabase as any)
    .from('treatment_sessions')
    .select('status, scheduled_date')
    .eq('patient_id', patientId)
    .order('scheduled_date', { ascending: true });

  // Get agendamentos with falta status
  const { data: agendamentos } = await (supabase as any)
    .from('agendamentos')
    .select('status, data')
    .eq('paciente_id', patientId)
    .eq('status', 'falta');

  const totalFaltas = (sessions?.filter((s: any) => s.status === 'falta').length || 0)
    + (agendamentos?.length || 0);

  // Calculate consecutive absences (from most recent)
  let consecutivas = 0;
  if (sessions && sessions.length > 0) {
    const sorted = [...sessions].sort((a: any, b: any) => b.scheduled_date.localeCompare(a.scheduled_date));
    for (const s of sorted) {
      if ((s as any).status === 'falta') consecutivas++;
      else break;
    }
  }

  // Calculate alternating absences (non-consecutive)
  const alternadas = totalFaltas - consecutivas;

  let nivel: AbsenceInfo['nivel'] = 'ok';
  let mensagem = '';

  if (totalFaltas >= 5) {
    nivel = 'desligamento';
    mensagem = `⚠️ ATENÇÃO: ${totalFaltas} faltas registradas — possível desligamento do tratamento.`;
  } else if (alternadas >= 3) {
    nivel = 'revisao';
    mensagem = `⚠️ ${totalFaltas} faltas (${alternadas} alternadas) — necessário revisão do caso.`;
  } else if (consecutivas >= 2) {
    nivel = 'alerta';
    mensagem = `⚠️ ${consecutivas} faltas consecutivas — atenção ao acompanhamento.`;
  }

  return { totalFaltas, consecutivas, alternadas, nivel, mensagem };
}
