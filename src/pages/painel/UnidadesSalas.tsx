import { avisarVideoAtualizado } from '@/lib/painelChamadas';
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { useOperacional } from '@/contexts/OperacionalContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Building2, DoorOpen, Pencil, Tv, Copy, Video, X, Upload, Loader2, Search, Users, CalendarDays, Activity, ChevronRight, RefreshCw, Eye } from 'lucide-react';
import { linkPainelTV, videoSeguro, playlistPainel } from '@/lib/painelVideo';
import { buildRoomStaff, filterStructureRooms, summarizeStructure, OPEN_ROOM_APPOINTMENT_EXCLUSIONS, type RoomStaff, type RoomKind, type RoomState, type UnitMetadata } from '@/lib/structureDirectory';
import { toast } from 'sonner';
import CustomFieldsRenderer from '@/components/CustomFieldsRenderer';
import { useCustomFields } from '@/hooks/useCustomFields';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_DIAGNOSTIC_ROOM_CONFIG, DIAGNOSTIC_EXAM_CATALOG, createDiagnosticExamConfig, normalizeDiagnosticRoomConfig, type DiagnosticRoomConfig } from '@/lib/diagnosticExams';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Link } from 'react-router-dom';
import { UnitScopeNavigator } from '@/components/operacional/UnitScopeNavigator';
import { useOperationalUnitScope } from '@/hooks/useOperationalUnitScope';
import { useUnidadeFilter } from '@/hooks/useUnidadeFilter';

