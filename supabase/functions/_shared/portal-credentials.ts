/** Pure authorization and validation helpers for portal account operations. */
export function canManagePortalPatient(actor: { role?: string | null; usuario?: string | null; unidade_id?: string | null; ativo?: boolean | null }, patient: { unidade_id?: string | null }): boolean {
  return actor.ativo === true && String(actor.role || '').trim().toLowerCase() === 'master' &&
    (actor.usuario === 'admin.sms' || (!!actor.unidade_id && actor.unidade_id === patient.unidade_id));
}
export function portalEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
export function portalAccountExclusive(patientIds: readonly string[], patientId: string, staffCount: number, externalCount: number): boolean {
  return patientIds.length === 1 && patientIds[0] === patientId && staffCount === 0 && externalCount === 0;
}
export function portalCanInvite(config: unknown, patientId: string): boolean {
  if (config == null) return true; // existing legacy default
  if (typeof config !== 'object' || Array.isArray(config)) return false;
  const c = config as Record<string, unknown>;
  if ('permitirPortal' in c && c.permitirPortal !== true) return false;
  if ('pacientesBloqueados' in c && (!Array.isArray(c.pacientesBloqueados) || c.pacientesBloqueados.includes(patientId))) return false;
  return true;
}
export const PORTAL_INVITE_RESPONSE = { success: true, message: 'Se o cadastro estiver apto, enviaremos um link ao e-mail registrado. Se já possui acesso, recupere a senha. Se não possui e-mail ou não recebeu o link, procure a unidade.' };
