import {supabase} from '@/integrations/supabase/client';
import type {Json} from '@/integrations/supabase/types';
import {createConfigQueue,snapshotConfigPatch,commitConfigPatch,type ConfigValues} from './configWriteQueue';
const enqueue=createConfigQueue();
async function confirmSession(expected:string){
 const {data:{session},error}=await supabase.auth.getSession();
 if(error||!session||session.user.id!==expected)throw Error('Sessão alterada ou não confirmada.');
}
export async function saveSystemConfigPatch(patch:ConfigValues,expectedAuthId?:string){
 const copy=snapshotConfigPatch(patch);
 // Enqueue synchronously before any awaited session lookup, preserving invocation order.
 return enqueue(async()=>{
  if(!expectedAuthId)throw Error('Identidade da sessão não confirmada.');
  const identity=expectedAuthId;
  await confirmSession(identity);
  return commitConfigPatch(copy,async()=>{
   const {data,error}=await supabase.from('system_config').select('configuracoes,updated_at').eq('id','default').maybeSingle();
   if(error)throw Error('Não foi possível ler a configuração atual.');
   if(!data)return null;
   if(!data.configuracoes||typeof data.configuracoes!=='object'||Array.isArray(data.configuracoes)||!Number.isFinite(Date.parse(data.updated_at)))throw Error('Versão de configuração inválida.');
   return {values:data.configuracoes as ConfigValues,version:data.updated_at};
  },async(values,version)=>{
   await confirmSession(identity);
   const updated_at=new Date(Math.max(Date.now(),version===null?0:Date.parse(version)+1)).toISOString();
   const payload={configuracoes:values as Json,updated_at};
   // Never fall back to upsert after an error. A missing row may only be inserted.
   const result=version===null
    ?await supabase.from('system_config').insert({id:'default',...payload}).select('id').maybeSingle()
    :await supabase.from('system_config').update(payload).eq('id','default').eq('updated_at',version).select('id').maybeSingle();
   if(result.error)throw Error('Gravação não confirmada. Verifique a conexão e as permissões.');
   return result.data?.id==='default';
  });
 });
}
