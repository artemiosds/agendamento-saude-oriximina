import { supabase } from '@/integrations/supabase/client';

/**
 * Helpers centralizados para regra de faltas e exceção administrativa
 * de bloqueio (TFD / Ordem Judicial).
 *
 * Usar SEMPRE estas funções em Agenda, Tratamentos, Faltosos e cadastro
 * para evitar duplicação de lógica.
 */

export type TipoFalta = 'justificada' | 'injustificada';

export interface FaltaRegistro {
  paciente_id?: string | null;
  patient_id?: string | null;
  profissional_id?: string | null;
  professional_id?: string | null;
  status?: string | null;
  tipo_falta?: string | null;
  falta_liberada?: boolean | null;
  observacoes?: string | null;
}

export interface PacienteIsentoLike {
  id?: string;
  is_tfd?: boolean | null;
  possui_ordem_judicial?: boolean | null;
  custom_data?: Record<string, any> | null;
}

/** True quando o registro é uma falta efetivamente justificada. */
export function isFaltaJustificada(reg?: FaltaRegistro | null): boolean {
  if (!reg) return false;
  if ((reg.tipo_falta || '').toLowerCase() === 'justificada') return true;
  // Fallback no observacoes legacy
  const obs = (reg.observacoes || '').toUpperCase();
  return obs.includes('[FALTA JUSTIFICADA]');
}

/** True quando o registro é falta injustificada e ainda não liberada. */
export function isFaltaInjustificada(reg?: FaltaRegistro | null): boolean {
  if (!reg) return false;
  if (reg.falta_liberada === true) return false;
  if (isFaltaJustificada(reg)) return false;
  // Considera default 'injustificada' quando vazio
  const tipo = (reg.tipo_falta || 'injustificada').toLowerCase();
  return tipo === 'injustificada';
}

/**
 * Paciente com exceção administrativa (TFD ou Ordem Judicial)
 * está isento de bloqueio por faltas.
 */
export function isPacienteIsentoBloqueio(paciente?: PacienteIsentoLike | null): boolean {
  if (!paciente) return false;
  if (paciente.is_tfd === true) return true;
  if (paciente.possui_ordem_judicial === true) return true;
  const cd = paciente.custom_data || {};
  if (cd.is_tfd === true) return true;
  if (cd.possui_ordem_judicial === true) return true;
  return false;
}

/** Retorna o rótulo principal da exceção para uso em badges. */
export function getExcecaoLabel(
  paciente?: PacienteIsentoLike | null,
): 'TFD' | 'Ordem Judicial' | null {
  if (!paciente) return null;
  const isTfd = paciente.is_tfd === true || paciente.custom_data?.is_tfd === true;
  const isOj =
    paciente.possui_ordem_judicial === true ||
    paciente.custom_data?.possui_ordem_judicial === true;
  if (isTfd) return 'TFD';
  if (isOj) return 'Ordem Judicial';
  return null;
}

/** 
 * Verifica se o paciente está bloqueado para um profissional específico.
 * Se profissionalId não for passado, verifica o status global.
 */
export async function isPacienteBloqueadoParaProfissional(
  pacienteId: string, 
  profissionalId?: string | null
): Promise<boolean> {
  const { data: pac } = await supabase.from('pacientes').select('is_tfd, possui_ordem_judicial, status_falta').eq('id', pacienteId).single();
  if (isPacienteIsentoBloqueio(pac)) return false;

  if (profissionalId) {
    const { data: status } = await supabase
      .from('paciente_profissional_status')
      .select('status_falta')
      .eq('paciente_id', pacienteId)
      .eq('profissional_id', profissionalId)
      .maybeSingle();
    
    return status?.status_falta === 'BLOQUEADO';
  }

  return pac?.status_falta === 'BLOQUEADO';
}

/** 
 * Retorna as estatísticas de faltas do paciente com um profissional.
 */
export async function getFaltasPorProfissional(
  pacienteId: string, 
  profissionalId: string
) {
  const { data } = await supabase
    .from('paciente_profissional_status')
    .select('*')
    .eq('paciente_id', pacienteId)
    .eq('profissional_id', profissionalId)
    .maybeSingle();
  
  return data || { total_faltas: 0, status_falta: 'REGULAR', ultima_falta: null };
}
