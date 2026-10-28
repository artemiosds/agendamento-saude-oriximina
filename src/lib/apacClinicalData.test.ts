import { describe,it,expect } from 'vitest';
import { emptyApacClinicalData,validateApacClinicalData } from './apacClinicalData';
describe('edição opcional APAC',()=>{
 it('mantém laudo em branco disponível e cria estados independentes',()=>{
  const a=emptyApacClinicalData(),b=emptyApacClinicalData();a.secundarios.push({codigo:'0301010048',nome:'Consulta',quantidade:1});
  expect(b.secundarios).toEqual([]);expect(validateApacClinicalData(b)).toEqual([]);
 });
 it('valida código, quantidade, CNES e um CID por campo',()=>{
  const d=emptyApacClinicalData();d.principal={codigo:'123',nome:'Consulta',quantidade:0};d.cidPrincipal='F82/G809';d.cnes='12';
  expect(validateApacClinicalData(d)).toHaveLength(4);
 });
 it('não aceita mais secundários que o formulário comporta nem documento incompleto',()=>{
  const d=emptyApacClinicalData();d.secundarios=Array.from({length:6},()=>({codigo:'0301010048',nome:'Consulta',quantidade:1}));d.tipoDocumento='CPF';d.documento='123';
  expect(validateApacClinicalData(d)).toEqual(expect.arrayContaining(['O formulário comporta até 5 procedimentos secundários.','Confira o tipo e o número do documento do solicitante.']));
 });
 it('permite principal, secundário e CIDs separados sem gerar autorização',()=>{
  const d=emptyApacClinicalData();d.principal={codigo:'0301010048',nome:'Consulta',quantidade:1};d.cidPrincipal='M54.5';d.cidSecundario='F82';
  expect(validateApacClinicalData(d)).toEqual([]);expect(d).not.toHaveProperty('autorizacao');
 });
});
