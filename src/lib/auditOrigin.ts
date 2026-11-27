export type AuditOrigin = {
  version:1; ip:string; source:'vercel_geoip'|'ipify_browser'; capturedAt:string;
  city?:string; region?:string; country?:string;
  network:'matched'|'unrecognized'|'not_configured'; networkLabel?:string;
};
export const AUDIT_ORIGIN_PRODUCTION='https://agendamento-saude-sms-oriximina.site';
export const AUDIT_ORIGIN_PREVIEW='https://id-preview--b31da743-ec3e-4875-9ddb-7d95bdbcdbae.lovable.app';
export const auditOriginEndpoint=(origin:string)=>origin===AUDIT_ORIGIN_PREVIEW?AUDIT_ORIGIN_PRODUCTION+'/api/audit-origin':'/api/audit-origin';
export const allowedAuditOrigin=(origin:string)=>origin===AUDIT_ORIGIN_PRODUCTION||origin===AUDIT_ORIGIN_PREVIEW;
export const ORIGIN_CACHE_MS=5*60_000;
export const ORIGIN_RETRY_MS=15_000;
const STAFF_ROLES=['master','coordenador','recepcao','profissional','gestao','tecnico','enfermagem'];
export const shouldCaptureAuditOrigin=(role?:string)=>STAFF_ROLES.includes(role||'');
export function originText(value:unknown,max=120):string {
  return typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max):'';
}
export function plausibleIp(value:unknown):value is string {
  if(typeof value!=='string'||value.length>45)return false;
  if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value))return value.split('.').every(p=>Number(p)<=255);
  return value.includes(':')&&/^[0-9a-f:.]+$/i.test(value);
}
export function parseAuditOrigin(value:unknown,expectedIp?:string):AuditOrigin|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const v=value as Record<string,unknown>;
  if(v.version!==1||!plausibleIp(v.ip)||(expectedIp!==undefined&&v.ip!==expectedIp))return null;
  if(v.source!=='vercel_geoip'&&v.source!=='ipify_browser')return null;
  if(typeof v.capturedAt!=='string'||!Number.isFinite(Date.parse(v.capturedAt)))return null;
  const geo=v.source==='vercel_geoip';
  const network=geo&&v.network==='matched'&&originText(v.networkLabel)?'matched':geo&&v.network==='unrecognized'?'unrecognized':'not_configured';
  return {version:1,ip:v.ip,source:v.source,capturedAt:v.capturedAt,
    city:geo?originText(v.city)||undefined:undefined,
    region:geo?originText(v.region,12)||undefined:undefined,
    country:geo&&/^[A-Z]{2}$/.test(String(v.country))?String(v.country):undefined,
    network,networkLabel:network==='matched'?originText(v.networkLabel):undefined};
}
export function auditOriginLocation(origin:AuditOrigin|null):string {
  return [origin?.city,origin?.region,origin?.country].filter(Boolean).join(' · ')||'Localização não registrada';
}
export function auditOriginSource(origin?:string):string{
  if(origin==='frontend')return 'Aplicação web (frontend)';
  if(origin==='backend')return 'Servidor (backend)';
  if(origin==='rpc')return 'Rotina do servidor (RPC)';
  return originText(origin)||'Origem não registrada';
}
export function auditRouteLabel(route:unknown):string {
  const path=originText(route,300).split(/[?#]/,1)[0];
  return path==='/painel/agenda'?'Agenda Diária':path||'Página não registrada';
}
