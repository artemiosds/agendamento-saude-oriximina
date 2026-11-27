export const PORTAL_FILTERS = ['todos', 'ativo', 'bloqueado', 'sem', 'semEmail', 'semCpf'] as const;
export type PortalFilter = typeof PORTAL_FILTERS[number];
export const PORTAL_PAGE_SIZES = [25, 50, 100] as const;
export type PortalPageSize = typeof PORTAL_PAGE_SIZES[number];
export type PortalCounts = Record<PortalFilter, number | null>;
export const isPortalId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** Escape the LIKE pattern first, then the quoted PostgREST filter value. */
export function portalSearchExpression(raw: string): string | null {
  const term = raw.trim().slice(0, 100).replace(/[\u0000-\u001f\u007f*]/g, ' ').trim();
  if (!term) return null;
  const digits = term.replace(/\D/g, '');
  const cpfOnly = /^[\d.\-\s]+$/.test(term) && digits.length === 11;
  const quote = (value: string) => '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  if (cpfOnly) {
    const formatted = digits.slice(0,3)+'.'+digits.slice(3,6)+'.'+digits.slice(6,9)+'-'+digits.slice(9);
    return 'cpf.eq.'+quote(digits)+',cpf.eq.'+quote(formatted);
  }
  const pattern = quote('%'+term.replace(/[\\%_]/g, char => '\\'+char)+'%');
  const fields = ['nome.ilike.'+pattern, 'email.ilike.'+pattern];
  if (/^[\d.\-\s]+$/.test(term) && digits.length >= 3) {
    fields.push('cpf.ilike.'+quote('%'+digits+'%'));
    if (digits !== term) fields.push('cpf.ilike.'+pattern);
  }
  return fields.join(',');
}

export function maskPortalCpf(cpf: string | null): string {
  if (!cpf?.trim()) return 'Não informado';
  const digits = cpf.replace(/\D/g, '');
  return digits.length === 11 ? '***.***.***-'+digits.slice(-2) : 'A conferir';
}
export function maskPortalEmail(email: string | null): string {
  if (!email?.trim()) return 'Sem e-mail';
  const parts = email.trim().split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return 'E-mail a conferir';
  return parts[0].slice(0,1)+'***@'+parts[1].slice(0,1)+'***';
}
export function portalPageRange(page: number, size: PortalPageSize) {
  const start = (Math.max(1, Math.floor(page))-1)*size;
  return { from: start, to: start+size-1 };
}
export function portalLastPage(count: number, size: PortalPageSize) {
  return Math.max(1, Math.ceil(count/size));
}
/** Counts describe linked records, not usage or verified logins. */
export function portalLinkRate(counts: PortalCounts): number | null {
  const {todos, ativo, bloqueado, sem} = counts;
  if (todos === null || ativo === null || bloqueado === null || sem === null ||
      todos <= 0 || ativo < 0 || bloqueado < 0 || sem < 0 || ativo+bloqueado+sem !== todos) return null;
  return Math.round((ativo+bloqueado)/todos*1000)/10;
}
