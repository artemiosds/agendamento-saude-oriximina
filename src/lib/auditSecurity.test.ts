import { describe, expect, it } from 'vitest';
import { redactAuditData, auditCsvCell, auditEscapeHtml, auditDeviceLabel, auditScope, maskAuditIdentifier } from './auditSecurity';
describe('blindagem de auditoria',()=>{
  it('oculta credenciais aninhadas sem alterar o objeto original',()=>{
    const source={changes:{'custom_data.senha':{from:'antiga',to:'nova'},nome:{from:'A',to:'B'}},arr:[{access_token:'secret'}],url:'https://exemplo.com/portal?token=abc#x',status:false};
    const safe=redactAuditData(source);
    expect(safe.changes['custom_data.senha']).toBe('********');
    expect(safe.changes.nome).toEqual({from:'A',to:'B'});
    expect(safe.arr[0].access_token).toBe('********');
    expect(safe.url).toBe('https://exemplo.com/portal');
    expect(safe.status).toBe(false);
    expect(source.arr[0].access_token).toBe('secret');
    expect(redactAuditData({cpf:{senha:'secret'}}).cpf.senha).toBe('********');
  });
  it('mascara identificadores inclusive nas diferenças',()=>{
    expect(redactAuditData({cpf:{from:'12345678901',to:'12345678902'},cns:'123456789012345'},true)).toEqual({cpf:{from:'***.***.***-01',to:'***.***.***-02'},cns:'***.***.***.***-345'});
    expect(maskAuditIdentifier('123','cpf')).toBe('Identificador ocultado');
    expect(redactAuditData({cpf:'12345678901'}).cpf).toBe('12345678901');
  });
  it('neutraliza fórmulas no CSV e HTML não confiável',()=>{
    for(const v of ['=1+1',' +1','-1','@SUM(1)','\t=1']) expect(auditCsvCell(v).startsWith('"\'')).toBe(true);
    expect(auditCsvCell(0)).toBe('"0"');
    expect(auditCsvCell('a"b')).toBe('"a""b"');
    expect(auditEscapeHtml('<b>"&')).toBe('&lt;b&gt;&quot;&amp;');
  });
  it('normaliza dispositivos legados sem exibir objetos',()=>{
    expect(auditDeviceLabel({detalhes:{dispositivo:{browser:'Chrome',os:'Windows',device:'desktop'}}})).toBe('Chrome · Windows · desktop');
    expect(auditDeviceLabel({dispositivo:'desktop',navegador:'Edge',detalhes:{dispositivo:{os:'Windows'}}})).toBe('Edge · Windows · desktop');
    expect(auditDeviceLabel({detalhes:{dispositivo:{foo:'bar'}}})).toBe('-');
    expect(auditDeviceLabel({dispositivo:'[object Object]'})).toBe('-');
  });
  it('nega escopo sem usuário ativo ou unidade e preserva master global',()=>{
    const local={id:'u',role:'master',usuario:'local',unidadeId:'unit',ativo:true};
    expect(auditScope(local,false)).toEqual({allowed:true,global:false,unit:'unit'});
    expect(auditScope({...local,unidadeId:''},true).allowed).toBe(false);
    expect(auditScope({...local,ativo:false},true).allowed).toBe(false);
    expect(auditScope({...local,role:'profissional',usuario:'admin.sms',unidadeId:''},true).allowed).toBe(false);
    expect(auditScope({...local,usuario:'admin.sms',unidadeId:''},false)).toEqual({allowed:true,global:true,unit:null});
    expect(auditScope(null,true).allowed).toBe(false);
  });
});
