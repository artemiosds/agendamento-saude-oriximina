import {describe,it,expect} from 'vitest';
import {canExportGlobalData,confirmedCount,readDataExport,dataExportCsv,DATA_EXPORT_LIMIT,DATA_EXPORT_BATCH} from './operationalDataSafety';
describe('blindagem de gestão de dados',()=>{
 it('autoriza somente o Master Global ativo, sem presumir pelo perfil',()=>{
  expect(canExportGlobalData({role:'master',usuario:'admin.sms',ativo:true})).toBe(true);
  expect(canExportGlobalData({role:'master',usuario:'outro',ativo:true})).toBe(false);
  expect(canExportGlobalData({role:'master',usuario:'admin.sms',ativo:false})).toBe(false);
  expect(canExportGlobalData({role:'profissional',usuario:'admin.sms',ativo:true})).toBe(false);
  expect(canExportGlobalData(null)).toBe(false);
 });
 it('distingue zero confirmado de indisponibilidade',()=>{
  expect(confirmedCount({count:0})).toBe(0);
  expect(confirmedCount({count:null})).toBeNull();
  expect(confirmedCount({count:0,error:{message:'erro'}})).toBeNull();
  expect(confirmedCount({count:-1})).toBeNull();
 });
 it('lê lotes completos e reconfirma a quantidade',async()=>{
  const rows=Array.from({length:DATA_EXPORT_BATCH+1},(_,i)=>({id:String(i)}));let counts=0,reads=0;
  const result=await readDataExport(async()=>{counts++;return rows.length},async(f,t)=>{reads++;return rows.slice(f,t+1)},new AbortController().signal,()=>{});
  expect(result).toEqual(rows);expect(counts).toBe(2);expect(reads).toBe(2);
 });
 it('recusa truncamento, duplicidade, divergência, limite e cancelamento',async()=>{
  const c=new AbortController(),noop=()=>{};
  await expect(readDataExport(async()=>null,async()=>[],c.signal,noop)).rejects.toThrow('Contagem');
  await expect(readDataExport(async()=>2,async()=>[{id:'a'}],c.signal,noop)).rejects.toThrow('incompleta');
  await expect(readDataExport(async()=>2,async()=>[{id:'a'},{id:'a'}],c.signal,noop)).rejects.toThrow('repetido');
  let n=0;await expect(readDataExport(async()=>++n,async()=>[{id:'a'}],c.signal,noop)).rejects.toThrow('mudou');
  await expect(readDataExport(async()=>DATA_EXPORT_LIMIT+1,async()=>[],c.signal,noop)).rejects.toThrow('Limite');
  c.abort();await expect(readDataExport(async()=>1,async()=>[],c.signal,noop)).rejects.toThrow('cancelada');
 });
 it('exporta apenas colunas administrativas e neutraliza fórmulas',()=>{
  const csv=dataExportCsv('pacientes',[{id:'1',nome:'=1+1',custom_data:{token:'segredo'},descricao_clinica:'texto clínico'}]);
  expect(csv.includes('"\'=1+1"')).toBe(true);
  expect(csv.includes('segredo')).toBe(false);
  expect(csv.includes('texto clínico')).toBe(false);
  expect(csv.includes('custom_data')).toBe(false);
 });
});