const UnidadesSalas: React.FC = () => {
  const { unidades, salas } = useOperacional();
  const { isGlobalAdmin, userUnidadeId } = useUnidadeFilter();
  const {user}=useAuth();
  const {can,loading:permissionsLoading}=usePermissions();
  const queryClient=useQueryClient();
  const scopeKey=JSON.stringify([user?.id,userUnidadeId,isGlobalAdmin]);
  const scopeRef=useRef(scopeKey);scopeRef.current=scopeKey;
  const authorizedUnit=(id:string)=>isGlobalAdmin||!!userUnidadeId&&id===userUnidadeId;
  const canWrite=(action:'can_create'|'can_edit',id:string)=>!permissionsLoading&&!!user?.id&&can('unidades_salas','can_view')&&can('unidades_salas',action)&&authorizedUnit(id);
  const [saving,setSaving]=useState(false);
  const [formLoading,setFormLoading]=useState(false);
  const [formError,setFormError]=useState('');
  const [configState,setConfigState]=useState<'loading'|'ready'|'error'>('loading');
  const [configReload,setConfigReload]=useState(0);
  const busy=useRef(false);
  const formSequence=useRef(0);
  const original=useRef<Record<string,any>>({});
  const readError=(e:unknown)=>typeof e==='object'&&e!==null&&'message' in e?String(e.message):'Falha ao confirmar a operação.';
  const allowedUnits=unidades.filter(u=>authorizedUnit(u.id));
  const unitScopeKey=allowedUnits.map(u=>u.id).sort().join('|');
  const saveStructure=async(action:string,id:string,unit:string,data:Record<string,unknown>,expected:Record<string,unknown>)=>{
    const result=await supabase.rpc('salvar_estrutura_unidade' as any,{p_action:action,p_id:id,p_unit:unit,p_data:data,p_expected:expected} as any);
    if(result.error)throw result.error;
    if(result.data!==id)throw new Error('O servidor não confirmou a gravação. Atualize a página antes de repetir.');
  };
  const refreshStructure=async()=>{setConfigReload(v=>v+1);await Promise.allSettled([queryClient.invalidateQueries({queryKey:queryKeys.unidades.all}),queryClient.invalidateQueries({queryKey:queryKeys.salas.all})]);};
  const { unitId, setUnitId } = useOperationalUnitScope(unidades, isGlobalAdmin);
  const { resolved: customConfig } = useCustomFields('unidade');
  const [customData, setCustomData] = useState<Record<string, any>>({});
  const [unitDialog, setUnitDialog] = useState(false);
  const [roomDialog, setRoomDialog] = useState(false);
  const [editUnitId, setEditUnitId] = useState<string | null>(null);
  const [editRoomId, setEditRoomId] = useState<string | null>(null);
  const [unitForm, setUnitForm] = useState({ nome: '', nomeExibicao: '', endereco: '', telefone: '', whatsapp: '', cnes: '' });
  const [roomForm, setRoomForm] = useState({ nome: '', unidadeId: '', config: { ...DEFAULT_DIAGNOSTIC_ROOM_CONFIG } as DiagnosticRoomConfig });
  const [roomConfigs, setRoomConfigs] = useState<Record<string, DiagnosticRoomConfig>>({});
  const [roomFilter,setRoomFilter]=useState<RoomKind>('todas');
  const [roomState,setRoomState]=useState<RoomState>('all');
  const [roomSearch,setRoomSearch]=useState('');
  const [section,setSection]=useState<'overview'|'rooms'|'video'>('overview');
  const [detail,setDetail]=useState<{id:string;scope:string}|null>(null);
  const [unitMeta,setUnitMeta]=useState<Map<string,UnitMetadata>>(new Map());
  const [configScope,setConfigScope]=useState('');
  const metadataKey=JSON.stringify([scopeKey,unitScopeKey]);
  const configReady=configState==='ready'&&configScope===metadataKey;
  const visibleUnits=allowedUnits.filter(unit=>unitId==='all'||unit.id===unitId);
  const visibleRooms=salas.filter(room=>authorizedUnit(room.unidadeId)&&(unitId==='all'||room.unidadeId===unitId));
  const visibleUnitIds=visibleUnits.map(u=>u.id).sort();
  const visibleScope=JSON.stringify([scopeKey,unitId,visibleUnitIds]);
  const devices=useMemo(()=>new Set(Object.keys(roomConfigs)),[roomConfigs]);
  const examNames=useMemo(()=>new Map(Object.entries(roomConfigs).map(([id,config])=>[id,config.exames.map(exam=>exam.tipoExame).join(' ')])),[roomConfigs]);
  const summary=summarizeStructure(visibleUnits,visibleRooms,devices,unitMeta,configReady);
  const filteredRooms=filterStructureRooms(visibleRooms,visibleUnits,devices,roomFilter,roomState,roomSearch,configReady,examNames);
  const canReadStaff=!!user?.id&&!permissionsLoading&&can('unidades_salas','can_view')&&can('usuarios','can_view');
  const canReadAgenda=!!user?.id&&!permissionsLoading&&can('unidades_salas','can_view')&&can('agenda','can_view');
  // Read only minimal staff fields, within the chosen unit and existing RLS.
  const staffQuery=useQuery({
    queryKey:[...queryKeys.funcionarios.all,'estrutura-salas',visibleScope],
    enabled:canReadStaff&&visibleUnitIds.length>0,
    staleTime:30000,
    queryFn:async({signal})=>{
      const rows:RoomStaff[]=[];
      for(let offset=0;;offset+=500){
        const {data,error}=await supabase.from('funcionarios').select('id,nome,profissao,cargo,unidade_id,sala_id').eq('ativo',true).in('unidade_id',visibleUnitIds).not('sala_id','is',null).order('id').range(offset,offset+499).abortSignal(signal);
        if(error||!data)throw error||new Error('Consulta de equipe não confirmada.');
        rows.push(...data.filter(row=>!!row.unidade_id).map(row=>({...row,unidade_id:row.unidade_id!})));
        if(data.length<500)break;
      }
      return rows;
    }
  });
  const staffReady=canReadStaff&&staffQuery.isSuccess&&!staffQuery.isError;
  const roomStaff=buildRoomStaff(visibleRooms,staffReady?staffQuery.data||[]:[]);
  const selectedRoom=detail?.scope===visibleScope?visibleRooms.find(room=>room.id===detail.id):undefined;
  const dateParts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santarem',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const today=['year','month','day'].map(type=>dateParts.find(p=>p.type===type)?.value||'').join('-');
  const appointmentsQuery=useQuery({
    queryKey:[...queryKeys.agendamentos.all,'estrutura-sala',visibleScope,selectedRoom?.id||'',today],
    enabled:canReadAgenda&&!!selectedRoom,
    staleTime:0,
    queryFn:async({signal})=>{
      if(!selectedRoom)throw new Error('Selecione uma sala.');
      const {data,error,count}=await supabase.from('agendamentos').select('id,data,hora,status,profissional_nome',{count:'exact'}).eq('unidade_id',selectedRoom.unidadeId).eq('sala_id',selectedRoom.id).gte('data',today).not('status','in','('+OPEN_ROOM_APPOINTMENT_EXCLUSIONS.join(',')+')').order('data').order('hora').order('id').limit(50).abortSignal(signal);
      if(error||!data||count===null)throw error||new Error('Consulta de agendamentos não confirmada.');
      return {rows:data,total:count};
    }
  });
  const selectMetric=(next:'overview'|'rooms'|'video',kind:RoomKind='todas')=>{setSection(next);setRoomFilter(kind);setRoomState('all');setRoomSearch('');setDetail(null);};
  useEffect(()=>{setDetail(null);setRoomSearch('');setRoomState('all');},[visibleScope]);

  // Carrega as configurações persistidas por unidade para identificar os aparelhos nos cartões.
  useEffect(() => {
    let cancelled = false;
    const loadRoomConfigs = async () => {
      setConfigState('loading');setConfigScope('');
      if (allowedUnits.length === 0) { setRoomConfigs({});setUnitMeta(new Map());setConfigScope(metadataKey);setConfigState('ready'); return; }
      const { data, error } = await supabase.from('unidades' as any).select('id,custom_data').in('id',allowedUnits.map(u=>u.id));
      if(cancelled)return;
      if(error||!Array.isArray(data)||data.length!==allowedUnits.length){setRoomConfigs({});setUnitMeta(new Map());setConfigState('error');return;}
      const next: Record<string, DiagnosticRoomConfig> = {};
      const metadata=new Map<string,UnitMetadata>();
      (data || []).forEach((unit: any) => {
        const cd=(unit.custom_data||{}) as Record<string,unknown>;
        metadata.set(unit.id,{cnes:String(cd.cnes??''),videoConfigured:playlistPainel(cd).length>0});
        const configuredRooms = unit.custom_data?.salas_exames;
        if (!configuredRooms || typeof configuredRooms !== 'object') return;
        Object.entries(configuredRooms).forEach(([roomId, value]: [string, any]) => {
          if (value?.finalidade === 'aparelho_diagnostico') {
            next[roomId] = normalizeDiagnosticRoomConfig(value);
          }
        });
      });
      if (!cancelled) {setRoomConfigs(next);setUnitMeta(metadata);setConfigScope(metadataKey);setConfigState('ready');}
    };
    void loadRoomConfigs().catch(()=>{if(!cancelled){setRoomConfigs({});setUnitMeta(new Map());setConfigState('error');}});
    return () => { cancelled = true; };
  }, [unidades,unitScopeKey,scopeKey,configReload]);

  const [enviandoLogo, setEnviandoLogo] = useState(false);
  const enviarLogo = async (file: File) => {
    if(busy.current||formLoading||formError||!canWrite(editUnitId?'can_edit':'can_create',editUnitId||''))return;
    const seq=formSequence.current,scope=scopeKey;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast.error('Use PNG, JPG ou WEBP.'); return; }
    if (file.size > 3 * 1024 * 1024) { toast.error('A imagem deve ter até 3 MB.'); return; }
    setEnviandoLogo(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `unidades/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('document-logos').upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from('document-logos').getPublicUrl(path);
      if(seq!==formSequence.current||scopeRef.current!==scope)return;
      setCustomData(p => ({ ...p, logo_url: data.publicUrl }));
      toast.success('Logo carregada. Clique em Salvar para gravar.');
    } catch (e: any) {
      toast.error('Não foi possível enviar a logo: ' + (e?.message || 'erro'));
    } finally { setEnviandoLogo(false); }
  };

  const onlyDigits = (v: string) => (v || '').replace(/\D/g, '').slice(0, 7);

  const startForm=()=>{if(busy.current||enviandoLogo||enviando)return false;formSequence.current++;original.current={};setFormError('');setFormLoading(false);return true;};
  const openNewUnit=()=>{if(!isGlobalAdmin||!canWrite('can_create','')||!startForm())return;setEditUnitId(null);setUnitForm({nome:'',nomeExibicao:'',endereco:'',telefone:'',whatsapp:'',cnes:''});setCustomData({});setUnitDialog(true);};
  const openEditUnit=async(u:typeof unidades[0])=>{
    if(!canWrite('can_edit',u.id)||!startForm())return;
    const seq=formSequence.current,scope=scopeKey;
    setEditUnitId(u.id);setUnitDialog(true);setFormLoading(true);setCustomData({});
    setUnitForm({nome:u.nome,nomeExibicao:u.nomeExibicao||'',endereco:u.endereco,telefone:u.telefone,whatsapp:u.whatsapp,cnes:''});
    try{
      const {data,error}=await supabase.from('unidades').select('id,nome,nome_exibicao,endereco,telefone,whatsapp,custom_data').eq('id',u.id).single();
      if(seq!==formSequence.current||scopeRef.current!==scope)return;
      if(error||!data)throw error||new Error('Unidade não encontrada.');
      const cd=(data.custom_data||{}) as Record<string,any>;
      original.current={...data,custom_data:cd};
      setUnitForm({nome:data.nome,nomeExibicao:data.nome_exibicao||'',endereco:data.endereco,telefone:data.telefone,whatsapp:data.whatsapp,cnes:onlyDigits(String(cd.cnes||''))});
      setCustomData({...cd});
    }catch(e){if(seq===formSequence.current&&scopeRef.current===scope)setFormError(readError(e));}
    finally{if(seq===formSequence.current&&scopeRef.current===scope)setFormLoading(false);}
  };
  const openNewRoom=(finalidade:DiagnosticRoomConfig['finalidade']='consultorio_clinico')=>{
    const selected=unitId!=='all'?unitId:allowedUnits.length===1?allowedUnits[0].id:'';
    if(!allowedUnits.some(u=>u.ativo&&canWrite('can_create',u.id))||!startForm())return;
    setEditRoomId(null);setRoomForm({nome:'',unidadeId:selected,config:{...DEFAULT_DIAGNOSTIC_ROOM_CONFIG,finalidade}});setRoomDialog(true);
  };
  const openEditRoom=async(s:typeof salas[0])=>{
    if(!canWrite('can_edit',s.unidadeId)||!startForm())return;
    const seq=formSequence.current,scope=scopeKey;
    setEditRoomId(s.id);setRoomForm({nome:s.nome,unidadeId:s.unidadeId,config:{...DEFAULT_DIAGNOSTIC_ROOM_CONFIG}});setRoomDialog(true);setFormLoading(true);
    try{
      const [unit,room]=await Promise.all([supabase.from('unidades').select('custom_data').eq('id',s.unidadeId).single(),supabase.from('salas').select('nome,unidade_id').eq('id',s.id).single()]);
      if(seq!==formSequence.current||scopeRef.current!==scope)return;
      if(unit.error||room.error||!unit.data||!room.data||room.data.unidade_id!==s.unidadeId)throw new Error('Não foi possível confirmar os dados da sala.');
      const cd=(unit.data.custom_data||{}) as Record<string,any>;
      original.current={nome:room.data.nome,...(cd.salas_exames?.[s.id]!==undefined?{config:cd.salas_exames[s.id]}:{})};
      setRoomForm({nome:room.data.nome,unidadeId:s.unidadeId,config:normalizeDiagnosticRoomConfig(cd.salas_exames?.[s.id])});
    }catch(e){if(seq===formSequence.current&&scopeRef.current===scope)setFormError(readError(e));}
    finally{if(seq===formSequence.current&&scopeRef.current===scope)setFormLoading(false);}
  };
  const handleSaveUnit=async()=>{
    if(busy.current||formLoading||formError||enviandoLogo||!unitForm.nome.trim()||!canWrite(editUnitId?'can_edit':'can_create',editUnitId||'')||(!editUnitId&&!isGlobalAdmin))return;
    const cnes=onlyDigits(unitForm.cnes);
    if(cnes&&cnes.length!==7){toast.error('CNES deve conter 7 dígitos.');return;}
    const initial=original.current.custom_data||{};
    const reserved=new Set(['salas_exames','video_urls','video_url','cnes','logo_url','__proto__','constructor','prototype']);
    const keys=[...new Set(['logo_url',...customConfig.fields.filter(f=>f.ativo&&!reserved.has(f.nome)).map(f=>f.nome)])];
    const patch:Record<string,unknown>={};
    for(const key of keys)if(JSON.stringify(customData[key])!==JSON.stringify(initial[key]))patch[key]=customData[key]??null;
    if(cnes!==String(initial.cnes||''))patch.cnes=cnes||null;
    const data={nome:unitForm.nome.trim(),nome_exibicao:unitForm.nomeExibicao,endereco:unitForm.endereco,telefone:unitForm.telefone,whatsapp:unitForm.whatsapp};
    const id=editUnitId||'un'+crypto.randomUUID(),scope=scopeKey;
    busy.current=true;setSaving(true);
    try{
      await saveStructure(editUnitId?'unit_edit':'unit_create',id,'',{...data,...(editUnitId?{custom_patch:patch}:{custom_data:Object.fromEntries(Object.entries(patch).filter(([,v])=>v!==null))})},original.current);
      await refreshStructure();
      if(scopeRef.current===scope){toast.success(editUnitId?'Unidade atualizada!':'Unidade criada!');setUnitDialog(false);}
    }catch(e){if(scopeRef.current===scope)toast.error(readError(e));}
    finally{busy.current=false;setSaving(false);}
  };
  const handleSaveRoom=async()=>{
    if(busy.current||formLoading||formError||!roomForm.nome.trim()||!roomForm.unidadeId||!canWrite(editRoomId?'can_edit':'can_create',roomForm.unidadeId)||!allowedUnits.some(u=>u.id===roomForm.unidadeId&&u.ativo))return;
    if(editRoomId&&salas.find(s=>s.id===editRoomId)?.unidadeId!==roomForm.unidadeId){toast.error('A transferência de sala exige revisão dos vínculos.');return;}
    const preserveConfig=!!editRoomId&&JSON.stringify(roomForm.config)===JSON.stringify(normalizeDiagnosticRoomConfig(original.current.config));
    if(!preserveConfig&&roomForm.config.finalidade==='aparelho_diagnostico'&&(!roomForm.config.exames.length||roomForm.config.exames.some(exam=>!exam.tipoExame.trim()))){toast.error('Selecione pelo menos um exame e informe o nome dos exames personalizados.');return;}
    const id=editRoomId||'s'+crypto.randomUUID(),scope=scopeKey;
    busy.current=true;setSaving(true);
    try{
      await saveStructure(editRoomId?'room_edit':'room_create',id,roomForm.unidadeId,{nome:roomForm.nome.trim(),finalidade:roomForm.config.finalidade,config:normalizeDiagnosticRoomConfig(roomForm.config),preserve_config:preserveConfig},original.current);
      await refreshStructure();
      if(scopeRef.current===scope){toast.success(editRoomId?'Sala atualizada!':'Sala criada!');setRoomDialog(false);}
    }catch(e){if(scopeRef.current===scope)toast.error(readError(e));}
    finally{busy.current=false;setSaving(false);}
  };

  const [videoUnit, setVideoUnit] = useState<{ id: string; nome: string } | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoList, setVideoList] = useState<string[]>([]);
  const addUrl = () => {
    const v = videoUrl.trim();
    if (!v) return;
    if (!videoSeguro(v)) { toast.error('Informe um endereço https://'); return; }
    setVideoList(l => [...l, v]); setVideoUrl('');
  };
  const moverVideo = (i: number, d: number) => setVideoList(l => {
    const j = i + d; if (j < 0 || j >= l.length) return l;
    const n = [...l]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  const [enviando, setEnviando] = useState(false);

  const linkTV = (id: string) => {
    return linkPainelTV(window.location.origin, id);
  };
  const copiarLink = async (id: string) => {
    try { await navigator.clipboard.writeText(linkTV(id)); toast.success('Link da TV copiado!'); }
    catch { toast.error('Copie manualmente: ' + linkTV(id)); }
  };
  const abrirVideo=async(id:string,nome:string)=>{
    if(!canWrite('can_edit',id)||!startForm())return;
    const seq=formSequence.current,scope=scopeKey;
    setVideoUnit({id,nome});setVideoUrl('');setVideoList([]);setFormLoading(true);
    try{
      const {data,error}=await supabase.from('unidades').select('custom_data').eq('id',id).single();
      if(seq!==formSequence.current||scopeRef.current!==scope)return;
      if(error||!data)throw error||new Error('Configuração não encontrada.');
      const cd=(data.custom_data||{}) as Record<string,any>;
      original.current=cd;
      const list=Array.isArray(cd.video_urls)?cd.video_urls.filter((x:unknown)=>typeof x==='string'&&x):cd.video_url?[String(cd.video_url)]:[];
      setVideoList(list);
    }catch(e){if(seq===formSequence.current&&scopeRef.current===scope)setFormError(readError(e));}
    finally{if(seq===formSequence.current&&scopeRef.current===scope)setFormLoading(false);}
  };
  const enviarVideo = async (file: File) => {
    if (!videoUnit||busy.current||formLoading||formError||!canWrite('can_edit',videoUnit.id)) return;
    const seq=formSequence.current,scope=scopeKey;
    if (file.type !== 'video/mp4') { toast.error('Selecione um arquivo MP4.'); return; }
    if (file.size > 100 * 1024 * 1024) { toast.error('O vídeo deve ter até 100 MB.'); return; }
    setEnviando(true);
    try {
      const path = `${videoUnit.id}/${Date.now()}.mp4`;
      const { error } = await supabase.storage.from('painel-videos').upload(path, file, { contentType: 'video/mp4', upsert: true });
      if (error) throw error;
      const { data, error: e2 } = await supabase.storage.from('painel-videos').createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (e2 || !data) throw e2;
      if(seq!==formSequence.current||scopeRef.current!==scope)return;
      setVideoList(l => [...l, data.signedUrl]);
      toast.success('Vídeo adicionado à lista. Clique em Salvar Configuração.');
    } catch (e: any) {
      toast.error('Falha no envio: ' + (e?.message || 'erro'));
    } finally { setEnviando(false); }
  };
  const salvarVideo=async()=>{
    if(!videoUnit||busy.current||formLoading||formError||enviando||!canWrite('can_edit',videoUnit.id))return;
    const pend=videoUrl.trim(),lista=pend?[...videoList,pend]:videoList;
    if(lista.some(v=>!videoSeguro(v))){toast.error('Revise os endereços HTTPS dos vídeos.');return;}
    const id=videoUnit.id,scope=scopeKey;
    busy.current=true;setSaving(true);
    try{
      await saveStructure('video',id,'',{video_urls:lista},original.current);
      await refreshStructure();
      void avisarVideoAtualizado(id);
      if(scopeRef.current===scope){toast.success('Vídeo salvo! A TV atualiza sozinha.');setVideoUnit(null);}
    }catch(e){if(scopeRef.current===scope)toast.error(readError(e));}
    finally{busy.current=false;setSaving(false);}
  };
  const closeForm=(close:()=>void)=>{if(busy.current||enviando||enviandoLogo)return;formSequence.current++;setFormLoading(false);setFormError('');close();};
  useEffect(()=>{formSequence.current++;setUnitDialog(false);setRoomDialog(false);setVideoUnit(null);setFormError('');setFormLoading(false);},[scopeKey]);

  const renderRoomCard = (room: typeof salas[number], showUnitName = true) => {
    const unit = unidades.find(item => item.id === room.unidadeId);
    const diagnosticConfig = configReady?roomConfigs[room.id]:undefined;
    return (
      <Card key={room.id} className="shadow-card border">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3><button type="button" className="font-semibold text-left text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring rounded break-words" onClick={()=>setDetail({id:room.id,scope:visibleScope})}>{room.nome}</button></h3>
              {showUnitName && <p className="text-sm text-muted-foreground">{unit?.nome || 'Unidade não identificada'}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {diagnosticConfig ? (
                  <>
                    <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800">Aparelho / Exames: {diagnosticConfig.exames.length}</span>
                    <span className="text-xs text-muted-foreground">{diagnosticConfig.exames.map(exam => exam.tipoExame).join(', ')}</span>
                  </>
                ) : <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">{configReady?'Consultório':'Finalidade não confirmada'}</span>}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span className={room.ativo?'text-emerald-700 dark:text-emerald-300':'text-muted-foreground'}>{room.ativo?'Ativa':'Inativa'}</span>{canReadStaff&&<span className="text-muted-foreground">· {staffReady?(roomStaff.get(room.id)?.length||0):'—'} funcionário(s) ativo(s) vinculado(s)</span>}</div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button type="button" size="icon" variant="ghost" title="Consultar detalhes" aria-label={`Consultar detalhes de ${room.nome}`} onClick={()=>setDetail({id:room.id,scope:visibleScope})}><Eye className="w-4 h-4"/></Button>
              {canWrite('can_edit',room.unidadeId)&&<Button size="icon" variant="ghost" disabled={saving} aria-label={`Editar sala ${room.nome}`} onClick={() => openEditRoom(room)}><Pencil className="w-4 h-4" /></Button>}

            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const roomControls = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold font-display text-foreground flex items-center gap-2"><DoorOpen className="w-5 h-5" />Salas / Consultórios</h2>
          <p className="text-xs text-muted-foreground mt-1">{visibleRooms.length} sala(s) cadastrada(s) • {configReady?summary.devices:'—'} aparelho(s) diagnóstico(s)</p>
        </div>
        {allowedUnits.some(u=>u.ativo&&canWrite('can_create',u.id))&&<div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={saving} variant="outline" onClick={() => openNewRoom('aparelho_diagnostico')} className="border-violet-300 text-violet-700 hover:bg-violet-50"><Plus className="w-4 h-4 mr-1" />Novo Aparelho</Button>
          <Button size="sm" disabled={saving} onClick={() => openNewRoom('consultorio_clinico')} className="gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-1" />Nova Sala</Button>
        </div>}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar salas por finalidade">
        <Button size="sm" variant={roomFilter === 'todas' ? 'default' : 'outline'} aria-pressed={roomFilter === 'todas'} onClick={() => setRoomFilter('todas')}>Todas ({visibleRooms.length})</Button>
        <Button size="sm" variant={roomFilter === 'consultorios' ? 'default' : 'outline'} aria-pressed={roomFilter === 'consultorios'} disabled={!configReady} onClick={() => setRoomFilter('consultorios')}>Consultórios ({configReady?summary.consultories:'—'})</Button>
        <Button size="sm" variant={roomFilter === 'aparelhos' ? 'default' : 'outline'} aria-pressed={roomFilter === 'aparelhos'} disabled={!configReady} onClick={() => setRoomFilter('aparelhos')}>Aparelhos / Exames ({configReady?summary.devices:'—'})</Button>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[12rem]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/><Input className="pl-9" value={roomSearch} onChange={e=>setRoomSearch(e.target.value)} placeholder="Buscar sala, unidade ou exame..." aria-label="Buscar sala, unidade ou exame"/></div>
        <Select value={roomState} onValueChange={v=>setRoomState(v as RoomState)}><SelectTrigger className="w-full sm:w-44" aria-label="Filtrar situação da sala"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todas as situações</SelectItem><SelectItem value="active">Ativas</SelectItem><SelectItem value="inactive">Inativas</SelectItem></SelectContent></Select>
        {(roomSearch||roomFilter!=='todas'||roomState!=='all')&&<Button variant="outline" size="sm" onClick={()=>{setRoomSearch('');setRoomFilter('todas');setRoomState('all');}}>Limpar filtros</Button>}
        <span role="status" className="text-xs text-muted-foreground">{roomFilter!=='todas'&&!configReady?'Finalidade em conferência':filteredRooms.length+' sala(s) no filtro'}</span>
      </div>
      {canReadStaff&&staffQuery.isError&&<div role="alert" className="text-sm text-destructive flex flex-wrap gap-2 items-center">Não foi possível confirmar os vínculos da equipe.<Button size="sm" variant="outline" onClick={()=>void staffQuery.refetch()}>Tentar novamente</Button></div>}
    </div>
  );

  const blocked=saving||formLoading||!!formError;
  const formStatus=formLoading?<p role="status" className="text-sm text-muted-foreground">Carregando configuração existente...</p>:formError?<p role="alert" className="text-sm text-destructive">{formError} Feche e reabra o formulário antes de salvar.</p>:null;
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground">Unidades e Salas</h1>
        <p className="text-muted-foreground text-sm">Gerenciar estrutura física</p>
        <p className="text-xs text-muted-foreground mt-1">Exclusões definitivas e transferências de salas estão protegidas para preservar os vínculos históricos.</p>
      </div>

      {configState==='error'&&<div role="alert" className="flex items-center gap-2 text-sm text-destructive">Não foi possível confirmar as configurações de exames.<Button size="sm" variant="outline" onClick={()=>setConfigReload(v=>v+1)}>Tentar novamente</Button></div>}
      {isGlobalAdmin && <UnitScopeNavigator units={allowedUnits} value={unitId} onChange={setUnitId} />}
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-2" aria-label="Indicadores da estrutura física">
        {[
          {label:'Unidades cadastradas',value:summary.units,extra:summary.activeUnits+' ativa(s)',Icon:Building2,active:section==='overview',action:()=>selectMetric('overview'),disabled:false},
          {label:'Salas cadastradas',value:summary.rooms,extra:summary.activeRooms+' ativa(s)',Icon:DoorOpen,active:section==='rooms'&&roomFilter==='todas',action:()=>selectMetric('rooms'),disabled:false},
          {label:'Aparelhos / exames',value:summary.devices,extra:'Classificação cadastrada',Icon:Activity,active:section==='rooms'&&roomFilter==='aparelhos',action:()=>selectMetric('rooms','aparelhos'),disabled:!configReady},
          {label:'Unidades com vídeo',value:summary.videoUnits,extra:'Configuração local, não status da TV',Icon:Tv,active:section==='video',action:()=>selectMetric('video'),disabled:!configReady}
        ].map(({label,value,extra,Icon,active,action,disabled})=><button type="button" key={label} disabled={disabled} onClick={action} aria-pressed={active} className={`clinical-premium p-3 flex items-center gap-2 text-left min-w-0 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-ring ${active?'ring-1 ring-primary/60':''}`}><span className="clinical-dock-icon clinical-tone-blue"><Icon className="w-4 h-4"/></span><span className="flex-1 min-w-0"><strong className="block text-xl tabular-nums">{value??'—'}</strong><span className="block text-xs font-medium">{label}</span><span className="block text-[11px] text-muted-foreground">{extra}</span></span><ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground"/></button>)}
      </section>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Seções de estrutura">
        <Button size="sm" variant={section==='overview'?'default':'outline'} onClick={()=>selectMetric('overview')}>Visão geral</Button>
        <Button size="sm" variant={section==='rooms'&&roomFilter==='todas'?'default':'outline'} onClick={()=>selectMetric('rooms')}>Salas</Button>
        <Button size="sm" variant={section==='rooms'&&roomFilter==='aparelhos'?'default':'outline'} disabled={!configReady} onClick={()=>selectMetric('rooms','aparelhos')}>Aparelhos</Button>
        <Button size="sm" variant={section==='video'?'default':'outline'} disabled={!configReady} onClick={()=>selectMetric('video')}>Unidades com vídeo</Button>
        <Button size="sm" variant="outline" className="ml-auto" disabled={saving||configState==='loading'} onClick={()=>{void refreshStructure();if(canReadStaff&&visibleUnitIds.length)void staffQuery.refetch();}}><RefreshCw className="w-4 h-4 mr-1"/>Atualizar estrutura</Button>
      </div>

      {/* Unidades */}
      {section!=='rooms'&&<div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold font-display text-foreground flex items-center gap-2"><Building2 className="w-5 h-5" />Unidades</h2>
          {isGlobalAdmin&&canWrite('can_create','')&&<Button size="sm" disabled={saving} onClick={openNewUnit} className="gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-1" />Nova Unidade</Button>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visibleUnits.filter(u=>section!=='video'||(configReady&&unitMeta.get(u.id)?.videoConfigured)).map(u => (
            <Card key={u.id} className="shadow-card border-0">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">{u.nome}</h3>
                    {u.nomeExibicao && <p className="text-xs text-primary font-medium">Exibido como: {u.nomeExibicao}</p>}
                    <p className="text-sm text-muted-foreground mt-1">{u.endereco}</p>
                    <p className="text-sm text-muted-foreground">{u.telefone} • {u.whatsapp}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs"><span>{u.ativo?'Unidade ativa':'Unidade inativa'}</span><span className="text-muted-foreground">· {visibleRooms.filter(s=>s.unidadeId===u.id).length} sala(s)</span>{configReady&&<span className="text-muted-foreground">· {/^\d{7}$/.test(unitMeta.get(u.id)?.cnes||'')?'CNES informado':'CNES a conferir'}</span>}</div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Button size="sm" variant="outline" onClick={() => window.open(linkTV(u.id), '_blank')}><Tv className="w-4 h-4 mr-1" />Painel</Button>
                      <Button size="sm" variant="outline" onClick={() => copiarLink(u.id)}><Copy className="w-4 h-4 mr-1" />Link TV</Button>
                      {canWrite('can_edit',u.id)&&<Button size="sm" variant="outline" disabled={saving} onClick={() => abrirVideo(u.id, u.nome)}><Video className="w-4 h-4 mr-1" />Vídeo</Button>}
                      <Button size="sm" variant="outline" onClick={()=>{if(isGlobalAdmin)setUnitId(u.id);selectMetric('rooms');}}>Ver salas</Button>
                      {canReadStaff&&<Button size="sm" variant="outline" asChild><Link to={`/painel/funcionarios?unidade=${encodeURIComponent(u.id)}`}>Ver equipe</Link></Button>}
                      {can('disponibilidade','can_view')&&<Button size="sm" variant="outline" asChild><Link to={`/painel/disponibilidade?unidade=${encodeURIComponent(u.id)}`}>Ver disponibilidade</Link></Button>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {canWrite('can_edit',u.id)&&<Button size="icon" variant="ghost" disabled={saving} aria-label={`Editar unidade ${u.nome}`} onClick={() => openEditUnit(u)}><Pencil className="w-4 h-4" /></Button>}

                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>}

      {section==='video'&&configReady&&summary.videoUnits===0&&<Card><CardContent className="p-4 text-sm text-muted-foreground">Nenhuma unidade com vídeo configurado na seleção. Na visão geral, utilize a ação Vídeo para configurar.</CardContent></Card>}
      {section!=='video'&&<section className="space-y-3" aria-label="Salas e consultórios">
        {roomControls}
        {roomFilter!=='todas'&&!configReady?<p className="text-sm text-muted-foreground">Aguarde a confirmação das configurações de exames.</p>:filteredRooms.length===0?<Card><CardContent className="p-4 text-sm text-muted-foreground">Nenhuma sala encontrada para os filtros selecionados.</CardContent></Card>:<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">{filteredRooms.map(room=>renderRoomCard(room))}</div>}
      </section>}

      <Dialog open={!!selectedRoom&&!permissionsLoading&&can('unidades_salas','can_view')} onOpenChange={open=>{if(!open)setDetail(null);}}>
        <DialogContent className="w-[96vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display break-words">Detalhes da sala — {selectedRoom?.nome}</DialogTitle><DialogDescription>Consulta administrativa dos vínculos existentes, sem alterações na agenda.</DialogDescription></DialogHeader>
          {selectedRoom&&<>
            <div className="clinical-premium p-3 space-y-2"><p className="font-medium">{visibleUnits.find(u=>u.id===selectedRoom.unidadeId)?.nome||'Unidade não identificada'}</p><p className="text-sm text-muted-foreground">{selectedRoom.ativo?'Ativa':'Inativa'} · {configReady?(devices.has(selectedRoom.id)?'Aparelho / exame diagnóstico':'Consultório clínico'):'Finalidade não confirmada'}</p>{configReady&&roomConfigs[selectedRoom.id]&&<p className="text-sm">Exames cadastrados: {examNames.get(selectedRoom.id)||'Nenhum exame identificado'}</p>}</div>
            {canReadStaff&&<section className="clinical-premium p-3 space-y-2"><h3 className="font-semibold flex gap-2 items-center"><Users className="w-4 h-4"/>Equipe vinculada {staffReady&&`(${roomStaff.get(selectedRoom.id)?.length||0})`}</h3><p className="text-xs text-muted-foreground">Funcionários ativos com vínculo direto à sala e à mesma unidade, nos registros acessíveis. Não indica presença ou escala.</p>{staffQuery.isError?<div role="alert" className="text-sm text-destructive">Consulta não confirmada. <Button size="sm" variant="outline" onClick={()=>void staffQuery.refetch()}>Tentar novamente</Button></div>:!staffReady?<p role="status" className="text-sm text-muted-foreground">Consultando equipe...</p>:!(roomStaff.get(selectedRoom.id)?.length)?<p className="text-sm text-muted-foreground">Nenhum funcionário ativo com esse vínculo identificado.</p>:<div className="max-h-40 overflow-y-auto divide-y">{(roomStaff.get(selectedRoom.id)||[]).map(f=><div key={f.id} className="py-2 text-sm"><strong>{f.nome}</strong><p className="text-xs text-muted-foreground">{f.profissao||f.cargo||'Função não informada'}</p></div>)}</div>}</section>}
            {canReadAgenda&&<section className="clinical-premium p-3 space-y-2"><h3 className="font-semibold flex items-center gap-2"><CalendarDays className="w-4 h-4"/>Agendamentos vinculados</h3><p className="text-xs text-muted-foreground">De hoje em diante, excluindo cancelados, remarcados, concluídos e faltas. Somente registros acessíveis com vínculo explícito à sala; não representa ocupação, presença ou vagas livres.</p>{appointmentsQuery.isError?<div role="alert" className="text-sm text-destructive">Consulta não confirmada. <Button size="sm" variant="outline" onClick={()=>void appointmentsQuery.refetch()}>Tentar novamente</Button></div>:appointmentsQuery.isFetching?<p role="status" className="text-sm text-muted-foreground">Consultando agendamentos...</p>:appointmentsQuery.isSuccess?<><p className="text-sm font-semibold">{appointmentsQuery.data.total} registro(s) não encerrado(s)</p>{appointmentsQuery.data.rows.length>0&&<div className="max-h-60 overflow-y-auto divide-y">{appointmentsQuery.data.rows.map(item=><div key={item.id} className="py-2 flex flex-wrap gap-x-3 gap-y-1 items-start text-xs"><span className="font-medium tabular-nums">{item.data.split('-').reverse().join('/')} · {item.hora.slice(0,5)}</span><span className="flex-1 min-w-[8rem]">{item.profissional_nome||'Profissional não informado'}</span><span className="text-muted-foreground">{item.status.replaceAll('_',' ')}</span></div>)}</div>}{appointmentsQuery.data.total>appointmentsQuery.data.rows.length&&<p className="text-xs text-muted-foreground">Exibindo os primeiros {appointmentsQuery.data.rows.length} registros; consulte a Agenda para a lista completa.</p>}</>:<p className="text-sm text-muted-foreground">Consulta em preparação...</p>}<Button size="sm" variant="outline" asChild><Link to="/painel/agenda">Consultar Agenda</Link></Button></section>}
            {(!canReadStaff||!canReadAgenda)&&<p className="text-xs text-muted-foreground">As consultas de equipe e Agenda dependem das permissões correspondentes.</p>}
          </>}
        </DialogContent>
      </Dialog>

      {/* Dialogs */}
      <Dialog open={unitDialog} onOpenChange={o=>{if(!o)closeForm(()=>setUnitDialog(false));}}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">{editUnitId ? 'Editar' : 'Nova'} Unidade</DialogTitle></DialogHeader>
          {formStatus}<fieldset disabled={blocked||enviandoLogo} className="space-y-3">
            <div><Label>Nome *</Label><Input value={unitForm.nome} onChange={e => setUnitForm(p => ({ ...p, nome: e.target.value }))} /></div>
            <div><Label>Nome exibido no sistema</Label><Input value={unitForm.nomeExibicao} onChange={e => setUnitForm(p => ({ ...p, nomeExibicao: e.target.value }))} placeholder="Ex: CER II (aparece no menu lateral)" /></div>
            <div><Label>Endereço</Label><Input value={unitForm.endereco} onChange={e => setUnitForm(p => ({ ...p, endereco: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Telefone</Label><Input value={unitForm.telefone} onChange={e => setUnitForm(p => ({ ...p, telefone: e.target.value }))} /></div>
              <div><Label>WhatsApp</Label><Input value={unitForm.whatsapp} onChange={e => setUnitForm(p => ({ ...p, whatsapp: e.target.value }))} /></div>
            </div>
            <div>
              <Label>CNES (Cadastro Nacional de Estabelecimentos de Saúde)</Label>
              <Input
                value={unitForm.cnes}
                onChange={e => setUnitForm(p => ({ ...p, cnes: onlyDigits(e.target.value) }))}
                placeholder="0000000"
                maxLength={7}
                inputMode="numeric"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                7 dígitos. Usado na produção do BPA-I (SIA/SUS) como CNES do estabelecimento.
              </p>
            </div>
            <div>
              <Label>Logo da unidade (documentos impressos)</Label>
              <div className="flex items-center gap-3 mt-1">
                {customData.logo_url ? (
                  <img src={customData.logo_url} alt="Logo da unidade" className="h-14 w-14 object-contain rounded border bg-background" />
                ) : (
                  <div className="h-14 w-14 rounded border border-dashed flex items-center justify-center text-[10px] text-muted-foreground">Sem logo</div>
                )}
                <label className="inline-flex">
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={enviandoLogo}
                    onChange={e => { const f = e.target.files?.[0]; if (f) enviarLogo(f); e.target.value = ''; }} />
                  <span className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border cursor-pointer hover:bg-muted">
                    {enviandoLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Enviar logo
                  </span>
                </label>
                {customData.logo_url && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setCustomData(p => { const n = { ...p }; delete n.logo_url; return n; })}><X className="w-4 h-4 mr-1" />Remover</Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Sai no lado direito do cabeçalho dos documentos emitidos por profissionais desta unidade. Sem logo, usa a logo oficial do município. Clique em Salvar para gravar.
              </p>
            </div>
            {customConfig.fields.length > 0 && (
              <CustomFieldsRenderer
                fields={customConfig.fields}
                values={customData}
                onChange={(field, value) => setCustomData(prev => ({ ...prev, [field]: value }))}
              />
            )}
            <Button onClick={handleSaveUnit} disabled={blocked||enviandoLogo} className="w-full gradient-primary text-primary-foreground">{saving?'Salvando...':editUnitId ? 'Salvar' : 'Criar'}</Button>
          </fieldset>
        </DialogContent>
      </Dialog>

      <Dialog open={roomDialog} onOpenChange={o=>{if(!o)closeForm(()=>setRoomDialog(false));}}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">{editRoomId ? 'Editar' : 'Nova'} Sala</DialogTitle></DialogHeader>
          {formStatus}<fieldset disabled={blocked} className="space-y-3">
            <div><Label>Nome *</Label><Input value={roomForm.nome} onChange={e => setRoomForm(p => ({ ...p, nome: e.target.value }))} /></div>
            <div><Label>Unidade *</Label>
              <Select disabled={!!editRoomId||blocked} value={roomForm.unidadeId} onValueChange={v => setRoomForm(p => ({ ...p, unidadeId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{allowedUnits.filter(u=>u.ativo&&canWrite(editRoomId?'can_edit':'can_create',u.id)).map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Finalidade da Sala</Label>
              <Select value={roomForm.config.finalidade} onValueChange={v => setRoomForm(p => ({ ...p, config: { ...p.config, finalidade: v as DiagnosticRoomConfig['finalidade'] } }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="consultorio_clinico">Consultório Clínico (Padrão)</SelectItem>
                  <SelectItem value="aparelho_diagnostico">Aparelho / Exame Diagnóstico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {roomForm.config.finalidade === 'aparelho_diagnostico' && (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="space-y-2">
                  <Label>Exames disponíveis nesta sala *</Label>
                  <p className="text-xs text-muted-foreground">Marque todos os exames realizados neste aparelho. Cada um terá duração, preparo e prazo próprios.</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {DIAGNOSTIC_EXAM_CATALOG.map(item => {
                      const selected = roomForm.config.exames.some(exam => exam.tipoExame === item.label);
                      return <label key={item.label} className="flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer">
                        <Checkbox checked={selected} onCheckedChange={checked => setRoomForm(prev => {
                          const exames = checked
                            ? [...prev.config.exames, createDiagnosticExamConfig(item.label)]
                            : prev.config.exames.filter(exam => exam.tipoExame !== item.label);
                          return { ...prev, config: { ...prev.config, exames } };
                        })} />
                        <span>{item.label}</span>
                      </label>;
                    })}
                  </div>
                  <div className="flex items-center gap-2 rounded-md border p-2">
                    <Checkbox checked={roomForm.config.exames.some(exam => !DIAGNOSTIC_EXAM_CATALOG.some(item => item.label === exam.tipoExame))} onCheckedChange={checked => setRoomForm(prev => ({
                      ...prev,
                      config: { ...prev.config, exames: checked
                        ? [...prev.config.exames, createDiagnosticExamConfig('')]
                        : prev.config.exames.filter(exam => DIAGNOSTIC_EXAM_CATALOG.some(item => item.label === exam.tipoExame)) }
                    }))} />
                    <span className="text-sm font-medium">Outro — cadastrar manualmente</span>
                  </div>
                  {roomForm.config.exames.map((exam, index) => (
                    <div key={exam.id} className="space-y-3 rounded-md border bg-background p-3">
                      <div className="flex items-center justify-between gap-2"><strong className="text-sm">{exam.tipoExame || 'Novo exame personalizado'}</strong><Button type="button" size="sm" variant="ghost" onClick={() => setRoomForm(prev => ({ ...prev, config: { ...prev.config, exames: prev.config.exames.filter(item => item.id !== exam.id) } }))}><X className="h-4 w-4" /> Remover</Button></div>
                      {!DIAGNOSTIC_EXAM_CATALOG.some(item => item.label === exam.tipoExame) && <div><Label>Nome do exame *</Label><Input value={exam.tipoExame} onChange={e => setRoomForm(prev => ({ ...prev, config: { ...prev.config, exames: prev.config.exames.map(item => item.id === exam.id ? { ...item, tipoExame: e.target.value } : item) } }))} placeholder="Digite o nome do exame" /></div>}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div><Label>Duração do slot</Label><Select value={String(exam.duracaoSlot)} onValueChange={v => setRoomForm(prev => ({ ...prev, config: { ...prev.config, exames: prev.config.exames.map(item => item.id === exam.id ? { ...item, duracaoSlot: Number(v) } : item) } }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[10,15,20,30,45].map(n => <SelectItem key={n} value={String(n)}>{n} minutos</SelectItem>)}</SelectContent></Select></div>
                        <div><Label>Prazo do resultado (dias)</Label><Input type="number" min="0" max="90" value={exam.prazoResultadoDias} onChange={e => setRoomForm(prev => ({ ...prev, config: { ...prev.config, exames: prev.config.exames.map(item => item.id === exam.id ? { ...item, prazoResultadoDias: Math.min(90, Math.max(0, Number(e.target.value) || 0)) } : item) } }))} /></div>
                        <div className="sm:col-span-2"><Label>Código SIGTAP (BPA-I)</Label><Input inputMode="numeric" maxLength={10} value={exam.codigoSigtap || ''} onChange={e => setRoomForm(prev => ({ ...prev, config: { ...prev.config, exames: prev.config.exames.map(item => item.id === exam.id ? { ...item, codigoSigtap: e.target.value.replace(/\D/g, '').slice(0, 10) } : item) } }))} placeholder="10 dígitos, ex.: código oficial do exame" /><p className="text-xs text-muted-foreground mt-1">Sem código válido, o exame não entra na produção BPA-I.</p></div>
                      </div>
                      <div className="flex items-center justify-between"><Label>Exige preparo prévio?</Label><Switch checked={exam.exigePreparo} onCheckedChange={v => setRoomForm(prev => ({ ...prev, config: { ...prev.config, exames: prev.config.exames.map(item => item.id === exam.id ? { ...item, exigePreparo: v } : item) } }))} /></div>
                      {exam.exigePreparo && <div><Label>Instruções de preparo</Label><Textarea rows={3} value={exam.instrucoesPreparo} onChange={e => setRoomForm(prev => ({ ...prev, config: { ...prev.config, exames: prev.config.exames.map(item => item.id === exam.id ? { ...item, instrucoesPreparo: e.target.value } : item) } }))} placeholder="Preencha as orientações oficiais da unidade para este exame." /></div>}
                      <div><Label>Exige contraste?</Label><Select value={exam.exigeContraste} onValueChange={v => setRoomForm(prev => ({ ...prev, config: { ...prev.config, exames: prev.config.exames.map(item => item.id === exam.id ? { ...item, exigeContraste: v as DiagnosticRoomConfig['exigeContraste'] } : item) } }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nao">Não</SelectItem><SelectItem value="sim">Sim</SelectItem><SelectItem value="opcional">Opcional</SelectItem></SelectContent></Select></div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Início da agenda</Label><Input type="time" value={roomForm.config.horarioInicio || '07:00'} onChange={e => setRoomForm(p => ({ ...p, config: { ...p.config, horarioInicio: e.target.value } }))} /></div>
                  <div><Label>Fim da agenda</Label><Input type="time" value={roomForm.config.horarioFim || '17:00'} onChange={e => setRoomForm(p => ({ ...p, config: { ...p.config, horarioFim: e.target.value } }))} /></div>
                </div>
                <p className="text-xs text-muted-foreground">Os horários de funcionamento são compartilhados pela sala; cada exame selecionado mantém duração, preparo, contraste e prazo independentes. Consultórios comuns permanecem inalterados.</p>
              </div>
            )}
            <Button onClick={handleSaveRoom} disabled={blocked} className="w-full gradient-primary text-primary-foreground">{saving?'Salvando...':editRoomId ? 'Salvar' : 'Criar'}</Button>
          </fieldset>
        </DialogContent>
      </Dialog>

      <Dialog open={!!videoUnit} onOpenChange={o=>{if(!o)closeForm(()=>setVideoUnit(null));}}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">Vídeo do Painel — {videoUnit?.nome}</DialogTitle></DialogHeader>
          {formStatus}<fieldset disabled={blocked||enviando} className="space-y-4">
            <div>
              <Label>Lista de vídeos ({videoList.length})</Label>
              <div className="space-y-1 mt-1 max-h-48 overflow-y-auto">
                {videoList.length === 0 && <p className="text-xs text-muted-foreground">Nenhum vídeo na lista.</p>}
                {videoList.map((u, i) => (
                  <div key={i + u} className="flex items-center gap-1 border rounded px-2 py-1 text-xs">
                    <span className="font-semibold w-5">{i + 1}.</span>
                    <span className="flex-1 truncate" title={u}>{u.split('?')[0].split('/').pop() || 'Vídeo'}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" disabled={i === 0} onClick={() => moverVideo(i, -1)}>↑</Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" disabled={i === videoList.length - 1} onClick={() => moverVideo(i, 1)}>↓</Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => setVideoList(l => l.filter((_, k) => k !== i))}><X className="w-3 h-3" /></Button>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Os vídeos tocam em sequência e recomeçam do primeiro. Recomendado: MP4 H.264, 1080p, até 100 MB cada.</p>
            </div>
            <div>
              <Label>Adicionar por URL (MP4)</Label>
              <div className="flex gap-2 items-center mt-1">
                <Input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://.../video.mp4" />
                <Button size="sm" variant="outline" onClick={addUrl}><Plus className="w-4 h-4" /></Button>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><div className="flex-1 border-t" />OU FAÇA UPLOAD<div className="flex-1 border-t" /></div>
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6 cursor-pointer hover:bg-muted/50 text-sm">
              {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
              {enviando ? 'Enviando vídeo...' : 'Clique para selecionar MP4'}
              <input type="file" accept="video/mp4" className="hidden" disabled={enviando} onChange={e => { const f = e.target.files?.[0]; if (f) enviarVideo(f); e.target.value = ''; }} />
            </label>
            <Button onClick={salvarVideo} disabled={blocked||enviando} className="w-full gradient-primary text-primary-foreground">{saving?'Salvando...':'Salvar Configuração'}</Button>
          </fieldset>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UnidadesSalas;
