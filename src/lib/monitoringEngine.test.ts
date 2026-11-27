import {describe,it,expect} from 'vitest';
import {monitorCount,monitorCoverage,monitorCacheFresh,monitorPeriodStatus,monitorPool,MONITOR_DETAIL_TTL} from './monitoringEngine';
const row={name:'teste',count:0,recent7d:null,recent30d:null};
describe('motor de monitoramento',()=>{
 it('não confunde zero, falha ou contagem ausente',()=>{
  expect(monitorCount({count:0})).toBe(0);expect(monitorCount({count:null})).toBeNull();expect(monitorCount({count:1,error:'erro'})).toBeNull();expect(monitorCount({count:-1})).toBeNull();
 });
 it('classifica cobertura real e não exige períodos ainda não solicitados',()=>{
  expect(monitorCoverage([row],1,false)).toBe('verificado');expect(monitorCoverage([row],2,false)).toBe('parcial');expect(monitorCoverage([row],1,true)).toBe('parcial');expect(monitorCoverage([{...row,count:null}],1,false)).toBe('erro');
 });
 it('distingue detalhe pendente, inexistente, incompleto e confirmado',()=>{
  expect(monitorPeriodStatus(row,true)).toBe('Sob demanda');expect(monitorPeriodStatus(row,false)).toBe('Não aplicável');expect(monitorPeriodStatus({...row,periodChecked:true},true)).toBe('Incompleto');expect(monitorPeriodStatus({...row,periodChecked:true,recent7d:0,recent30d:0},true)).toBe('Consultado');
 });
 it('limita validade e rejeita relógio regressivo',()=>{
  expect(monitorCacheFresh(100,100+MONITOR_DETAIL_TTL-1)).toBe(true);expect(monitorCacheFresh(100,100+MONITOR_DETAIL_TTL)).toBe(false);expect(monitorCacheFresh(null,100)).toBe(false);expect(monitorCacheFresh(100,99)).toBe(false);
 });
 it('limita concorrência, mantém ordem e cancela novos trabalhos',async()=>{
  let active=0,peak=0;const c=new AbortController();
  const result=await monitorPool([0,1,2,3,4,5],async n=>{active++;peak=Math.max(peak,active);await Promise.resolve();active--;return n*2;},c.signal);
  expect(result).toEqual([0,2,4,6,8,10]);expect(peak).toBe(4);
  let started=0;await expect(monitorPool([1,2,3,4,5],async n=>{started++;c.abort();return n;},c.signal)).rejects.toThrow('cancelada');expect(started).toBe(1);
 });
});
