import {describe,it,expect} from 'vitest';
import {parseAuditOrigin,auditOriginLocation,shouldCaptureAuditOrigin,auditRouteLabel,plausibleIp} from './auditOrigin';
import {buildAuditOrigin,matchInstitutionalNetwork} from '../../api/audit-origin';
const now=new Date('2026-11-27T15:00:00Z');
const headers={'x-vercel-forwarded-for':'203.0.113.10','x-vercel-ip-city':'Oriximin%C3%A1','x-vercel-ip-country-region':'PA','x-vercel-ip-country':'BR'};
describe('origem de auditoria',()=>{
 it('decodifica cidade e preserva a captura da infraestrutura',()=>{
   const result=buildAuditOrigin(headers,true,undefined,now);
   expect(result?.city).toBe('Oriximiná');
   expect(auditOriginLocation(result)).toBe('Oriximiná · PA · BR');
   expect(result?.capturedAt).toBe(now.toISOString());
   expect(parseAuditOrigin(result,'203.0.113.10')?.source).toBe('vercel_geoip');
 });
 it('não aceita IP arbitrário, cadeia de proxies ou ambiente não confirmado',()=>{
   expect(buildAuditOrigin(headers,false)).toBeNull();
   expect(buildAuditOrigin({...headers,'x-vercel-forwarded-for':'203.0.113.10, 1.2.3.4'},true)).toBeNull();
   expect(buildAuditOrigin({'x-forwarded-for':'203.0.113.10'},true)).toBeNull();
   expect(parseAuditOrigin(buildAuditOrigin(headers,true),'203.0.113.11')).toBeNull();
   expect(plausibleIp('999.0.0.1')).toBe(false);
 });
 it('reconhece somente rede cadastrada e não inventa nomes',()=>{
   const config=JSON.stringify({'203.0.113.10':'Unidade fictícia'});
   expect(matchInstitutionalNetwork('203.0.113.10',config)).toEqual({network:'matched',networkLabel:'Unidade fictícia'});
   expect(matchInstitutionalNetwork('203.0.113.11',config)).toEqual({network:'unrecognized'});
   expect(matchInstitutionalNetwork('203.0.113.10','bad')).toEqual({network:'not_configured'});
   expect(matchInstitutionalNetwork('203.0.113.10')).toEqual({network:'not_configured'});
 });
 it('não atribui localização a registros antigos ou fallback de IP',()=>{
   expect(auditOriginLocation(null)).toBe('Localização não registrada');
   const old=parseAuditOrigin({...buildAuditOrigin(headers,true),source:'ipify_browser'});
   expect(old?.city).toBeUndefined();expect(old?.network).toBe('not_configured');
   expect(parseAuditOrigin({})).toBeNull();
 });
 it('limita captura adicional aos perfis internos e não expõe parâmetros de rota',()=>{
   expect(shouldCaptureAuditOrigin('master')).toBe(true);
   expect(shouldCaptureAuditOrigin('profissional')).toBe(true);
   expect(shouldCaptureAuditOrigin('paciente')).toBe(false);
   expect(shouldCaptureAuditOrigin()).toBe(false);
   expect(auditRouteLabel('/painel/agenda?token=abc')).toBe('Agenda Diária');
 });
});
