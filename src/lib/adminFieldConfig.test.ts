import {describe,it,expect} from 'vitest';
import {emptyAdminScreen,mergeAdminScope,conditionalCycle,validateFieldLimits} from './adminFieldConfig';
import type {CustomFieldDef} from '@/hooks/useCustomFields';
const field=(nome:string):CustomFieldDef=>({id:nome,nome,rotulo:nome,tipo:'text',opcoes:[],obrigatorio:false,ativo:true,ordem:10,valorPadrao:'',mostrarListagem:false});
describe('configuração administrativa de campos',()=>{
 it('preserva outras telas e unidades e mescla somente o escopo editado',()=>{
  const empty=emptyAdminScreen(),other={...empty,fields:[field('outro')]};
  const current={paciente:{__global__:empty,u2:other},triagem:{__global__:other}};
  const next={...empty,fields:[field('novo')]};
  expect(mergeAdminScope(current,'paciente','__global__',empty,next,[])).toEqual({paciente:{__global__:next,u2:other},triagem:{__global__:other}});
 });
 it('recusa escopo alterado, inclusive quando criado por outra sessão',()=>{
  const empty=emptyAdminScreen(),next={...empty,fields:[field('novo')]};
  expect(()=>mergeAdminScope({paciente:{u1:next}},'paciente','u1',empty,empty,[])).toThrow('alterada');
  expect(()=>mergeAdminScope({paciente:{u1:empty}},'paciente','u1',undefined,next,[])).toThrow('alterada');
 });
 it('impede colisões novas com campos nativos e escopos sobrepostos, sem misturar unidades independentes',()=>{
  const empty=emptyAdminScreen(),next={...empty,fields:[field('nome')]};
  expect(()=>mergeAdminScope({},'paciente','u1',undefined,next,['nome'])).toThrow('Nome');
  expect(()=>mergeAdminScope({paciente:{__global__:next}},'paciente','u1',undefined,next,[])).toThrow('Nome');
  expect(mergeAdminScope({paciente:{u2:next}},'paciente','u1',undefined,next,[]).paciente.u1).toEqual(next);
 });
 it('detecta referência circular e mantém dependências válidas',()=>{
  expect(conditionalCycle([{key:'a',reference:'b'},{key:'b',reference:'a'}],'a')).toBe(true);
  expect(conditionalCycle([{key:'a',reference:'a'}],'a')).toBe(true);
  expect(conditionalCycle([{key:'a',reference:'b'},{key:'b'}],'a')).toBe(false);
 });
 it('valida limites sem modificar regras clínicas',()=>{
  expect(validateFieldLimits('10','2','','')).toMatch(/mínimo/);
  expect(validateFieldLimits('','', '0','')).toMatch(/comprimento/);
  expect(validateFieldLimits('','','','[')).toMatch(/regular/);
  expect(validateFieldLimits('0','10','50','^a')).toBeNull();
 });
});
