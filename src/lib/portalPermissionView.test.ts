import { describe, expect, it } from 'vitest';
import { portalAllowedTabs, portalSafeTab, portalAppointmentSections, canPrintPortalReceipt, PORTAL_PERMISSION_GROUPS } from './portalPermissionView';
import { portalCustomPatch } from '../../supabase/functions/_shared/portal-profile-fields';
const all = {verProximas:true,verHistorico:true,verFila:true,editarDados:true,cancelar:true,imprimirComprovante:true};
describe('central de permissões do portal',()=>{
  it('preserva as seis regras existentes uma única vez',()=>{
    expect(PORTAL_PERMISSION_GROUPS.flatMap(g=>g.rules.map(r=>r.key)).sort()).toEqual(Object.keys(all).sort());
  });
  it('redireciona a aba que perdeu autorização e mantém exames e dados independentes',()=>{
    const p={...all,verProximas:false,verHistorico:false,verFila:false};
    expect(portalAllowedTabs(p)).toEqual(['exames','dados']);
    expect(portalSafeTab('proximos',p)).toBe('dados');
    expect(portalSafeTab('exames',p)).toBe('exames');
    expect(portalSafeTab('fila',{...all,verFila:false})).toBe('proximos');
    expect(portalSafeTab('historico',all)).toBe('historico');
  });
  it('não permite emitir comprovantes de consultas fora das abas habilitadas',()=>{
    const future={future:true,past:false},past={future:false,past:true};
    expect(canPrintPortalReceipt(all,future)).toBe(true);
    expect(canPrintPortalReceipt({...all,imprimirComprovante:false},past)).toBe(false);
    expect(canPrintPortalReceipt({...all,verProximas:false},future)).toBe(false);
    expect(canPrintPortalReceipt({...all,verHistorico:false},past)).toBe(false);
    expect(canPrintPortalReceipt({...all,verHistorico:false},future)).toBe(true);
    expect(canPrintPortalReceipt(all,{future:false,past:false})).toBe(false);
  });
  it('mantém critérios existentes de consultas futuras e históricas',()=>{
    const now=new Date('2026-11-27T12:00:00');
    expect(portalAppointmentSections({data:'2026-11-28',status:'confirmado'},now)).toEqual({future:true,past:false});
    expect(portalAppointmentSections({data:'2026-11-26',status:'confirmado'},now)).toEqual({future:false,past:true});
    expect(portalAppointmentSections({data:'2026-11-28',status:'cancelado'},now)).toEqual({future:false,past:true});
    expect(portalAppointmentSections({data:'2026-11-27',status:'concluido'},now)).toEqual({future:true,past:true});
  });
  it('preserva metadados existentes e permite somente campos cadastrais conhecidos',()=>{
    const original={cep:'antigo',interno:{a:true},ibge_municipio:150530};
    expect(portalCustomPatch(original,{cep:'novo',interno:{a:false},email:'outro',auth_user_id:'x',logradouro:'Rua',ibge_municipio:150530})).toEqual({cep:'novo',interno:{a:true},ibge_municipio:150530,logradouro:'Rua'});
    expect(original.cep).toBe('antigo');
    expect(portalCustomPatch(original,{cep:{bad:true},logradouro:['x'],ibge_municipio:Infinity})).toEqual(original);
    expect(portalCustomPatch(original,null)).toEqual(original);
    expect(portalCustomPatch(null,{bairro:'Centro',outro:'ignorado'})).toEqual({bairro:'Centro'});
  });
});
