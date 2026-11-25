// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe,it,expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { APAC_ORIGINAL_SHA256,fillApacPdf,resolveApacIdentification } from './apacPdf';
import { emptyApacClinicalData } from './apacClinicalData';
const source=readFileSync('public/Formulario_APAC_LAUDO.pdf');
describe('formulário APAC original aprovado',()=>{
 it('mantém exatamente o arquivo aprovado e as duas folhas',async()=>{
  expect(createHash('sha256').update(source).digest('hex')).toBe(APAC_ORIGINAL_SHA256);
  const pdf=await PDFDocument.load(await fillApacPdf(source,{nome:'PACIENTE FICTÍCIO'},emptyApacClinicalData()));
  expect(pdf.getPageCount()).toBe(2);
 });
 it('usa CNS válido ou CPF e preserva situação de rua desconhecida',()=>{
  expect(resolveApacIdentification({cpf:'000.000.000-00',cns:'123',custom_data:{etnia:'WAI WAI'}})).toEqual({documento:'00000000000',etnia:'WAI WAI',street:null});
  expect(resolveApacIdentification({cpf:'00000000000',cns:'000000000000000',situacao_rua:false}).documento).toBe('000000000000000');
 });
 it('preenche dez secundários e não perde o telefone de nove dígitos',async()=>{
  const c=emptyApacClinicalData();
  c.secundarios=Array.from({length:10},(_,i)=>({codigo:String(i+1).padStart(10,'0'),nome:'PROCEDIMENTO FICTÍCIO',quantidade:1}));
  const b=await fillApacPdf(source,{nome:'MARIA DE LOURDES EXEMPLO',telefone:'93900000000',nome_mae:'ANA EXEMPLO',sexo:'Feminino'},c);
  expect((await PDFDocument.load(b)).getPageCount()).toBe(2);
 });
 it('bloqueia texto impossível de acomodar e documento incorreto do solicitante',async()=>{
  await expect(fillApacPdf(source,{nome:'W'.repeat(400)},emptyApacClinicalData())).rejects.toThrow('Nome do paciente');
  await expect(fillApacPdf(source,{nome:'TESTE'},{...emptyApacClinicalData(),tipoDocumento:'CPF',documento:'00000000000'})).rejects.toThrow('CNS');
 });
});
