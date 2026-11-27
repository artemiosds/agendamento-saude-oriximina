import {describe,it,expect} from 'vitest';
import {auditMunicipalDate,auditPeriodRange,auditDateBounds,auditModuleDistribution,AUDIT_INDICATORS,AUDIT_FAILURE_STATUSES,AUDIT_CLASSIFIED_STATUSES} from './auditOverview';
describe('indicadores e recortes da auditoria',()=>{
  it('usa o dia municipal mesmo perto da meia-noite UTC',()=>{
    expect(auditMunicipalDate(new Date('2026-11-28T02:59:59Z'))).toBe('2026-11-27');
    expect(auditMunicipalDate(new Date('2026-11-28T03:00:00Z'))).toBe('2026-11-28');
  });
  it('define períodos inclusivos de 1, 7 e 30 dias',()=>{
    const now=new Date('2026-11-27T15:00:00Z');
    expect(auditPeriodRange(1,now)).toEqual({from:'2026-11-27',to:'2026-11-27'});
    expect(auditPeriodRange(7,now)).toEqual({from:'2026-11-21',to:'2026-11-27'});
    expect(auditPeriodRange(30,now)).toEqual({from:'2026-10-29',to:'2026-11-27'});
  });
  it('usa limite final exclusivo incluindo frações de segundo e virada de mês',()=>{
    expect(auditDateBounds('2026-11-30','2026-11-30')).toEqual({start:'2026-11-30T00:00:00-03:00',end:'2026-12-01T00:00:00-03:00'});
    expect(auditDateBounds('','')).toEqual({start:'',end:''});
    expect(auditDateBounds('','2026-12-31').end).toBe('2027-01-01T00:00:00-03:00');
  });
  it('mantém falha e erro na mesma categoria sem confundir tentativa com sucesso',()=>{
    expect(AUDIT_FAILURE_STATUSES).toEqual(['erro','falha']);
    expect(AUDIT_CLASSIFIED_STATUSES).toEqual(['sucesso','erro','falha']);
    expect(AUDIT_INDICATORS.map(x=>x.filter)).toEqual(['','sucesso','_failures','_other']);
  });
  it('distribui apenas a página fornecida, sem inventar módulos ou total',()=>{
    expect(auditModuleDistribution([])).toEqual([]);
    expect(auditModuleDistribution([{modulo:'auth'},{modulo:'auth'},{modulo:'agenda'},{modulo:null}])).toEqual([{key:'auth',count:2,percent:50},{key:'',count:1,percent:25},{key:'agenda',count:1,percent:25}]);
  });
});
