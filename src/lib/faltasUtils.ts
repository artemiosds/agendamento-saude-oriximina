/**
 * Helpers centralizados para regra de faltas e exceção administrativa
 * de bloqueio (TFD / Ordem Judicial).
 *
 * Usar SEMPRE estas funções em Agenda, Tratamentos, Faltosos e cadastro
 * para evitar duplicação de lógica.
 */

export type TipoFalta = 'justificada' | 'injustificada';

export interface FaltaRegistro {
  status?: string | null;
  tipo_falta?: string | null;
  falta_liberada?: boolean | null;
  observacoes?: string | null;
}

export interface PacienteIsentoLike {
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
