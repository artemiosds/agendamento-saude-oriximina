import {describe,it,expect} from 'vitest';
import {createConfigQueue,snapshotConfigPatch,commitConfigPatch} from './configWriteQueue';
describe('fila de configurações',()=>{
 it('não descarta gravações concorrentes e continua depois de erro',async()=>{
  const enqueue=createConfigQueue();const order:number[]=[];
  const a=enqueue(async()=>{order.push(1);await Promise.resolve();throw Error('falha');});
  const b=enqueue(async()=>{order.push(2);return 2;});
  await expect(a).rejects.toThrow('falha');expect(await b).toBe(2);expect(order).toEqual([1,2]);
 });
 it('preserva chaves independentes e utiliza versão observada',async()=>{
  const values={portal:{ativo:true},config_sistema:{nome:'antigo'}};
  let received:unknown;
  const result=await commitConfigPatch({config_sistema:{nome:'novo'}},async()=>({values,version:'v1'}),async(next,version)=>{received=version;return true;});
  expect(received).toBe('v1');expect(result).toEqual({portal:{ativo:true},config_sistema:{nome:'novo'}});
 });
 it('recusa conflito e não grava quando leitura falha',async()=>{
  await expect(commitConfigPatch({a:1},async()=>({values:{b:2},version:'v1'}),async()=>false)).rejects.toThrow('Recarregue');
  let called=false;await expect(commitConfigPatch({a:1},async()=>{throw Error('leitura');},async()=>{called=true;return true;})).rejects.toThrow('leitura');expect(called).toBe(false);
 });
 it('isola o snapshot da edição posterior',()=>{
  const draft={section:{active:true}};const copy=snapshotConfigPatch(draft);draft.section.active=false;expect(copy).toEqual({section:{active:true}});
 });
});
