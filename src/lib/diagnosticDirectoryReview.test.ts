import { describe,expect,it } from 'vitest';
import { createDiagnosticExamConfig,normalizeDiagnosticRoomConfig } from './diagnosticExams';
import { normalizeExamSearch,examReview,roomReview,newExamId,sigtapSearchTerm } from './diagnosticDirectoryReview';
const exam={...createDiagnosticExamConfig('Exame','a'),codigoSigtap:'1234567890'};
const config=normalizeDiagnosticRoomConfig({finalidade:'aparelho_diagnostico',horarioInicio:'07:00',horarioFim:'17:00',exames:[exam]});
describe('conferência administrativa de aparelhos',()=>{
  it('normaliza busca sem acentos',()=>expect(normalizeExamSearch(' ÁUDIO ')).toBe('audio'));
  it('distingue ausência e formato incompleto de SIGTAP',()=>{
    expect(examReview(exam)).toEqual([]);
    expect(examReview({...exam,codigoSigtap:''})).toContain('SIGTAP não informado');
    expect(examReview({...exam,codigoSigtap:'123'})).toContain('SIGTAP com formato incompleto');
  });
  it('avisa sobre preparo sem instruções, sem inventar orientações',()=>{
    expect(examReview({...exam,exigePreparo:true})).toContain('Preparo sem instruções');
  });
  it('identifica intervalo inválido sem alterar configuração',()=>{
    expect(roomReview(config).invalidWindow).toBe(false);
    expect(roomReview({...config,horarioFim:'06:00'}).invalidWindow).toBe(true);
  });
  it('identifica IDs repetidos e evita colisão em novas modalidades',()=>{
    expect(roomReview({...config,exames:[exam,exam]}).duplicateIds).toBe(1);
    expect(newExamId([exam],'a',()=> 'uuid')).toBe('exam-uuid');
    expect(newExamId([exam],'b',()=> 'uuid')).toBe('b');
  });
  it('consulta código formatado e neutraliza curingas da busca',()=>{
    expect(sigtapSearchTerm('02.04.03.015-3')).toEqual({numeric:true,term:'0204030153'});
    expect(sigtapSearchTerm('RX%_')).toEqual({numeric:false,term:'RX'});
  });
  it('não modifica os dados existentes',()=>{
    const before=JSON.stringify(config);roomReview(config);expect(JSON.stringify(config)).toBe(before);
  });
});
