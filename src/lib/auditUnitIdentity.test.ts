import {describe,it,expect} from 'vitest';
import {auditUnitLabel,pendingAuditUnitIds,unitCatalogName,isAuditUnitField} from './auditUnitIdentity';
describe('identificação de unidades na auditoria',()=>{
 it('preserva o nome histórico mesmo quando o cadastro mudou',()=>{
  expect(auditUnitLabel({unidade_id:'un1',unidade_nome:'Nome anterior'},'Nome novo')).toBe('Nome anterior');
 });
 it('resolve código pelo cadastro e informa a origem sem inventar nome',()=>{
  expect(auditUnitLabel({unidade_id:'un1773328876009'},'Unidade teste')).toBe('Unidade teste (cadastro atual)');
  expect(auditUnitLabel({unidade_id:'un1773328876009',unidade_nome:'un1773328876009'},'Unidade teste')).toBe('Unidade teste (cadastro atual)');
  expect(auditUnitLabel({unidade_id:'un1773328876009'})).toBe('Unidade não identificada');
  expect(auditUnitLabel({})).toBe('Unidade não registrada');
 });
 it('agrupa somente ids sem nome, incluindo unidades históricas e restringindo escopo',()=>{
  const refs=[{unidade_id:'un1'},{unidade_id:'un1'},{unidade_id:'un2'},{unidade_id:'un3',unidade_nome:'Histórico'}];
  expect(pendingAuditUnitIds(refs,null)).toEqual(['un1','un2']);
  expect(pendingAuditUnitIds(refs,'un1')).toEqual(['un1']);
  expect(unitCatalogName({id:'un1',nome:'Nome oficial',nome_exibicao:''})).toBe('Nome oficial');
  expect(unitCatalogName({id:'un1',nome:'Nome oficial',nome_exibicao:'Nome exibido'})).toBe('Nome exibido');
  expect(isAuditUnitField('custom_data.unidade_id')).toBe(true);
  expect(isAuditUnitField('profissional_id')).toBe(false);
 });
});
