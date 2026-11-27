import {describe,it,expect} from 'vitest';
import {storageDiagnosis,growthDiagnosis,inspectTreatmentLinks,LINK_SAMPLE_LIMIT} from './monitoringIntegrity';
const bucket={bucket:'a',fileCount:10,usedBytes:750,unknownSizeCount:0};
describe('integridade preventiva',()=>{
 it('usa apenas cota informada e bytes medidos',()=>{
  expect(storageDiagnosis([bucket],1000).percent).toBe(75);
  expect(storageDiagnosis([bucket],1000).remaining).toBe(250);
  expect(storageDiagnosis([bucket],1000).level).toBe('attention');
  expect(storageDiagnosis([bucket],null).remaining).toBeNull();
  expect(storageDiagnosis([{...bucket,usedBytes:1001}],1000).level).toBe('exceeded');
 });
 it('não apresenta saldo com metadados incompletos ou contraditórios',()=>{
  expect(storageDiagnosis([{...bucket,unknownSizeCount:1}],1000).remaining).toBeNull();
  expect(storageDiagnosis([{...bucket,unknownSizeCount:11}],1000).consistent).toBe(false);
  expect(storageDiagnosis([bucket,bucket],1000).consistent).toBe(false);
  expect(storageDiagnosis([{...bucket,fileCount:0}],1000).consistent).toBe(false);
  expect(storageDiagnosis([{...bucket,unknownSizeCount:1,usedBytes:100}],1000).level).toBe('partial');
 });
 it('ordena volume recente e exclui contagens contraditórias ou não confirmadas',()=>{
  const row={name:'a',count:100,recent7d:10,recent30d:30,periodChecked:true};
  const result=growthDiagnosis([row,{...row,name:'b',recent30d:50},{...row,name:'c',recent30d:101},{...row,name:'d',periodChecked:false}]);
  expect(result.ranked.map(r=>r.name)).toEqual(['b','a']);
  expect(result.ranked[1].share).toBe(30);
  expect(result.inconsistent).toBe(1);
 });
 it('distingue ciclo ausente no escopo, divergência e vínculo confirmado',()=>{
  const cycles=[{id:'c1',patient_id:'p1'},{id:'c2',patient_id:'p2'}];
  const sessions=[{id:'s1',cycle_id:'c1',patient_id:'p1'},{id:'s2',cycle_id:'c2',patient_id:'p1'},{id:'s3',cycle_id:'c3',patient_id:'p1'},{id:'s4',cycle_id:'',patient_id:'p1'}];
  expect(inspectTreatmentLinks(sessions,cycles)).toEqual({sample:4,confirmed:1,missing:1,mismatch:1,incomplete:1});
  expect(inspectTreatmentLinks([],[]).sample).toBe(0);
  expect(()=>inspectTreatmentLinks([sessions[0],sessions[0]],cycles)).toThrow('inconsistente');
  expect(()=>inspectTreatmentLinks(Array(LINK_SAMPLE_LIMIT+1).fill(sessions[0]),cycles)).toThrow('Limite');
 });
});
