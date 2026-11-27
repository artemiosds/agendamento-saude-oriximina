import { portalEmail, portalAccountExclusive } from './portal-credentials.ts';

export const PORTAL_HISTORY_ACTIONS = ['portal_criar_acesso', 'portal_redefinir_senha', 'portal_bloquear', 'portal_desbloquear', 'portal_convite_primeiro_acesso'] as const;
export type PortalAccountState = 'unlinked' | 'verified' | 'divergent' | 'unknown';
export function portalAccountDiagnosis(patient: { id: string; email: string | null; auth_user_id: string | null }, evidence: {
  patientIds: string[]; staffCount: number; externalCount: number; accountEmail: string | null; confirmedAt: string | null; lastSignIn: string | null;
} | null) {
  const emailValid = !!portalEmail(patient.email);
  const empty = { emailValid, emailConfirmed: null, lastSignIn: null };
  if (!patient.auth_user_id) return { ...empty, state: 'unlinked' as const };
  if (!evidence) return { ...empty, state: 'unknown' as const };
  if (!portalAccountExclusive(evidence.patientIds, patient.id, evidence.staffCount, evidence.externalCount) ||
      !emailValid || portalEmail(patient.email) !== portalEmail(evidence.accountEmail)) return { ...empty, state: 'divergent' as const };
  const date = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? value : null;
  return { emailValid, state: 'verified' as const, emailConfirmed: !!date(evidence.confirmedAt), lastSignIn: date(evidence.lastSignIn) };
}
export function projectPortalHistory(rows: readonly { id: string; acao: string; created_at: string; user_nome: string | null; status: string; unidade_id: string | null; entidade_id: string; entidade: string; modulo: string }[], patientId: string, unitId: string | null) {
  return rows.filter(row => row.entidade_id === patientId && row.entidade === 'paciente' && row.modulo === 'portal_paciente' &&
    PORTAL_HISTORY_ACTIONS.some(action => action === row.acao) && (unitId === null || row.unidade_id === unitId))
    .map(row => ({ id: row.id, action: row.acao, time: row.created_at, actor: row.acao === 'portal_convite_primeiro_acesso' ? 'Solicitação de primeiro acesso' : row.user_nome || 'Responsável não registrado', status: row.status }));
}
