const SECRET_FIELD = /(?:password|passwd|senha|token|authorization|bearer|secret|api[_-]?key|service[_-]?role|private[_-]?key|cookie|credencial|otp|refresh[_-]?token)/i;
export const isAuditSecret = (key: string) => SECRET_FIELD.test(key) || /(?:^|[._-])key(?:$|[._-])/i.test(key);
export function maskAuditIdentifier(value: unknown, kind: 'cpf' | 'cns'): string {
  if (value == null || value === '') return '-';
  const digits=String(value).replace(/\D/g,'');
  if (kind==='cpf' && digits.length===11) return '***.***.***-'+digits.slice(-2);
  if (kind==='cns' && digits.length===15) return '***.***.***.***-'+digits.slice(-3);
  return 'Identificador ocultado';
}
export function auditSafeText(value: string): string {
  // Avoid persisting or showing bearer/JWT credentials and query/hash parameters
  // in absolute URLs; other free text is not a comprehensive DLP solution.
  return value.replace(/\bBearer\s+[^\s,;]+/gi,'Bearer ********')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'********')
    .replace(/https?:\/\/[^\s"'<>]+/gi,url=>url.split(/[?#]/,1)[0]);
}
export function redactAuditData(value: unknown, maskIdentifiers = false, field = '', depth = 0): any {
  if (isAuditSecret(field)) return '********';
  if (depth > 40) return '[estrutura profunda ocultada]';
  const kind = /(?:^|[._])cpf(?:$|[._])/i.test(field) ? 'cpf' : /(?:^|[._])cns(?:$|[._])/i.test(field) ? 'cns' : null;
  if (Array.isArray(value)) return value.map(v=>redactAuditData(v,maskIdentifiers,field,depth+1));
  if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([key,v])=>[
    key,redactAuditData(v,maskIdentifiers,isAuditSecret(key) ? key : kind ? field : key,depth+1)
  ]));
  if (maskIdentifiers && kind && value != null && value !== '') return maskAuditIdentifier(value,kind);
  return typeof value==='string' ? auditSafeText(value) : value;
}
export function auditCsvCell(value: unknown): string {
  let s=String(value??'');
  // Excel also interprets formulas preceded by whitespace or control characters.
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(s) || /^[\t\r\n]/.test(s)) s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
}
export function auditEscapeHtml(value: unknown): string {
  const entities: Record<string,string> = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
  return String(value??'').replace(/[&<>"']/g,c=>entities[c]||c);
}
export function auditDeviceLabel(log: { navegador?:unknown; sistema_operacional?:unknown; dispositivo?:unknown; detalhes?:Record<string,unknown> }): string {
  const legacy=log.detalhes?.dispositivo;
  const obj=legacy && typeof legacy==='object' && !Array.isArray(legacy) ? legacy as Record<string,unknown> : {};
  const clean=(v:unknown)=>typeof v==='string' && v.trim() && v.trim()!=='[object Object]' ? v.trim() : '';
  const parts=[clean(log.navegador)||clean(obj.browser),clean(log.sistema_operacional)||clean(obj.os),clean(log.dispositivo)||clean(obj.device)||clean(legacy)];
  return [...new Set(parts.filter(Boolean))].join(' · ') || '-';
}
export function auditScope(user: {id?:string;role?:string;usuario?:string;unidadeId?:string;ativo?:boolean}|null|undefined, canView:boolean) {
  const global=user?.role==='master' && user.usuario==='admin.sms';
  const allowed=!!user?.id && user.ativo===true && (canView||user.role==='master') && (global||!!user.unidadeId);
  return {allowed,global,unit:global?null:user?.unidadeId||null};
}
