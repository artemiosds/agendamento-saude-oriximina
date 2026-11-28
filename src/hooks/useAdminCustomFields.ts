import {useCallback,useEffect,useRef,useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {supabase} from '@/integrations/supabase/client';
import type {Json} from '@/integrations/supabase/types';
import {createConfigQueue,snapshotConfigPatch} from '@/lib/configWriteQueue';
import {configObject} from '@/lib/configSectionGuard';
import {emptyAdminScreen,readAdminScope,mergeAdminScope} from '@/lib/adminFieldConfig';
import {NATIVE_FIELDS,type ScreenKey,type ScreenConfig,type CustomFieldsConfig} from '@/hooks/useCustomFields';
import {auditService} from '@/services/auditService';
import {toast} from 'sonner';

const ID='custom_fields_config';
const enqueue=createConfigQueue();
type Baseline={identity:string;config:CustomFieldsConfig};
export function useAdminCustomFields(){
  const {user}=useAuth();
  const identity=user?.role==='master'&&user.ativo===true?user.authUserId:undefined;
  const [config,setConfig]=useState<CustomFieldsConfig>({});
  const [loading,setLoading]=useState(true);
  const [loadFailed,setLoadFailed]=useState(false);
  const baseline=useRef<Baseline|null>(null);
  const generation=useRef(0);
  const confirm=useCallback(async()=>{
    const {data,error}=await supabase.auth.getSession();
    if(!identity||error||data.session?.user.id!==identity)throw Error('Sessão administrativa não confirmada.');
  },[identity]);
  const read=useCallback(async()=>{
    const {data,error}=await supabase.from('system_config').select('configuracoes,updated_at').eq('id',ID).maybeSingle();
    if(error)throw Error('Consulta de campos não confirmada.');
    if(!data)return {config:{} as CustomFieldsConfig,version:null};
    if(!Number.isFinite(Date.parse(data.updated_at)))throw Error('Versão da configuração inválida.');
    return {config:configObject(data.configuracoes) as CustomFieldsConfig,version:data.updated_at};
  },[]);
  const refetch=useCallback(async()=>{
    const request=++generation.current;
    baseline.current=null;setLoading(true);setLoadFailed(false);
    try{
      await confirm();const current=await read();await confirm();
      if(request!==generation.current||!identity)return;
      // Validate loaded scopes before showing editable controls; no default after a read error.
      for(const [screen,group] of Object.entries(current.config)){
        configObject(group);
        for(const unit of Object.keys(group))readAdminScope(current.config,screen,unit);
      }
      baseline.current={identity,config:current.config};setConfig(current.config);
    }catch(error){if(request===generation.current){setLoadFailed(true);toast.error(error instanceof Error?error.message:'Consulta não confirmada.');}}
    finally{if(request===generation.current)setLoading(false);}
  },[confirm,identity,read]);
  useEffect(()=>{void refetch();return()=>{generation.current++;baseline.current=null;};},[refetch]);
  const getRawScreenConfig=useCallback((s:ScreenKey,uid:string)=>readAdminScope(config,s,uid)??emptyAdminScreen(),[config]);
  const updateScreenConfig=useCallback(async(s:ScreenKey,uid:string,next:ScreenConfig):Promise<boolean>=>{
    const loaded=baseline.current;
    if(!loaded||loaded.identity!==identity||!user)return false;
    const snapshot=snapshotConfigPatch({next}).next as ScreenConfig;
    try{
      const merged=await enqueue(async()=>{
        await confirm();
        if(baseline.current!==loaded)throw Error('Contexto de edição alterado.');
        const latest=await read();
        const value=mergeAdminScope(latest.config,s,uid,readAdminScope(loaded.config,s,uid),snapshot,(NATIVE_FIELDS[s]??[]).map(f=>f.nome));
        await confirm();
        const updated_at=new Date(Math.max(Date.now(),latest.version?Date.parse(latest.version)+1:0)).toISOString();
        const payload={configuracoes:value as unknown as Json,updated_at};
        const {data,error}=latest.version
          ?await supabase.from('system_config').update(payload).eq('id',ID).eq('updated_at',latest.version).select('id').maybeSingle()
          :await supabase.from('system_config').insert({id:ID,...payload}).select('id').single();
        if(error||data?.id!==ID)throw Error('Gravação não confirmada. Confira a configuração atual antes de repetir.');
        await confirm();
        return value;
      });
      if(baseline.current===loaded){baseline.current={identity:loaded.identity,config:merged};setConfig(merged);}
      void auditService.log({acao:'ALTERAR_CONFIG_CAMPOS',entidade:'system_config',entidadeId:ID,modulo:'configuracoes',user:{id:user.id,nome:user.nome,role:user.role,unidadeId:user.unidadeId},detalhes:{tela:s,escopo:uid,gravacao_confirmada:true}});
      return true;
    }catch(error){toast.error(error instanceof Error?error.message:'Gravação não confirmada.');return false;}
  },[confirm,identity,read,user]);
  return {getRawScreenConfig,updateScreenConfig,loading,loadFailed,refetch};
}
