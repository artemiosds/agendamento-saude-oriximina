import { avisarVideoAtualizado } from '@/lib/painelChamadas';
import React, { useEffect, useState, useRef, useMemo, useCallback, useSyncExternalStore } from 'react';
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
import { Plus, Building2, DoorOpen, Pencil, Tv, Copy, Video, X, Upload, Loader2, Search, Users, CalendarDays, Activity, ChevronRight, RefreshCw, Eye, LayoutGrid, List, MapPin, Phone, ShieldCheck, Printer, ClipboardList, Image as ImageIcon, ArrowUp, ArrowDown, Play, ExternalLink } from 'lucide-react';
import { linkPainelTV, videoSeguro, playlistPainel } from '@/lib/painelVideo';
import { moveVideoEntry, videoEntryLabel, playlistDraftChanged, videoPreviewAllowed } from '@/lib/structureVideoAdmin';
import { buildRoomStaff, filterStructureRooms, summarizeStructure, OPEN_ROOM_APPOINTMENT_EXCLUSIONS, type RoomStaff, type RoomKind, type RoomState, type UnitMetadata } from '@/lib/structureDirectory';
import { toast } from 'sonner';
import { buildUnitProfilePrint, escapeStructureHtml, safeStructureLogo } from '@/lib/structureProfilePrint';
import { buildDocumentShell, loadDocumentConfig, printViaIframe } from '@/lib/printLayout';
import CustomFieldsRenderer from '@/components/CustomFieldsRenderer';
import { useCustomFields } from '@/hooks/useCustomFields';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_DIAGNOSTIC_ROOM_CONFIG, DIAGNOSTIC_EXAM_CATALOG, createDiagnosticExamConfig, normalizeDiagnosticRoomConfig, type DiagnosticRoomConfig } from '@/lib/diagnosticExams';
import { normalizeExamSearch, examReview, roomReview, newExamId } from '@/lib/diagnosticDirectoryReview';
import DiagnosticSigtapLookup from '@/components/DiagnosticSigtapLookup';
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
  const scopeKey=JSON.stringify([user?.id,user?.authUserId,user?.role,userUnidadeId,isGlobalAdmin]);
  // Observe the existing operational cache instead of loading duplicate unit/room directories.
  const directoryScope=JSON.stringify([user?.id,user?.authUserId,user?.role,user?.usuario==='admin.sms',userUnidadeId]);
  const subscribeDirectory=useCallback((notify:()=>void)=>queryClient.getQueryCache().subscribe(()=>notify()),[queryClient]);
  const readDirectoryState=useCallback(()=>{
    const units=queryClient.getQueryState([...queryKeys.unidades.all,'operacional',directoryScope]);
    const rooms=queryClient.getQueryState([...queryKeys.salas.all,'operacional',directoryScope]);
    if(units?.status==='error'||rooms?.status==='error')return 'error';
    return units?.status==='success'&&rooms?.status==='success'?'ready':'loading';
  },[queryClient,directoryScope]);
  const directoryState=useSyncExternalStore(subscribeDirectory,readDirectoryState,readDirectoryState);
  const directoryReady=directoryState==='ready'&&!permissionsLoading&&!!user?.id&&can('unidades_salas','can_view');
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
  const [examSearch,setExamSearch]=useState('');
  useEffect(()=>{if(roomDialog)setExamSearch('');},[roomDialog]);
  const [editUnitId, setEditUnitId] = useState<string | null>(null);
  const [editRoomId, setEditRoomId] = useState<string | null>(null);
  const [unitForm, setUnitForm] = useState({ nome: '', nomeExibicao: '', endereco: '', telefone: '', whatsapp: '', cnes: '' });
  const [roomForm, setRoomForm] = useState({ nome: '', unidadeId: '', config: { ...DEFAULT_DIAGNOSTIC_ROOM_CONFIG } as DiagnosticRoomConfig });
  const diagnosticReview=roomReview(roomForm.config);
  const [roomConfigs, setRoomConfigs] = useState<Record<string, DiagnosticRoomConfig>>({});
  const [roomFilter,setRoomFilter]=useState<RoomKind>('todas');
  const [roomState,setRoomState]=useState<RoomState>('all');
  const [roomSearch,setRoomSearch]=useState('');
  const [roomLayout,setRoomLayout]=useState<'cards'|'list'>('cards');
  const [section,setSection]=useState<'overview'|'rooms'|'video'>('overview');
  const [detail,setDetail]=useState<{id:string;scope:string}|null>(null);
  const [unitMeta,setUnitMeta]=useState<Map<string,UnitMetadata & {logoUrl:string}>>(new Map());
  const [unitProfile,setUnitProfile]=useState<{id:string;scope:string}|null>(null);
  const [printing,setPrinting]=useState(false);
  const printBusy=useRef(false);
  const [configScope,setConfigScope]=useState('');
  const metadataKey=JSON.stringify([scopeKey,unitScopeKey]);
  const configReady=directoryReady&&configState==='ready'&&configScope===metadataKey;
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
    enabled:directoryReady&&canReadStaff&&visibleUnitIds.length>0,
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
  const staffReady=directoryReady&&canReadStaff&&staffQuery.isSuccess&&!staffQuery.isError;
  const roomStaff=buildRoomStaff(visibleRooms,staffReady?staffQuery.data||[]:[]);
  const selectedRoom=directoryReady&&detail?.scope===visibleScope?visibleRooms.find(room=>room.id===detail.id):undefined;
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
  useEffect(()=>{setDetail(null);setUnitProfile(null);setRoomSearch('');setRoomState('all');},[visibleScope]);

  // Carrega as configurações persistidas por unidade para identificar os aparelhos nos cartões.
  useEffect(() => {
    let cancelled = false;
    const loadRoomConfigs = async () => {
      setConfigState('loading');setConfigScope('');
      if(!directoryReady)return;
      if (allowedUnits.length === 0) { setRoomConfigs({});setUnitMeta(new Map());setConfigScope(metadataKey);setConfigState('ready'); return; }
      const { data, error } = await supabase.from('unidades' as any).select('id,custom_data').in('id',allowedUnits.map(u=>u.id));
      if(cancelled)return;
      if(error||!Array.isArray(data)||data.length!==allowedUnits.length){setRoomConfigs({});setUnitMeta(new Map());setConfigState('error');return;}
      const next: Record<string, DiagnosticRoomConfig> = {};
      const metadata=new Map<string,UnitMetadata & {logoUrl:string}>();
      (data || []).forEach((unit: any) => {
        const cd=(unit.custom_data||{}) as Record<string,unknown>;
        metadata.set(unit.id,{cnes:String(cd.cnes??''),videoConfigured:playlistPainel(cd).length>0,logoUrl:safeStructureLogo(cd.logo_url)});
        const configuredRooms = unit.custom_data?.salas_exames;
        if (!configuredRooms || typeof configuredRooms !== 'object') return;
        Object.entries(configuredRooms).forEach(([roomId, value]: [string, any]) => {
          if (value?.finalidade === 'aparelho_diagnostico'&&salas.some(room=>room.id===roomId&&room.unidadeId===unit.id)) {
            next[roomId] = normalizeDiagnosticRoomConfig(value);
          }
        });
      });
      if (!cancelled) {setRoomConfigs(next);setUnitMeta(metadata);setConfigScope(metadataKey);setConfigState('ready');}
    };
    void loadRoomConfigs().catch(()=>{if(!cancelled){setRoomConfigs({});setUnitMeta(new Map());setConfigState('error');}});
    return () => { cancelled = true; };
  }, [unidades,salas,unitScopeKey,scopeKey,configReload,directoryReady]);

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
    if(!preserveConfig&&roomForm.config.finalidade==='aparelho_diagnostico'&&roomReview(roomForm.config).duplicateIds){toast.error('Há identificadores de exames repetidos. Confira as modalidades antes de salvar a configuração.');return;}
    if(!preserveConfig&&roomForm.config.finalidade==='aparelho_diagnostico'&&roomForm.config.exames.some(e=>e.codigoSigtap&&!/^\d{10}$/.test(e.codigoSigtap))&&!window.confirm('Há código SIGTAP incompleto. Pela regra atual, ele será salvo vazio. Deseja continuar?'))return;
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
  const initialVideoList=useRef<string[]>([]);
  const [previewIndex,setPreviewIndex]=useState<number|null>(null);
  const [previewStatus,setPreviewStatus]=useState<'loading'|'ready'|'error'>('loading');
  const videoDirty=playlistDraftChanged(videoList,initialVideoList.current,videoUrl);
  const clearVideoPreview=()=>{setPreviewIndex(null);setPreviewStatus('loading');};
  const previewUrl=previewIndex===null?undefined:videoList[previewIndex];
  const openVideoPreview=(index:number)=>{if(!videoPreviewAllowed(videoList[index]))return;setPreviewStatus('loading');setPreviewIndex(index);};
  const addUrl = () => {
    const v = videoUrl.trim();
    if (!v) return;
    if (!videoSeguro(v)) { toast.error('Informe um endereço https://'); return; }
    clearVideoPreview();setVideoList(l => [...l, v]); setVideoUrl('');
  };
  const moverVideo = (i:number,d:number)=>{clearVideoPreview();setVideoList(list=>moveVideoEntry(list,i,d));};
  const retirarVideo=(index:number)=>{if(!window.confirm('Retirar este vídeo da sequência? O arquivo não será excluído; a TV só receberá a mudança ao salvar.'))return;clearVideoPreview();setVideoList(list=>list.filter((_,i)=>i!==index));};
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
    clearVideoPreview();initialVideoList.current=[];setVideoUnit({id,nome});setVideoUrl('');setVideoList([]);setFormLoading(true);
    try{
      const {data,error}=await supabase.from('unidades').select('custom_data').eq('id',id).single();
      if(seq!==formSequence.current||scopeRef.current!==scope)return;
      if(error||!data)throw error||new Error('Configuração não encontrada.');
      const cd=(data.custom_data||{}) as Record<string,any>;
      original.current=cd;
      const list=Array.isArray(cd.video_urls)?cd.video_urls.filter((x:unknown)=>typeof x==='string'&&x):cd.video_url?[String(cd.video_url)]:[];
      initialVideoList.current=[...list];setVideoList(list);
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
      clearVideoPreview();setVideoList(l => [...l, data.signedUrl]);
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
      if(scopeRef.current===scope){toast.success('Configuração de vídeo salva. A atualização foi solicitada; confira a TV.');clearVideoPreview();setVideoUnit(null);}
    }catch(e){if(scopeRef.current===scope)toast.error(readError(e));}
    finally{busy.current=false;setSaving(false);}
  };
  const closeForm=(close:()=>void)=>{if(busy.current||enviando||enviandoLogo)return;formSequence.current++;setFormLoading(false);setFormError('');close();};
  useEffect(()=>{formSequence.current++;setUnitDialog(false);setRoomDialog(false);setVideoUnit(null);setVideoList([]);setVideoUrl('');initialVideoList.current=[];clearVideoPreview();setFormError('');setFormLoading(false);},[scopeKey]);

  const selectedUnit=directoryReady&&unitProfile?.scope===visibleScope?visibleUnits.find(u=>u.id===unitProfile.id):undefined;
  const selectedMeta=selectedUnit&&configReady?unitMeta.get(selectedUnit.id):undefined;
  const profileRooms=selectedUnit?visibleRooms.filter(r=>r.unidadeId===selectedUnit.id).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR',{numeric:true,sensitivity:'base'})):[];
  const canPrintProfile=!!selectedUnit&&!!selectedMeta&&!permissionsLoading&&can('unidades_salas','can_view')&&can('unidades_salas','can_execute');
  const printGuard=useRef({scope:visibleScope,id:selectedUnit?.id,allowed:canPrintProfile,staffAllowed:staffReady});
  printGuard.current={scope:visibleScope,id:selectedUnit?.id,allowed:canPrintProfile,staffAllowed:staffReady};
  const handlePrintProfile=async()=>{
    if(!selectedUnit||!selectedMeta||!canPrintProfile||printBusy.current)return;
    const scope=visibleScope,id=selectedUnit.id;
    const counts=staffReady?new Map(profileRooms.map(r=>[r.id,roomStaff.get(r.id)?.length||0])):undefined;
    const body=buildUnitProfilePrint(selectedUnit,profileRooms.map(r=>({...r,examNames:examNames.get(r.id)})),devices,selectedMeta,selectedMeta.logoUrl,counts);
    printBusy.current=true;setPrinting(true);
    try{
      const config=await loadDocumentConfig();
      if(!printGuard.current.allowed||printGuard.current.id!==id||printGuard.current.scope!==scope||(counts&&!printGuard.current.staffAllowed))return;
      // Shared template uses the logged-in unit logo on the right. Suppress that slot here;
      // the selected unit's own verified HTTPS logo is rendered in the body instead.
      const scopedConfig={...config,linha2:escapeStructureHtml(selectedUnit.nome),linha3:'',linha4:'',rodapeEndereco:escapeStructureHtml(selectedUnit.endereco||''),logosConfig:{...config.logosConfig,direita:{...config.logosConfig.direita,ativo:false}}};
      const html=buildDocumentShell('Ficha de Estrutura Física',body,scopedConfig,{Finalidade:'Conferência administrativa · uso interno'});
      if(html.length>8*1024*1024)throw new Error('Ficha muito extensa para impressão.');
      printViaIframe(html);
    }catch(e){toast.error(readError(e));}finally{printBusy.current=false;setPrinting(false);}
  };

  const renderRoomCard = (room: typeof salas[number]) => {
    const unit = unidades.find(item => item.id === room.unidadeId);
    const diagnosticConfig = configReady ? roomConfigs[room.id] : undefined;
    const isList = roomLayout === 'list';
    const openDetails = () => setDetail({id:room.id,scope:visibleScope});
    return (
      <Card key={room.id} className="clinical-premium min-w-0 h-full">
        <CardContent className={`p-3 min-w-0 ${isList ? 'flex flex-wrap sm:flex-nowrap sm:items-center gap-x-4 gap-y-2' : 'flex flex-col gap-2 h-full'}`}>
          <div className={`flex items-start gap-2.5 min-w-0 ${isList?'flex-1 basis-52':''}`}>
            <span className={`clinical-dock-icon ${diagnosticConfig?'clinical-tone-violet':'clinical-tone-blue'}`}>{diagnosticConfig?<Activity className="w-4 h-4" aria-hidden="true"/>:<DoorOpen className="w-4 h-4" aria-hidden="true"/>}</span>
            <div className="flex-1 min-w-0">
              <h3><button type="button" className="text-sm font-semibold text-left text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring rounded break-words" onClick={openDetails}>{room.nome}</button></h3>
              <p className="text-xs text-muted-foreground break-words">{unit?.nomeExibicao||unit?.nome||'Unidade não identificada'}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className={`inline-flex items-center gap-1 font-medium ${room.ativo?'text-emerald-700 dark:text-emerald-300':'text-muted-foreground'}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${room.ativo?'bg-emerald-600 dark:bg-emerald-400':'bg-muted-foreground'}`}/>{room.ativo?'Ativa':'Inativa'}</span>
                <span className={`rounded-md px-1.5 py-0.5 font-medium ${diagnosticConfig?'bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-200':'bg-muted text-muted-foreground'}`}>{diagnosticConfig?`Aparelho · ${diagnosticConfig.exames.length} exame(s)`:configReady?'Consultório':'Finalidade não confirmada'}</span>
              </div>
              {diagnosticConfig&&<p className="mt-1 text-xs text-muted-foreground break-words">{diagnosticConfig.exames.map(exam=>exam.tipoExame).join(', ')}</p>}
            </div>
          </div>
          <div className={`flex flex-wrap items-center gap-2 ${isList?'sm:justify-end':'mt-auto pt-2 border-t'}`}>
            {canReadStaff&&<span className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground"><Users className="w-3.5 h-3.5 shrink-0" aria-hidden="true"/>{staffReady?(roomStaff.get(room.id)?.length||0):'—'} funcionário(s) vinculado(s)</span>}
            <div className="ml-auto flex items-center gap-1.5 shrink-0">
              <Button type="button" size="sm" variant="outline" className="clinical-record-action h-8 gap-1.5" title="Consultar detalhes" aria-label={`Consultar detalhes de ${room.nome}`} onClick={openDetails}><Eye className="w-3.5 h-3.5"/>Detalhes</Button>
              {canWrite('can_edit',room.unidadeId)&&<Button type="button" size="icon" variant="outline" className="clinical-record-action clinical-action-edit h-8 w-8" disabled={saving} title="Editar sala" aria-label={`Editar sala ${room.nome}`} onClick={()=>openEditRoom(room)}><Pencil className="w-3.5 h-3.5"/></Button>}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const roomControls = (
    <div className="clinical-premium p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold font-display text-foreground flex items-center gap-2"><span className="clinical-dock-icon clinical-tone-teal"><DoorOpen className="w-4 h-4" aria-hidden="true"/></span>Salas / Consultórios</h2>
          <p className="text-xs text-muted-foreground mt-1">{visibleRooms.length} sala(s) cadastrada(s) • {configReady?summary.devices:'—'} aparelho(s) diagnóstico(s)</p>
        </div>
        {allowedUnits.some(u=>u.ativo&&canWrite('can_create',u.id))&&<div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={saving} variant="outline" onClick={() => openNewRoom('aparelho_diagnostico')} className="clinical-record-action clinical-action-edit gap-1"><Plus className="w-4 h-4 mr-1" />Novo Aparelho</Button>
          <Button size="sm" disabled={saving} onClick={() => openNewRoom('consultorio_clinico')} className="clinical-record-action clinical-action-main gap-1"><Plus className="w-4 h-4 mr-1" />Nova Sala</Button>
        </div>}
      </div>
      <div className="clinical-inset rounded-lg border p-1.5 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar salas por finalidade">
        <Button size="sm" variant={roomFilter === 'todas' ? 'default' : 'outline'} aria-pressed={roomFilter === 'todas'} onClick={() => setRoomFilter('todas')}>Todas ({visibleRooms.length})</Button>
        <Button size="sm" variant={roomFilter === 'consultorios' ? 'default' : 'outline'} aria-pressed={roomFilter === 'consultorios'} disabled={!configReady} onClick={() => setRoomFilter('consultorios')}>Consultórios ({configReady?summary.consultories:'—'})</Button>
        <Button size="sm" variant={roomFilter === 'aparelhos' ? 'default' : 'outline'} aria-pressed={roomFilter === 'aparelhos'} disabled={!configReady} onClick={() => setRoomFilter('aparelhos')}>Aparelhos / Exames ({configReady?summary.devices:'—'})</Button>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[12rem]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/><Input className="pl-9" value={roomSearch} onChange={e=>setRoomSearch(e.target.value)} placeholder="Buscar sala, unidade ou exame..." aria-label="Buscar sala, unidade ou exame"/></div>
        <Select value={roomState} onValueChange={v=>setRoomState(v as RoomState)}><SelectTrigger className="w-full sm:w-44" aria-label="Filtrar situação da sala"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todas as situações</SelectItem><SelectItem value="active">Ativas</SelectItem><SelectItem value="inactive">Inativas</SelectItem></SelectContent></Select>
        {(roomSearch||roomFilter!=='todas'||roomState!=='all')&&<Button variant="outline" size="sm" onClick={()=>{setRoomSearch('');setRoomFilter('todas');setRoomState('all');}}>Limpar filtros</Button>}
        <span role="status" className="text-xs text-muted-foreground">{roomFilter!=='todas'&&!configReady?'Finalidade em conferência':filteredRooms.length+' sala(s) no filtro'}</span>
        <div className="flex gap-1 ml-auto rounded-md border p-0.5" role="group" aria-label="Modo de visualização das salas">
          <Button type="button" size="sm" variant={roomLayout==='cards'?'default':'ghost'} aria-pressed={roomLayout==='cards'} className="h-7 gap-1.5 px-2" onClick={()=>setRoomLayout('cards')}><LayoutGrid className="w-3.5 h-3.5"/>Cards</Button>
          <Button type="button" size="sm" variant={roomLayout==='list'?'default':'ghost'} aria-pressed={roomLayout==='list'} className="h-7 gap-1.5 px-2" onClick={()=>setRoomLayout('list')}><List className="w-3.5 h-3.5"/>Lista</Button>
        </div>
      </div>
      {canReadStaff&&staffQuery.isError&&<div role="alert" className="text-sm text-destructive flex flex-wrap gap-2 items-center">Não foi possível confirmar os vínculos da equipe.<Button size="sm" variant="outline" onClick={()=>void staffQuery.refetch()}>Tentar novamente</Button></div>}
    </div>
  );

  const blocked=saving||formLoading||!!formError;
  const formStatus=formLoading?<p role="status" className="text-sm text-muted-foreground">Carregando configuração existente...</p>:formError?<p role="alert" className="text-sm text-destructive">{formError} Feche e reabra o formulário antes de salvar.</p>:null;
  return (
    <div className="clinical-hub space-y-3 animate-fade-in min-w-0">
      <header className="clinical-hub-hero flex flex-wrap items-center gap-3">
        <span className="clinical-patient-avatar flex items-center justify-center shrink-0"><Building2 className="w-5 h-5" aria-hidden="true"/></span>
        <div className="flex-1 min-w-[9rem]">
          <p className="clinical-hub-eyebrow">Gestão administrativa</p>
          <h1 className="clinical-hub-name text-xl font-bold font-display">Unidades e Salas</h1>
          <p className="clinical-patient-sub text-xs mt-1">Estrutura física e organização dos atendimentos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" className="clinical-hub-new gap-2" disabled={saving||directoryState==='loading'||(directoryReady&&configState==='loading')} onClick={()=>{void refreshStructure();if(directoryReady&&canReadStaff&&visibleUnitIds.length)void staffQuery.refetch();}}><RefreshCw className="w-4 h-4"/>Atualizar estrutura</Button>
          {directoryReady&&isGlobalAdmin&&canWrite('can_create','')&&<Button type="button" size="sm" className="clinical-hub-new gap-2" disabled={saving} onClick={openNewUnit}><Plus className="w-4 h-4"/>Nova Unidade</Button>}
        </div>
      </header>
      <p className="flex gap-1.5 items-start text-[11px] text-muted-foreground"><ShieldCheck className="w-3.5 h-3.5 shrink-0 text-primary" aria-hidden="true"/>Exclusões definitivas e transferências de salas estão protegidas para preservar os vínculos históricos.</p>

      {directoryState!=='ready'&&<div role={directoryState==='error'?'alert':'status'} className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{directoryState==='error'?'Não foi possível confirmar o cadastro de unidades e salas.':'Carregando estrutura física...'}{directoryState==='error'&&<Button size="sm" variant="outline" onClick={()=>void refreshStructure()}>Tentar novamente</Button>}</div>}
      {configState==='error'&&<div role="alert" className="flex items-center gap-2 text-sm text-destructive">Não foi possível confirmar as configurações de exames.<Button size="sm" variant="outline" onClick={()=>setConfigReload(v=>v+1)}>Tentar novamente</Button></div>}
      {directoryReady&&isGlobalAdmin && <UnitScopeNavigator units={allowedUnits} value={unitId} onChange={setUnitId} />}
      <section className="grid grid-cols-1 min-[380px]:grid-cols-2 xl:grid-cols-4 gap-2" aria-label="Indicadores da estrutura física">
        {[
          {label:'Unidades cadastradas',value:summary.units,extra:summary.activeUnits+' ativa(s)',Icon:Building2,tone:'blue',active:section==='overview',action:()=>selectMetric('overview'),disabled:false},
          {label:'Salas cadastradas',value:summary.rooms,extra:summary.activeRooms+' ativa(s)',Icon:DoorOpen,tone:'teal',active:section==='rooms'&&roomFilter==='todas',action:()=>selectMetric('rooms'),disabled:false},
          {label:'Aparelhos / exames',value:summary.devices,extra:'Classificação cadastrada',Icon:Activity,tone:'violet',active:section==='rooms'&&roomFilter==='aparelhos',action:()=>selectMetric('rooms','aparelhos'),disabled:!configReady},
          {label:'Unidades com vídeo',value:summary.videoUnits,extra:'Configuração local, não status da TV',Icon:Tv,tone:'slate',active:section==='video',action:()=>selectMetric('video'),disabled:!configReady}
        ].map(({label,value,extra,Icon,tone,active,action,disabled})=><button type="button" key={label} disabled={disabled||!directoryReady} onClick={action} aria-pressed={active} className={`clinical-premium p-3 flex items-center gap-2 text-left min-w-0 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-ring ${active?'ring-1 ring-primary/60':''}`}><span className={`clinical-dock-icon clinical-tone-${tone}`}><Icon className="w-4 h-4" aria-hidden="true"/></span><span className="flex-1 min-w-0"><strong className="block text-xl tabular-nums">{directoryReady?value??'—':'—'}</strong><span className="block text-xs font-medium">{label}</span><span className="block text-[11px] text-muted-foreground">{directoryReady?extra:'Consulta em atualização'}</span></span><ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground"/></button>)}
      </section>
      <nav className="clinical-hub-tabs" aria-label="Seções de estrutura">
        <Button type="button" variant="ghost" className="clinical-hub-tab gap-1.5 flex-1" aria-pressed={section==='overview'} onClick={()=>selectMetric('overview')}><Building2 className="w-4 h-4"/>Visão geral</Button>
        <Button type="button" variant="ghost" className="clinical-hub-tab gap-1.5 flex-1" aria-pressed={section==='rooms'&&roomFilter!=='aparelhos'} onClick={()=>selectMetric('rooms')}><DoorOpen className="w-4 h-4"/>Salas</Button>
        <Button type="button" variant="ghost" className="clinical-hub-tab gap-1.5 flex-1" aria-pressed={section==='rooms'&&roomFilter==='aparelhos'} disabled={!configReady} onClick={()=>selectMetric('rooms','aparelhos')}><Activity className="w-4 h-4"/>Aparelhos</Button>
        <Button type="button" variant="ghost" className="clinical-hub-tab gap-1.5 flex-1" aria-pressed={section==='video'} disabled={!configReady} onClick={()=>selectMetric('video')}><Tv className="w-4 h-4"/>Unidades com vídeo</Button>
      </nav>

      {/* Unidades: a single unit uses the full available width. */}
      {directoryReady&&section!=='rooms'&&<section className="space-y-2" aria-label="Unidades cadastradas">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold font-display flex items-center gap-2">{section==='video'?<Tv className="w-4 h-4 text-primary"/>:<Building2 className="w-4 h-4 text-primary"/>}{section==='video'?'Unidades com vídeo configurado':'Unidades'}</h2>
          <span className="text-xs text-muted-foreground">{section==='video'?(configReady?summary.videoUnits:'—'):summary.units} na seleção</span>
        </div>
        <div className={`grid grid-cols-1 gap-3 ${(section==='video'?summary.videoUnits:summary.units)>1?'xl:grid-cols-2':''}`}>
          {visibleUnits.filter(u=>section!=='video'||(configReady&&unitMeta.get(u.id)?.videoConfigured)).map(u => (
            <Card key={u.id} className="clinical-premium min-w-0">
              <CardContent className="p-3 sm:p-4 space-y-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="clinical-dock-icon clinical-tone-blue"><Building2 className="w-4 h-4" aria-hidden="true"/></span>
                  <div className="flex-1 min-w-0">
                    <h3><button type="button" className="text-base font-semibold text-left text-foreground break-words hover:underline rounded focus-visible:ring-2 focus-visible:ring-ring" onClick={()=>setUnitProfile({id:u.id,scope:visibleScope})}>{u.nomeExibicao||u.nome}</button></h3>
                    {u.nomeExibicao&&u.nomeExibicao!==u.nome&&<p className="text-xs text-muted-foreground break-words">{u.nome}</p>}
                    <p className={`text-xs mt-1 font-medium ${u.ativo?'text-emerald-700 dark:text-emerald-300':'text-muted-foreground'}`}>{u.ativo?'Unidade ativa':'Unidade inativa'}</p>
                  </div>
                  {canWrite('can_edit',u.id)&&<Button size="icon" variant="outline" className="clinical-record-action clinical-action-edit h-8 w-8 shrink-0" disabled={saving} title="Editar unidade" aria-label={`Editar unidade ${u.nome}`} onClick={()=>openEditUnit(u)}><Pencil className="w-3.5 h-3.5"/></Button>}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-start gap-2 text-xs text-muted-foreground"><MapPin className="w-4 h-4 shrink-0 text-primary" aria-hidden="true"/><span className="break-words">{u.endereco||'Endereço não informado'}</span></div>
                    <div className="flex items-start gap-2 text-xs text-muted-foreground"><Phone className="w-4 h-4 shrink-0 text-primary" aria-hidden="true"/><span className="break-words">{[u.telefone,u.whatsapp].filter(Boolean).join(' · ')||'Contato não informado'}</span></div>
                    <div className="clinical-inset border rounded-lg p-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                      <span className="inline-flex items-center gap-1.5"><DoorOpen className="w-3.5 h-3.5 text-primary"/><strong className="tabular-nums">{visibleRooms.filter(s=>s.unidadeId===u.id).length}</strong> sala(s)</span>
                      {configReady&&<span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-primary"/>{/^\d{7}$/.test(unitMeta.get(u.id)?.cnes||'')?'CNES informado':'CNES a conferir'}</span>}
                      {configReady&&<span className="inline-flex items-center gap-1.5"><Video className="w-3.5 h-3.5 text-primary"/>{unitMeta.get(u.id)?.videoConfigured?'Vídeo configurado':'Sem vídeo local'}</span>}
                    </div>
                  </div>
                  <div className="clinical-inset border rounded-lg p-2.5 space-y-2">
                    <p className="text-xs font-semibold">Estrutura e equipe</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" className="clinical-record-action gap-1.5 h-8" onClick={()=>setUnitProfile({id:u.id,scope:visibleScope})}><ClipboardList className="w-3.5 h-3.5"/>Perfil da unidade</Button>
                      <Button size="sm" variant="outline" className="clinical-record-action gap-1.5 h-8" onClick={()=>{if(isGlobalAdmin)setUnitId(u.id);selectMetric('rooms');}}><DoorOpen className="w-3.5 h-3.5"/>Ver salas</Button>
                      {canReadStaff&&<Button size="sm" variant="outline" className="clinical-record-action gap-1.5 h-8" asChild><Link to={`/painel/funcionarios?unidade=${encodeURIComponent(u.id)}`}><Users className="w-3.5 h-3.5"/>Ver equipe</Link></Button>}
                      {can('disponibilidade','can_view')&&<Button size="sm" variant="outline" className="clinical-record-action gap-1.5 h-8" asChild><Link to={`/painel/disponibilidade?unidade=${encodeURIComponent(u.id)}`}><CalendarDays className="w-3.5 h-3.5"/>Disponibilidade</Link></Button>}
                    </div>
                    <p className="text-xs font-semibold border-t pt-2">Painel de Chamadas</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" className="clinical-record-action gap-1.5 h-8" onClick={()=>window.open(linkTV(u.id),'_blank','noopener,noreferrer')}><Tv className="w-3.5 h-3.5"/>Painel</Button>
                      <Button size="sm" variant="outline" className="clinical-record-action gap-1.5 h-8" onClick={()=>copiarLink(u.id)}><Copy className="w-3.5 h-3.5"/>Link TV</Button>
                      {canWrite('can_edit',u.id)&&<Button size="sm" variant="outline" className="clinical-record-action gap-1.5 h-8" disabled={saving} onClick={()=>abrirVideo(u.id,u.nome)}><Video className="w-3.5 h-3.5"/>Gerenciar vídeos</Button>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>}

      {section==='video'&&configReady&&summary.videoUnits===0&&<Card><CardContent className="p-4 text-sm text-muted-foreground">Nenhuma unidade com vídeo configurado na seleção. Na visão geral, utilize a ação Vídeo para configurar.</CardContent></Card>}
      {directoryReady&&section!=='video'&&<section className="space-y-3" aria-label="Salas e consultórios">
        {roomControls}
        {roomFilter!=='todas'&&!configReady?<p className="text-sm text-muted-foreground">Aguarde a confirmação das configurações de exames.</p>:filteredRooms.length===0?<Card><CardContent className="p-4 text-sm text-muted-foreground">Nenhuma sala encontrada para os filtros selecionados.</CardContent></Card>:<div className={roomLayout==='cards'?'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2':'grid grid-cols-1 gap-2'}>{filteredRooms.map(room=>renderRoomCard(room))}</div>}
      </section>}

      <Dialog open={!!selectedRoom&&!permissionsLoading&&can('unidades_salas','can_view')} onOpenChange={open=>{if(!open)setDetail(null);}}>
        <DialogContent className="w-[96vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="clinical-hub-hero text-left"><div className="flex items-start gap-2.5"><span className="clinical-patient-avatar flex items-center justify-center shrink-0"><DoorOpen className="w-5 h-5" aria-hidden="true"/></span><div className="min-w-0"><p className="clinical-hub-eyebrow">Estrutura física · consulta</p><DialogTitle className="clinical-hub-name font-display break-words">{selectedRoom?.nome}</DialogTitle><DialogDescription className="clinical-patient-sub text-xs mt-1">Consulta administrativa dos vínculos existentes, sem alterações na agenda.</DialogDescription></div></div></DialogHeader>
          {selectedRoom&&<>
            <div className="clinical-premium p-3 space-y-2"><p className="font-medium flex items-start gap-2"><Building2 className="w-4 h-4 mt-0.5 text-primary shrink-0"/><span className="break-words">{visibleUnits.find(u=>u.id===selectedRoom.unidadeId)?.nome||'Unidade não identificada'}</span></p><p className="text-sm text-muted-foreground">{selectedRoom.ativo?'Ativa':'Inativa'} · {configReady?(devices.has(selectedRoom.id)?'Aparelho / exame diagnóstico':'Consultório clínico'):'Finalidade não confirmada'}</p>{configReady&&roomConfigs[selectedRoom.id]&&<p className="text-sm">Exames cadastrados: {examNames.get(selectedRoom.id)||'Nenhum exame identificado'}</p>}</div>
            {configReady&&roomConfigs[selectedRoom.id]&&<section className="clinical-premium p-3 space-y-2"><h3 className="font-semibold text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-primary"/>Modalidades diagnósticas cadastradas</h3><p className="text-xs text-muted-foreground">Horário configurado: {roomConfigs[selectedRoom.id].horarioInicio} – {roomConfigs[selectedRoom.id].horarioFim}. Não representa vagas livres.</p>{roomConfigs[selectedRoom.id].exames.map((exam,index)=><details key={exam.id+'-'+index} className="clinical-inset border rounded-lg p-2"><summary className="cursor-pointer text-sm font-medium break-words">{exam.tipoExame} · {exam.duracaoSlot} min</summary><dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs"><div><dt className="text-muted-foreground">SIGTAP cadastrado</dt><dd>{exam.codigoSigtap||'Não informado'}</dd></div><div><dt className="text-muted-foreground">Prazo cadastrado</dt><dd>{exam.prazoResultadoDias} dia(s)</dd></div><div><dt className="text-muted-foreground">Contraste</dt><dd>{exam.exigeContraste==='sim'?'Sim':exam.exigeContraste==='opcional'?'Opcional':'Não'}</dd></div><div><dt className="text-muted-foreground">Preparo prévio</dt><dd>{exam.exigePreparo?'Sim':'Não'}</dd></div>{exam.exigePreparo&&<div className="sm:col-span-2"><dt className="text-muted-foreground">Instruções cadastradas pela unidade</dt><dd className="whitespace-pre-wrap break-words">{exam.instrucoesPreparo||'Não informadas'}</dd></div>}</dl>{examReview(exam).length>0&&<p className="text-xs text-amber-800 dark:text-amber-300 mt-2">{examReview(exam).join(' · ')}</p>}</details>)}</section>}
            {canReadStaff&&<section className="clinical-premium p-3 space-y-2"><h3 className="font-semibold flex gap-2 items-center"><Users className="w-4 h-4"/>Equipe vinculada {staffReady&&`(${roomStaff.get(selectedRoom.id)?.length||0})`}</h3><p className="text-xs text-muted-foreground">Funcionários ativos com vínculo direto à sala e à mesma unidade, nos registros acessíveis. Não indica presença ou escala.</p>{staffQuery.isError?<div role="alert" className="text-sm text-destructive">Consulta não confirmada. <Button size="sm" variant="outline" onClick={()=>void staffQuery.refetch()}>Tentar novamente</Button></div>:!staffReady?<p role="status" className="text-sm text-muted-foreground">Consultando equipe...</p>:!(roomStaff.get(selectedRoom.id)?.length)?<p className="text-sm text-muted-foreground">Nenhum funcionário ativo com esse vínculo identificado.</p>:<div className="max-h-40 overflow-y-auto divide-y">{(roomStaff.get(selectedRoom.id)||[]).map(f=><div key={f.id} className="py-2 text-sm"><strong>{f.nome}</strong><p className="text-xs text-muted-foreground">{f.profissao||f.cargo||'Função não informada'}</p></div>)}</div>}</section>}
            {canReadAgenda&&<section className="clinical-premium p-3 space-y-2"><h3 className="font-semibold flex items-center gap-2"><CalendarDays className="w-4 h-4"/>Agendamentos vinculados</h3><p className="text-xs text-muted-foreground">De hoje em diante, excluindo cancelados, remarcados, concluídos e faltas. Somente registros acessíveis com vínculo explícito à sala; não representa ocupação, presença ou vagas livres.</p>{appointmentsQuery.isError?<div role="alert" className="text-sm text-destructive">Consulta não confirmada. <Button size="sm" variant="outline" onClick={()=>void appointmentsQuery.refetch()}>Tentar novamente</Button></div>:appointmentsQuery.isFetching?<p role="status" className="text-sm text-muted-foreground">Consultando agendamentos...</p>:appointmentsQuery.isSuccess?<><p className="text-sm font-semibold">{appointmentsQuery.data.total} registro(s) não encerrado(s)</p>{appointmentsQuery.data.rows.length>0&&<div className="max-h-60 overflow-y-auto divide-y">{appointmentsQuery.data.rows.map(item=><div key={item.id} className="py-2 flex flex-wrap gap-x-3 gap-y-1 items-start text-xs"><span className="font-medium tabular-nums">{item.data.split('-').reverse().join('/')} · {item.hora.slice(0,5)}</span><span className="flex-1 min-w-[8rem]">{item.profissional_nome||'Profissional não informado'}</span><span className="text-muted-foreground">{item.status.replaceAll('_',' ')}</span></div>)}</div>}{appointmentsQuery.data.total>appointmentsQuery.data.rows.length&&<p className="text-xs text-muted-foreground">Exibindo os primeiros {appointmentsQuery.data.rows.length} registros; consulte a Agenda para a lista completa.</p>}</>:<p className="text-sm text-muted-foreground">Consulta em preparação...</p>}<Button size="sm" variant="outline" asChild><Link to="/painel/agenda">Consultar Agenda</Link></Button></section>}
            {(!canReadStaff||!canReadAgenda)&&<p className="text-xs text-muted-foreground">As consultas de equipe e Agenda dependem das permissões correspondentes.</p>}
          </>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedUnit} onOpenChange={open=>{if(!open)setUnitProfile(null);}}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-3xl gap-3">
          <DialogHeader className="clinical-hub-hero text-left pr-9"><div className="flex items-start gap-3"><span className="clinical-patient-avatar flex items-center justify-center shrink-0"><Building2 className="w-5 h-5"/></span><div className="min-w-0"><p className="clinical-hub-eyebrow">Perfil institucional</p><DialogTitle className="clinical-hub-name font-display break-words">{selectedUnit?.nomeExibicao||selectedUnit?.nome}</DialogTitle><DialogDescription className="clinical-patient-sub text-xs mt-1">Identificação, estrutura física e configurações cadastradas.</DialogDescription></div></div></DialogHeader>
          {selectedUnit&&<>
            <section className="clinical-premium p-3 space-y-2">
              <h3 className="font-semibold text-sm flex items-center gap-2"><ClipboardList className="w-4 h-4 text-primary"/>Identificação e contato</h3>
              <div className="flex flex-wrap gap-3 items-start">
                {selectedMeta?.logoUrl&&<img src={selectedMeta.logoUrl} alt="Logo cadastrada da unidade" className="h-16 w-20 object-contain rounded-lg border bg-background" referrerPolicy="no-referrer"/>}
                <dl className="flex-1 min-w-[12rem] grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  {[[ 'Nome oficial',selectedUnit.nome],['Nome de exibição',selectedUnit.nomeExibicao],['CNES',selectedMeta?selectedMeta.cnes||'Não informado':'Não confirmado'],['Situação',selectedUnit.ativo?'Ativa':'Inativa'],['Endereço',selectedUnit.endereco],['Telefone',selectedUnit.telefone],['WhatsApp',selectedUnit.whatsapp]].map(([label,value])=><div key={label} className="clinical-inset border rounded-md p-2 min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium break-words">{value||'Não informado'}</dd></div>)}
                </dl>
              </div>
              <p className="text-xs text-muted-foreground">CNES exibido como cadastrado. O formato não comprova validade no cadastro nacional.</p>
            </section>
            <section className="clinical-premium p-3 space-y-2">
              <h3 className="font-semibold text-sm flex items-center gap-2"><DoorOpen className="w-4 h-4 text-primary"/>Estrutura física</h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[[profileRooms.length,'Salas'],[profileRooms.filter(r=>r.ativo).length,'Ativas'],[configReady?profileRooms.filter(r=>devices.has(r.id)).length:'—','Aparelhos']].map(([value,label])=><div key={label} className="clinical-inset border rounded-lg p-2"><strong className="block text-lg tabular-nums">{value}</strong><span className="text-xs text-muted-foreground">{label}</span></div>)}
              </div>
              {profileRooms.length===0?<p className="text-xs text-muted-foreground">Nenhuma sala cadastrada nesta unidade.</p>:<div className="divide-y max-h-64 overflow-y-auto">{profileRooms.map(r=><div key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-xs"><DoorOpen className="w-4 h-4 text-primary shrink-0"/><span className="flex-1 min-w-[8rem] font-medium break-words">{r.nome}</span><span className="text-muted-foreground">{r.ativo?'Ativa':'Inativa'} · {configReady?(devices.has(r.id)?'Aparelho':'Consultório'):'Finalidade não confirmada'}</span>{staffReady&&<span className="text-muted-foreground">{roomStaff.get(r.id)?.length||0} vinculado(s)</span>}<Button type="button" size="sm" variant="outline" className="clinical-record-action h-7" onClick={()=>{setUnitProfile(null);setDetail({id:r.id,scope:visibleScope});}}>Detalhes</Button></div>)}</div>}
              <p className="text-xs text-muted-foreground">Estrutura cadastrada, não representa ocupação, escala ou vagas disponíveis.{staffReady?' Equipe: vínculos ativos diretos às salas.':''}</p>
            </section>
            <section className="clinical-premium p-3 space-y-2">
              <h3 className="font-semibold text-sm flex items-center gap-2"><Tv className="w-4 h-4 text-primary"/>Configurações institucionais</h3>
              <p className="text-sm">{selectedMeta?(selectedMeta.videoConfigured?'Vídeo de espera local configurado':'Sem vídeo local configurado'):'Configuração ainda não confirmada'}</p>
              <p className="text-xs text-muted-foreground">Não indica que a TV está ligada ou reproduzindo chamadas.</p>
            </section>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-2">
              {canWrite('can_edit',selectedUnit.id)&&<Button type="button" variant="outline" className="gap-2" disabled={saving} onClick={()=>{setUnitProfile(null);void openEditUnit(selectedUnit);}}><Pencil className="w-4 h-4"/>Editar unidade</Button>}
              {can('unidades_salas','can_execute')&&<Button type="button" className="gradient-primary text-primary-foreground gap-2" disabled={!canPrintProfile||printing} onClick={()=>void handlePrintProfile()}><Printer className="w-4 h-4"/>{printing?'Preparando ficha...':'Imprimir ficha'}</Button>}
            </div>
            {can('unidades_salas','can_execute')&&!selectedMeta&&<p className="text-xs text-muted-foreground">A impressão exige a confirmação das configurações da unidade.</p>}
          </>}
        </DialogContent>
      </Dialog>

      {/* Dialogs */}
      <Dialog open={unitDialog} onOpenChange={o=>{if(!o)closeForm(()=>setUnitDialog(false));}}>
        <DialogContent className="max-w-3xl gap-3">
          <DialogHeader className="clinical-hub-hero text-left pr-9"><p className="clinical-hub-eyebrow">Cadastro institucional</p><DialogTitle className="clinical-hub-name font-display">{editUnitId ? 'Editar' : 'Nova'} Unidade</DialogTitle><DialogDescription className="clinical-patient-sub text-xs">Identificação, contatos, CNES e identidade visual.</DialogDescription></DialogHeader>
          {formStatus}<fieldset disabled={blocked||enviandoLogo} className="clinical-premium p-3 space-y-3 min-w-0">
            <div className="triage-section-title"><Building2 className="w-4 h-4"/>Identificação institucional</div>
            <div><Label>Nome *</Label><Input value={unitForm.nome} onChange={e => setUnitForm(p => ({ ...p, nome: e.target.value }))} /></div>
            <div><Label>Nome exibido no sistema</Label><Input value={unitForm.nomeExibicao} onChange={e => setUnitForm(p => ({ ...p, nomeExibicao: e.target.value }))} placeholder="Ex: CER II (aparece no menu lateral)" /></div>
            <div className="triage-section-title"><MapPin className="w-4 h-4"/>Endereço e contatos</div>
            <div><Label>Endereço</Label><Input value={unitForm.endereco} onChange={e => setUnitForm(p => ({ ...p, endereco: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Telefone</Label><Input value={unitForm.telefone} onChange={e => setUnitForm(p => ({ ...p, telefone: e.target.value }))} /></div>
              <div><Label>WhatsApp</Label><Input value={unitForm.whatsapp} onChange={e => setUnitForm(p => ({ ...p, whatsapp: e.target.value }))} /></div>
            </div>
            <div className="triage-section-title"><ShieldCheck className="w-4 h-4"/>Identificação para produção</div>
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
            <div className="triage-section-title"><ImageIcon className="w-4 h-4"/>Identidade visual</div>
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
            {customConfig.fields.length > 0 && <div className="triage-section-title"><ClipboardList className="w-4 h-4"/>Campos personalizados</div>}
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
        <DialogContent className="max-w-3xl gap-3">
          <DialogHeader className="clinical-hub-hero text-left pr-9"><p className="clinical-hub-eyebrow">Estrutura física</p><DialogTitle className="clinical-hub-name font-display">{editRoomId?'Editar':roomForm.config.finalidade==='aparelho_diagnostico'?'Novo':'Nova'} {roomForm.config.finalidade==='aparelho_diagnostico'?'Aparelho / exame':'Sala'}</DialogTitle><DialogDescription className="clinical-patient-sub text-xs">Identificação, unidade vinculada e finalidade cadastrada.</DialogDescription></DialogHeader>
          {formStatus}<fieldset disabled={blocked} className="clinical-premium p-3 space-y-3 min-w-0">
            <div className="triage-section-title"><DoorOpen className="w-4 h-4"/>Identificação da estrutura</div>
            <div><Label>Nome *</Label><Input value={roomForm.nome} onChange={e => setRoomForm(p => ({ ...p, nome: e.target.value }))} /></div>
            <div><Label>Unidade *</Label>
              <Select disabled={!!editRoomId||blocked} value={roomForm.unidadeId} onValueChange={v => setRoomForm(p => ({ ...p, unidadeId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{allowedUnits.filter(u=>u.ativo&&canWrite(editRoomId?'can_edit':'can_create',u.id)).map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {editRoomId&&<p className="text-xs text-muted-foreground">Unidade protegida para preservar os vínculos históricos da sala.</p>}
            <div className="triage-section-title"><Activity className="w-4 h-4"/>Finalidade e configuração</div>
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
              <div className="clinical-inset space-y-3 rounded-lg border p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="clinical-premium p-2.5"><strong className="block text-xl tabular-nums">{diagnosticReview.total}</strong><span className="text-xs text-muted-foreground">Modalidades selecionadas</span></div>
                  <div className="clinical-premium p-2.5"><strong className="block text-xl tabular-nums">{diagnosticReview.review}</strong><span className="text-xs text-muted-foreground">Modalidades a conferir</span></div>
                </div>
                {diagnosticReview.duplicateIds>0&&<p role="alert" className="text-xs text-destructive">Identificadores repetidos. Não serão renumerados automaticamente, pois podem estar vinculados a agendamentos.</p>}
                <div className="space-y-2">
                  <Label>Exames disponíveis nesta sala *</Label>
                  <p className="text-xs text-muted-foreground">Marque os exames realizados neste aparelho. Cada modalidade mantém configuração própria. Os alertas de conferência são informativos.</p>
                  <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/><Input className="pl-9" aria-label="Buscar modalidade no catálogo" placeholder="Buscar modalidade (ex.: ECG, ultrassom...)" value={examSearch} onChange={e=>setExamSearch(e.target.value)}/></div>
                  <div className="grid gap-2 sm:grid-cols-2 max-h-64 overflow-y-auto">
                    {DIAGNOSTIC_EXAM_CATALOG.filter(item=>normalizeExamSearch(item.label+' '+item.keywords).includes(normalizeExamSearch(examSearch))).map(item => {
                      const selected = roomForm.config.exames.some(exam => exam.tipoExame === item.label);
                      return <label key={item.label} className="flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer">
                        <Checkbox disabled={blocked} checked={selected} onCheckedChange={checked => {
                          if(checked!==true&&!window.confirm('Retirar esta modalidade da configuração? Os agendamentos existentes não serão alterados.'))return;
                          setRoomForm(prev => {
                            const entry=createDiagnosticExamConfig(item.label);
                            const exames=checked===true?(prev.config.exames.some(exam=>exam.tipoExame===item.label)?prev.config.exames:[...prev.config.exames,{...entry,id:newExamId(prev.config.exames,entry.id,()=>crypto.randomUUID())}]):prev.config.exames.filter(exam=>exam.tipoExame!==item.label);
                            return {...prev,config:{...prev.config,exames}};
                          });
                        }} />
                        <span>{item.label}</span>
                      </label>;
                    })}
                  </div>
                  {!DIAGNOSTIC_EXAM_CATALOG.some(item=>normalizeExamSearch(item.label+' '+item.keywords).includes(normalizeExamSearch(examSearch)))&&<p className="text-xs text-muted-foreground">Nenhuma modalidade do catálogo corresponde à busca.</p>}
                  <Button type="button" variant="outline" size="sm" className="clinical-record-action gap-1.5" disabled={blocked} onClick={()=>setRoomForm(prev=>({...prev,config:{...prev.config,exames:[...prev.config.exames,createDiagnosticExamConfig('', 'exam-'+crypto.randomUUID())]}}))}><Plus className="w-4 h-4"/>Adicionar exame personalizado</Button>
                  <p className="text-xs text-muted-foreground">Abra cada modalidade abaixo para editar seus dados. Nenhuma orientação de preparo ou código é sugerido automaticamente.</p>
                  {roomForm.config.exames.map((exam, index) => (
                    <details key={exam.id+'-'+index} className="clinical-premium rounded-lg border p-3">
                      <summary className="cursor-pointer text-sm font-semibold break-words">{exam.tipoExame || 'Novo exame personalizado'}<span className="ml-2 text-xs font-normal text-muted-foreground">{exam.duracaoSlot} min · {exam.prazoResultadoDias} dia(s) · {examReview(exam).length?examReview(exam).length+' ponto(s) a conferir':'Sem alertas de preenchimento'}</span></summary>
                      <div className="mt-3 space-y-3">
                      {examReview(exam).length>0&&<p className="text-xs text-amber-800 dark:text-amber-300">{examReview(exam).join(' · ')}</p>}
                      <div className="flex justify-end"><Button type="button" size="sm" variant="outline" disabled={blocked} onClick={() => {if(window.confirm('Remover esta modalidade da configuração? Os agendamentos existentes não serão alterados.'))setRoomForm(prev=>({...prev,config:{...prev.config,exames:prev.config.exames.filter((_,i)=>i!==index)}}));}}><X className="h-4 w-4" /> Remover modalidade</Button></div>
                      {!DIAGNOSTIC_EXAM_CATALOG.some(item => item.label === exam.tipoExame) && <div><Label>Nome do exame *</Label><Input value={exam.tipoExame} onChange={e => setRoomForm(prev => ({ ...prev, config: { ...prev.config, exames: prev.config.exames.map((item,i) => i === index ? { ...item, tipoExame: e.target.value } : item) } }))} placeholder="Digite o nome do exame" /></div>}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div><Label>Duração do slot</Label><Select disabled={blocked} value={String(exam.duracaoSlot)} onValueChange={v => setRoomForm(prev => ({ ...prev, config: { ...prev.config, exames: prev.config.exames.map((item,i) => i === index ? { ...item, duracaoSlot: Number(v) } : item) } }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[10,15,20,30,45].map(n => <SelectItem key={n} value={String(n)}>{n} minutos</SelectItem>)}</SelectContent></Select></div>
                        <div><Label>Prazo do resultado (dias)</Label><Input type="number" min="0" max="90" value={exam.prazoResultadoDias} onChange={e => setRoomForm(prev => ({ ...prev, config: { ...prev.config, exames: prev.config.exames.map((item,i) => i === index ? { ...item, prazoResultadoDias: Math.min(90, Math.max(0, Number(e.target.value) || 0)) } : item) } }))} /></div>
                        <div className="sm:col-span-2"><Label>Código SIGTAP (BPA-I)</Label><Input inputMode="numeric" maxLength={10} value={exam.codigoSigtap || ''} onChange={e => setRoomForm(prev => ({ ...prev, config: { ...prev.config, exames: prev.config.exames.map((item,i) => i === index ? { ...item, codigoSigtap: e.target.value.replace(/\D/g, '').slice(0, 10) } : item) } }))} placeholder="10 dígitos, ex.: código oficial do exame" /><p className="text-xs text-muted-foreground mt-1">Formato de 10 dígitos não confirma validade oficial. Códigos incompletos não são mantidos pela normalização existente. A regra de exportação BPA-I permanece a mesma.</p><div className="mt-2"><DiagnosticSigtapLookup key={scopeKey+exam.id+index} code={exam.codigoSigtap||''} scope={scopeKey} disabled={blocked||!canWrite(editRoomId?'can_edit':'can_create',roomForm.unidadeId)} onSelect={code=>setRoomForm(prev=>({...prev,config:{...prev.config,exames:prev.config.exames.map((item,i)=>i===index?{...item,codigoSigtap:code}:item)}}))}/></div></div>
                      </div>
                      <div className="flex items-center justify-between"><Label>Exige preparo prévio?</Label><Switch disabled={blocked} checked={exam.exigePreparo} onCheckedChange={v => setRoomForm(prev => ({ ...prev, config: { ...prev.config, exames: prev.config.exames.map((item,i) => i === index ? { ...item, exigePreparo: v } : item) } }))} /></div>
                      {exam.exigePreparo && <div><Label>Instruções de preparo</Label><Textarea rows={3} value={exam.instrucoesPreparo} onChange={e => setRoomForm(prev => ({ ...prev, config: { ...prev.config, exames: prev.config.exames.map((item,i) => i === index ? { ...item, instrucoesPreparo: e.target.value } : item) } }))} placeholder="Preencha as orientações oficiais da unidade para este exame." /></div>}
                      <div><Label>Exige contraste?</Label><Select disabled={blocked} value={exam.exigeContraste} onValueChange={v => setRoomForm(prev => ({ ...prev, config: { ...prev.config, exames: prev.config.exames.map((item,i) => i === index ? { ...item, exigeContraste: v as DiagnosticRoomConfig['exigeContraste'] } : item) } }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nao">Não</SelectItem><SelectItem value="sim">Sim</SelectItem><SelectItem value="opcional">Opcional</SelectItem></SelectContent></Select></div>
                      </div>
                    </details>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Início da agenda</Label><Input type="time" value={roomForm.config.horarioInicio || '07:00'} onChange={e => setRoomForm(p => ({ ...p, config: { ...p.config, horarioInicio: e.target.value } }))} /></div>
                  <div><Label>Fim da agenda</Label><Input type="time" value={roomForm.config.horarioFim || '17:00'} onChange={e => setRoomForm(p => ({ ...p, config: { ...p.config, horarioFim: e.target.value } }))} /></div>
                </div>
                {diagnosticReview.invalidWindow&&<p role="status" className="text-xs text-amber-800 dark:text-amber-300">Confira o horário: a regra atual não gera slots quando o fim não é posterior ao início.</p>}
                <p className="text-xs text-muted-foreground">Os horários de funcionamento são compartilhados pela sala; cada exame selecionado mantém duração, preparo, contraste e prazo independentes. Consultórios comuns permanecem inalterados.</p>
              </div>
            )}
            <Button onClick={handleSaveRoom} disabled={blocked} className="w-full gradient-primary text-primary-foreground">{saving?'Salvando...':editRoomId ? 'Salvar' : 'Criar'}</Button>
          </fieldset>
        </DialogContent>
      </Dialog>

      <Dialog open={!!videoUnit} onOpenChange={o=>{if(!o&&!busy.current&&!enviando){if(videoDirty&&!window.confirm('Descartar as alterações não salvas da sequência de vídeos?'))return;closeForm(()=>{clearVideoPreview();setVideoUnit(null);});}}}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-3xl gap-3">
          <DialogHeader className="clinical-hub-hero text-left pr-9"><div className="flex items-start gap-3"><span className="clinical-patient-avatar flex items-center justify-center shrink-0"><Tv className="w-5 h-5"/></span><div className="min-w-0"><p className="clinical-hub-eyebrow">Painel de Chamadas · administração</p><DialogTitle className="clinical-hub-name font-display break-words">Vídeos de espera</DialogTitle><DialogDescription className="clinical-patient-sub text-xs">{videoUnit?.nome} · Configuração da sequência de reprodução</DialogDescription></div></div></DialogHeader>
          {formStatus}
          {videoUnit&&<section className="clinical-premium p-3 space-y-2"><h3 className="font-semibold text-sm flex items-center gap-2"><Tv className="w-4 h-4 text-primary"/>Acesso à TV</h3><div className="flex flex-wrap gap-2"><Input readOnly className="flex-1 min-w-[12rem] text-xs" aria-label="Endereço do painel da unidade" value={linkTV(videoUnit.id)} onFocus={e=>e.target.select()}/><Button type="button" size="sm" variant="outline" className="clinical-record-action gap-1.5" onClick={()=>void copiarLink(videoUnit.id)}><Copy className="w-4 h-4"/>Copiar link</Button><Button type="button" size="sm" variant="outline" className="clinical-record-action gap-1.5" onClick={()=>window.open(linkTV(videoUnit.id),'_blank','noopener,noreferrer')}><ExternalLink className="w-4 h-4"/>Abrir painel</Button></div><p className="text-xs text-muted-foreground">O link mantém o modo de áudio padrão. A configuração não indica se a TV está ligada ou conectada.</p></section>}
          <fieldset disabled={blocked||enviando} className="space-y-3 min-w-0">
            <section className="clinical-premium p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold flex items-center gap-2"><List className="w-4 h-4 text-primary"/>Sequência de reprodução</h3><span className="text-xs text-muted-foreground">{formLoading||formError?'Não confirmada':videoDirty?'Alterações não salvas':'Lista carregada'}</span></div>
              <div className="grid grid-cols-2 gap-2"><div className="clinical-inset border rounded-lg p-2"><strong className="block text-xl tabular-nums">{formLoading||formError?'—':videoList.length}</strong><span className="text-xs text-muted-foreground">Vídeos na lista</span></div><div className="clinical-inset border rounded-lg p-2 min-w-0"><span className="text-xs text-muted-foreground">Primeiro da sequência</span><strong className="block truncate text-sm">{formLoading||formError?'—':videoList.length?videoEntryLabel(videoList[0],0):'Nenhum'}</strong></div></div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {!formLoading&&!formError&&videoList.length===0&&<p className="text-sm text-muted-foreground py-2">Nenhum vídeo local na lista. Adicione um arquivo ou endereço HTTPS.</p>}
                {videoList.map((u,i)=><div key={i} className={`clinical-inset border rounded-lg p-2 flex flex-wrap items-center gap-2 ${previewIndex===i?'ring-1 ring-primary':''}`}><span className="clinical-dock-icon clinical-tone-blue shrink-0"><span className="text-xs font-semibold">{i+1}</span></span><div className="flex-1 min-w-[8rem]"><p className="text-sm font-medium break-all">{videoEntryLabel(u,i)}</p><p className="text-xs text-muted-foreground">{i===0?'Primeiro vídeo':'Posição '+(i+1)} · {videoPreviewAllowed(u)?'HTTPS':'Endereço a conferir'}</p></div><div className="flex items-center gap-1 ml-auto"><Button type="button" size="icon" variant="outline" className="h-8 w-8" disabled={!videoPreviewAllowed(u)||blocked||enviando} title="Pré-visualizar" aria-label={`Pré-visualizar vídeo ${i+1}`} onClick={()=>previewIndex===i?clearVideoPreview():openVideoPreview(i)}><Play className="w-3.5 h-3.5"/></Button><Button type="button" size="icon" variant="outline" className="h-8 w-8" disabled={i===0||blocked||enviando} aria-label={`Subir vídeo ${i+1}`} title="Mover para cima" onClick={()=>moverVideo(i,-1)}><ArrowUp className="w-3.5 h-3.5"/></Button><Button type="button" size="icon" variant="outline" className="h-8 w-8" disabled={i===videoList.length-1||blocked||enviando} aria-label={`Descer vídeo ${i+1}`} title="Mover para baixo" onClick={()=>moverVideo(i,1)}><ArrowDown className="w-3.5 h-3.5"/></Button><Button type="button" size="icon" variant="outline" className="h-8 w-8 text-destructive" disabled={blocked||enviando} aria-label={`Retirar vídeo ${i+1}`} title="Retirar da sequência" onClick={()=>retirarVideo(i)}><X className="w-3.5 h-3.5"/></Button></div></div>)}
              </div>
              {previewUrl&&videoPreviewAllowed(previewUrl)&&<div className="clinical-inset border rounded-lg p-2 space-y-2"><div className="flex items-center justify-between gap-2"><strong className="text-xs">Prévia local · {videoEntryLabel(previewUrl,previewIndex??0)}</strong><Button type="button" size="sm" variant="ghost" onClick={clearVideoPreview}>Fechar prévia</Button></div><video key={previewUrl} src={previewUrl} controls muted playsInline preload="metadata" className="w-full max-h-56 bg-black rounded-md" onLoadedMetadata={()=>setPreviewStatus('ready')} onError={()=>setPreviewStatus('error')}/>{previewStatus==='loading'&&<p role="status" className="text-xs text-muted-foreground">Carregando informações do vídeo...</p>}{previewStatus==='error'&&<p role="alert" className="text-xs text-destructive">Não foi possível reproduzir a prévia neste navegador. O arquivo e a sequência permanecem intactos.</p>}<p className="text-xs text-muted-foreground">Prévia apenas neste computador, sem reprodução automática. Não comprova compatibilidade com a TV.</p></div>}
              <p className="text-xs text-muted-foreground">A regra existente de reprodução em sequência e repetição permanece igual. Nenhum arquivo é excluído ao retirar uma entrada.</p>
            </section>
            <section className="clinical-premium p-3 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Plus className="w-4 h-4 text-primary"/>Adicionar vídeo</h3>
              <Label htmlFor="structure-video-url">Endereço HTTPS do MP4</Label><div className="flex flex-wrap items-center gap-2"><Input id="structure-video-url" className="flex-1 min-w-[12rem]" value={videoUrl} onChange={e=>setVideoUrl(e.target.value)} placeholder="https://.../video.mp4"/><Button type="button" size="sm" variant="outline" disabled={!videoUrl.trim()||blocked||enviando} onClick={addUrl}><Plus className="w-4 h-4 mr-1"/>Adicionar à lista</Button></div>
              <label className="clinical-inset flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-4 cursor-pointer hover:bg-muted/50 text-sm">{enviando?<Loader2 className="w-5 h-5 animate-spin"/>:<Upload className="w-5 h-5 text-primary"/>}<span>{enviando?'Enviando vídeo...':'Selecionar arquivo MP4'}</span><span className="text-xs text-muted-foreground">Até 100 MB · recomendado H.264, 1080p</span><input type="file" accept="video/mp4" className="sr-only" disabled={blocked||enviando} onChange={e=>{const f=e.target.files?.[0];if(f)void enviarVideo(f);e.target.value='';}}/></label>
            </section>
            <p className="text-xs text-muted-foreground">A TV recebe a nova sequência somente depois que o servidor confirma o salvamento. {videoUrl.trim()?'O endereço ainda digitado também será incluído ao salvar.':''}</p>
            <Button type="button" onClick={salvarVideo} disabled={blocked||enviando||!videoDirty} className="w-full gradient-primary text-primary-foreground">{saving?'Salvando...':'Salvar configuração'}</Button>
          </fieldset>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UnidadesSalas;
