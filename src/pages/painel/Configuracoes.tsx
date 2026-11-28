import PortalQrCodeCard from '@/components/PortalQrCodeCard';
import React, { lazy, Suspense, useEffect, useState, useCallback, useRef } from 'react';
import ConfigNavigation from '@/components/config/ConfigNavigation';
import { CONFIG_SECTIONS, CONFIG_GROUPS, resolveConfigTab, type ConfigTabId } from '@/lib/configNavigation';
import { useOperacional } from '@/contexts/OperacionalContext';
import GerenciarProcedimentos from '@/components/GerenciarProcedimentos';
import VincularSigtapProcedimentos from '@/components/VincularSigtapProcedimentos';
import SigtapSyncPanel from '@/components/SigtapSyncPanel';
import ConfiguracaoTriagem from '@/components/ConfiguracaoTriagem';
import { useAuth } from '@/contexts/AuthContext';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MessageSquare, Calendar, QrCode, Settings as SettingsIcon, Loader2,
  CheckCircle2, XCircle, Webhook, Send, Pencil, Mail, AlertCircle,
  HeartPulse, Shield, Users, Bell, ShieldAlert, RefreshCw,
  ArrowRightLeft, User, Clock, CalendarDays, Info, FileText,
  Globe, Ban, Plus, Trash2, Building2, ClipboardList, Search,
  Stethoscope, Activity, Monitor, Network
} from 'lucide-react';
import EditorProntuarioConfig from '@/components/EditorProntuarioConfig';
import { Stamp } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams, Navigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useWebhookNotify } from '@/hooks/useWebhookNotify';










import { cn } from '@/lib/utils';
import {saveSystemConfigPatch} from '@/lib/systemConfigWriter';
import {safeIntegrationUrl,explicitSuccess} from '@/lib/adminIntegrations';
import {useAdministrativeConfigSection} from '@/hooks/useProntuarioSettings';
import {configObject,sameConfigSection} from '@/lib/configSectionGuard';
import {readCompleteCatalog} from '@/lib/adminCatalog';
import {nextVersion} from '@/lib/adminWhatsApp';
import {adminAppointmentAllowed,validateOnlineRules,validateCancellationRules} from '@/lib/adminOperations';
import {auditService} from '@/services/auditService';
import type {Json,Tables} from '@/integrations/supabase/types';

const ConfigProntuario = lazy(() => import('@/components/config/ConfigProntuario'));
const ConfigMedicamentosExames = lazy(() => import('@/components/config/ConfigMedicamentosExames'));
const ConfigImpressaoDocumentos = lazy(() => import('@/components/config/ConfigImpressaoDocumentos'));
const ConfigEspecialidades = lazy(() => import('@/components/config/ConfigEspecialidades'));
const ConfigFluxoAtendimento = lazy(() => import('@/components/config/ConfigFluxoAtendimento'));
const ConfigSistema = lazy(() => import('@/components/config/ConfigSistema'));
const ConfigPersonalizarCampos = lazy(() => import('@/components/config/ConfigPersonalizarCampos'));
const ConfigWhatsApp = lazy(() => import('@/components/config/ConfigWhatsApp'));
const ConfigSistemasIntegrados = lazy(() => import('@/components/config/ConfigSistemasIntegrados'));
const ConfigRegrasCarencia = lazy(() => import('@/components/config/ConfigRegrasCarencia'));

type AdminAppointment=Pick<Tables<'agendamentos'>,'id'|'paciente_nome'|'data'|'hora'|'status'|'profissional_id'|'profissional_nome'|'observacoes'|'unidade_id'|'atualizado_em'|'iniciado_em'|'concluido_em'>;
const PORTAL_DEFAULT={permitirPortal:true,enviarSenhaAutomaticamente:true,enviarLinkAcesso:true,pacientesBloqueados:[] as string[]};
const ONLINE_DEFAULT={habilitado:false,antecedencia_minima_dias:1,antecedencia_maxima_dias:30,limite_por_dia_profissional:5,mensagem_confirmacao:'Seu agendamento foi confirmado com sucesso!',exigir_confirmacao_sms:false,profissionais_bloqueados:[] as string[]};
const CANCEL_DEFAULT={prazo_minimo_horas:24,limite_cancelamentos_mes:3,dias_bloqueio_apos_limite:7,motivos:['Compromisso pessoal','Problema de saúde','Falta de transporte','Horário incompatível','Outro'],notificar_profissional:true,liberar_vaga_automaticamente:true};
const APPOINTMENT_FIELDS='id,paciente_nome,data,hora,status,profissional_id,profissional_nome,observacoes,unidade_id,atualizado_em,iniciado_em,concluido_em' as const;

const Configuracoes: React.FC = () => {
  const { configuracoes, updateConfiguracoes, unidades, funcionarios } = useOperacional();
  const { user } = useAuth();
  const { googleCalendar, filaEspera, templates, webhook } = configuracoes;
  const gcal = useGoogleCalendar();
  const [searchParams, setSearchParams] = useSearchParams();
  const [webhookUrl, setWebhookUrl] = useState('');
  const [integrationReady,setIntegrationReady]=useState(false);
  const [integrationBusy,setIntegrationBusy]=useState(false);
  const integrationLock=useRef(false);
  const integrationBaseline=useRef<Record<string,unknown>>({});
  const [gmailDraft,setGmailDraft]=useState({ativo:false,email:'',senhaApp:'',smtpHost:'smtp.gmail.com',smtpPort:587});
  const [templateDraft,setTemplateDraft]=useState(templates);
  const [channel,setChannel]=useState<'webhook'|'gmail'|'ambos'>('webhook');
  const [webhookSaved,setWebhookSaved]=useState(webhook);
  const [googleSaved,setGoogleSaved]=useState(googleCalendar);
  const oauthHandled=useRef('');
  const [webhookEditing, setWebhookEditing] = useState(!webhook.url);
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [gmailTesting, setGmailTesting] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<'idle' | 'conectado' | 'erro_autenticacao' | 'erro_conexao' | 'erro_envio' | 'nao_configurado'>('idle');
  const [gmailMessage, setGmailMessage] = useState('');
  const { testGmail } = useWebhookNotify();
  const [triageEnabled, setTriageEnabled] = useState(false);
  const [triageLoading, setTriageLoading] = useState(true);
  const [triageSettingId, setTriageSettingId] = useState<string | null>(null);
  const [triageFailed,setTriageFailed]=useState(false);
  const [triageScope,setTriageScope]=useState<string|null>(null);
  const triageRaw=useRef<boolean|null>(null),triageLock=useRef(false),triageRequest=useRef(0);

  const [requestedTab, setActiveTab] = useState<ConfigTabId>('prontuario');

  const [reativarProfId, setReativarProfId] = useState('');
  const [reativarAgendamentos, setReativarAgendamentos] = useState<AdminAppointment[]>([]);
  const [reativarAgId, setReativarAgId] = useState('');
  const [reativarLoading, setReativarLoading] = useState(false);
  const [reativarProfSearch, setReativarProfSearch] = useState('');
  const [reativarBuscando, setReativarBuscando] = useState(false);
  const [reativarPacienteSearch, setReativarPacienteSearch] = useState('');

  const [transferAgId, setTransferAgId] = useState('');
  const [transferNovoProfId, setTransferNovoProfId] = useState('');
  const [transferMotivo, setTransferMotivo] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferAgendamentos, setTransferAgendamentos] = useState<AdminAppointment[]>([]);
  const [transferProfOrigem, setTransferProfOrigem] = useState('');
  const [transferBuscando, setTransferBuscando] = useState(false);

  const [agOnline,setAgOnline]=useState(ONLINE_DEFAULT);
  const [agOnlineLoading,setAgOnlineLoading]=useState(true);
  const [agOnlineSaving,setAgOnlineSaving]=useState(false);
  const [cancelConfig,setCancelConfig]=useState(CANCEL_DEFAULT);
  const [cancelLoading,setCancelLoading]=useState(true);
  const [cancelSaving,setCancelSaving]=useState(false);
  const [novoMotivo,setNovoMotivo]=useState('');
  const [adminFailed,setAdminFailed]=useState(false);
  const [portal,setPortal]=useState(PORTAL_DEFAULT);
  const [portalReady,setPortalReady]=useState(false);
  const [portalSaving,setPortalSaving]=useState(false);
  const {load:loadPortalSection,save:writePortalSection}=useAdministrativeConfigSection('portalPaciente');
  const rowsBaseline=useRef<Record<string,{raw:unknown;version:string|null}>>({});
  const adminLock=useRef(false),portalLock=useRef(false),operationLock=useRef(false),reactivateSeq=useRef(0),transferSeq=useRef(0);
  const [reactivateFailed,setReactivateFailed]=useState(false),[transferFailed,setTransferFailed]=useState(false);
  const confirmAdmin=useCallback(async()=>{const {data,error}=await supabase.auth.getSession();if(error||!user?.authUserId||user.role!=='master'||user.ativo!==true||data.session?.user.id!==user.authUserId)throw Error('Sessão administrativa não confirmada.');},[user?.authUserId,user?.role,user?.ativo]);

  const isMaster = user?.role === 'master';
  const _isGlobalMaster = user?.usuario === 'admin.sms';
  const activeTab = resolveConfigTab(requestedTab, _isGlobalMaster);
  const activeSection = CONFIG_SECTIONS.find(section => section.id === activeTab)!;
  const activeGroup = CONFIG_GROUPS.find(group => group.id === activeSection.group)!;
  const _isUnitMaster = isMaster && !!user?.unidadeId && !_isGlobalMaster;
  const profissionaisAtivos = [...funcionarios].sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
  );

  const buscarTodosAgendamentosPorProfissional=async(profId:string)=>{
    await confirmAdmin();
    if(!_isGlobalMaster&&!user?.unidadeId)throw Error('Unidade não confirmada.');
    return readCompleteCatalog<AdminAppointment>(async(from,to)=>{
      let query=supabase.from('agendamentos').select(APPOINTMENT_FIELDS,{count:'exact'}).eq('profissional_id',profId);
      if(!_isGlobalMaster)query=query.eq('unidade_id',user!.unidadeId);
      const {data,error,count}=await query.order('id').range(from,to);
      if(error||!data)throw Error('Consulta não confirmada.');return {rows:data,count};
    },500);
  };
  const buscarAgendamentosReativar=async(profId:string)=>{
    const seq=++reactivateSeq.current;setReativarAgendamentos([]);setReativarAgId('');setReactivateFailed(false);setReativarBuscando(true);
    try{const data=await buscarTodosAgendamentosPorProfissional(profId);if(seq===reactivateSeq.current)setReativarAgendamentos(data.sort((a,b)=>b.data.localeCompare(a.data)||a.hora.localeCompare(b.hora)));}
    catch{if(seq===reactivateSeq.current)setReactivateFailed(true);}
    finally{if(seq===reactivateSeq.current)setReativarBuscando(false);}
  };
  const buscarAgendamentosTransferir=async(profId:string)=>{
    const seq=++transferSeq.current;setTransferAgendamentos([]);setTransferAgId('');setTransferFailed(false);setTransferBuscando(true);
    try{const data=await buscarTodosAgendamentosPorProfissional(profId);if(seq===transferSeq.current)setTransferAgendamentos(data.sort((a,b)=>b.data.localeCompare(a.data)||a.hora.localeCompare(b.hora)));}
    catch{if(seq===transferSeq.current)setTransferFailed(true);}
    finally{if(seq===transferSeq.current)setTransferBuscando(false);}
  };
  const verifyAppointment=async(selected:AdminAppointment,kind:'reactivate'|'transfer')=>{
    await confirmAdmin();
    if(!_isGlobalMaster&&selected.unidade_id!==user?.unidadeId)throw Error('Agendamento fora da unidade.');
    const {data,error}=await supabase.from('agendamentos').select(APPOINTMENT_FIELDS).eq('id',selected.id).maybeSingle();
    if(error||!data||!sameConfigSection(data,selected))throw Error('Agendamento alterado. Refaça a consulta.');
    if(!adminAppointmentAllowed(data,kind))throw Error('O estado deste atendimento exige o fluxo assistencial próprio.');
    const [records,sessions]=await Promise.all([
      supabase.from('prontuarios').select('id',{count:'exact',head:true}).eq('agendamento_id',data.id),
      supabase.from('treatment_sessions').select('id',{count:'exact',head:true}).eq('appointment_id',data.id),
    ]);
    if(records.error||sessions.error||records.count===null||sessions.count===null)throw Error('Vínculos clínicos não confirmados.');
    if(records.count>0||sessions.count>0)throw Error('Agendamento vinculado a prontuário ou sessão de tratamento. Utilize o fluxo clínico correspondente.');
    return data;
  };
  const logOperation=(acao:string,ag:AdminAppointment,detalhes:Record<string,unknown>)=>{
    if(user)void auditService.log({acao,modulo:'configuracoes',entidade:'agendamentos',entidadeId:ag.id,unidadeId:ag.unidade_id,user:{id:user.id,nome:user.nome,role:user.role,unidadeId:user.unidadeId},detalhes}).catch(()=>undefined);
  };
  const executarReativar=async()=>{
    const selected=reativarAgendamentos.find(a=>a.id===reativarAgId&&a.profissional_id===reativarProfId);
    if(operationLock.current||reativarBuscando||reactivateFailed||!selected)return;
    if(!window.confirm('Reativar o botão deste agendamento? Esta operação altera o status para apto a atendimento.'))return;
    operationLock.current=true;setReativarLoading(true);
    try{
      const ag=await verifyAppointment(selected,'reactivate');
      const {data,error}=await supabase.from('agendamentos').update({status:'apto_atendimento',atualizado_em:nextVersion(ag.atualizado_em)}).eq('id',ag.id).eq('profissional_id',ag.profissional_id).eq('unidade_id',ag.unidade_id).eq('status',ag.status).eq('atualizado_em',ag.atualizado_em).is('concluido_em',null).select('id,status').maybeSingle();
      if(error||data?.status!=='apto_atendimento')throw Error('Reativação não confirmada. Confira o agendamento.');
      logOperation('REATIVAR_ATENDIMENTO_ADMIN',ag,{status_anterior:ag.status,status_novo:data.status});toast.success('Reativação confirmada.');await buscarAgendamentosReativar(reativarProfId);
    }catch(error){setReactivateFailed(true);toast.error(error instanceof Error?error.message:'Operação não confirmada.');}
    finally{operationLock.current=false;setReativarLoading(false);}
  };
  const executarTransferencia=async()=>{
    const selected=transferAgendamentos.find(a=>a.id===transferAgId&&a.profissional_id===transferProfOrigem);
    const target=funcionarios.find(f=>f.id===transferNovoProfId&&f.ativo);
    if(operationLock.current||transferBuscando||transferFailed||!selected||!target||target.id===selected.profissional_id||!transferMotivo.trim())return;
    if(!window.confirm('Transferir este agendamento ao profissional selecionado? Confira a agenda de destino e o motivo informado.'))return;
    operationLock.current=true;setTransferLoading(true);
    try{
      const ag=await verifyAppointment(selected,'transfer');
      const {data:dest,error:destError}=await supabase.from('funcionarios').select('id,nome,ativo,unidade_id').eq('id',target.id).maybeSingle();
      if(destError||!dest?.ativo||dest.unidade_id!==ag.unidade_id)throw Error('Destino ativo na mesma unidade não confirmado. Utilize o fluxo próprio para transferência entre unidades.');
      const {data:conflict,error:conflictError}=await supabase.from('agendamentos').select('id').eq('profissional_id',dest.id).eq('data',ag.data).eq('hora',ag.hora).not('status','in','(cancelado,remarcado,falta)').limit(1);
      if(conflictError||!conflict||conflict.length)throw Error('Horário do destino indisponível ou não confirmado. Confira a agenda.');
      const novaObs=`${ag.observacoes||''}\n[TRANSFERÊNCIA] De ${ag.profissional_nome||'N/A'} para ${dest.nome}. Motivo: ${transferMotivo.trim()}`.trim();
      await confirmAdmin();
      const {data,error}=await supabase.from('agendamentos').update({profissional_id:dest.id,profissional_nome:dest.nome,observacoes:novaObs,atualizado_em:nextVersion(ag.atualizado_em)}).eq('id',ag.id).eq('profissional_id',ag.profissional_id).eq('unidade_id',ag.unidade_id).eq('status',ag.status).eq('atualizado_em',ag.atualizado_em).is('concluido_em',null).is('iniciado_em',null).select('id,profissional_id').maybeSingle();
      if(error||data?.profissional_id!==dest.id)throw Error('Transferência não confirmada. Confira o agendamento.');
      logOperation('TRANSFERIR_ATENDIMENTO_ADMIN',ag,{origem:ag.profissional_id,destino:dest.id,motivo_registrado:true});toast.success('Transferência confirmada.');setTransferMotivo('');setTransferNovoProfId('');await buscarAgendamentosTransferir(transferProfOrigem);
    }catch(error){setTransferFailed(true);toast.error(error instanceof Error?error.message:'Operação não confirmada.');}
    finally{operationLock.current=false;setTransferLoading(false);}
  };

  const readUnitTriage=useCallback(async()=>{
    const unitId=user?.unidadeId;
    const unit=unitId?await supabase.from('triage_settings').select('*').is('profissional_id',null).eq('unidade_id',unitId).maybeSingle():null;
    if(unit?.error)throw unit.error;
    if(unit?.data)return unit.data;
    const {data,error}=await supabase.from('triage_settings').select('*').is('profissional_id',null).is('unidade_id',null).maybeSingle();
    if(error)throw error;return data;
  },[user?.unidadeId]);
  const loadUnitTriage=useCallback(async()=>{
    const request=++triageRequest.current;
    setTriageLoading(true);setTriageFailed(false);
    try{
      const data=await readUnitTriage();
      if(request!==triageRequest.current)return;
      setTriageEnabled(data?.enabled??false);setTriageSettingId(data?.id??null);setTriageScope(data?.unidade_id??null);triageRaw.current=data?.enabled??null;
    }catch{if(request===triageRequest.current)setTriageFailed(true);}
    finally{if(request===triageRequest.current)setTriageLoading(false);}
  },[readUnitTriage]);
  useEffect(()=>{void loadUnitTriage();return()=>{triageRequest.current++;};},[loadUnitTriage]);
  const saveUnitTriage=async(v:boolean)=>{
    if(triageLock.current||triageLoading||triageFailed||!window.confirm(triageSettingId&&!triageScope?'A unidade utiliza a regra global. Alterar essa regra global?':'Alterar a regra de triagem da unidade?'))return;
    triageLock.current=true;setTriageLoading(true);
    try{
      const {data:auth,error:authError}=await supabase.auth.getSession();
      if(authError||!user?.authUserId||user.role!=='master'||user.ativo!==true||auth.session?.user.id!==user.authUserId)throw Error('Sessão não confirmada.');
      const current=await readUnitTriage();
      if((current?.id??null)!==triageSettingId||(current?.enabled??null)!==triageRaw.current)throw Error('Regra alterada. Recarregue antes de repetir.');
      const payload={enabled:v,updated_at:new Date().toISOString()};
      const result=current?await (current.enabled===null?supabase.from('triage_settings').update(payload).eq('id',current.id).is('enabled',null):supabase.from('triage_settings').update(payload).eq('id',current.id).eq('enabled',current.enabled)).is('profissional_id',null).select('id,enabled').maybeSingle():await supabase.from('triage_settings').insert({...payload,unidade_id:user.unidadeId||null,profissional_id:null}).select('id,enabled').single();
      if(result.error||!result.data||result.data.enabled!==v)throw Error('Gravação não confirmada.');
      toast.success('Regra de triagem confirmada.');await loadUnitTriage();
    }catch(error){setTriageFailed(true);toast.error(error instanceof Error?error.message:'Gravação não confirmada.');}
    finally{triageLock.current=false;setTriageLoading(false);}
  };

  useEffect(() => {
    const code = searchParams.get('code');
    if (code && user?.usuario==='admin.sms' && oauthHandled.current!==code) {
      oauthHandled.current=code;
      confirmAdmin().then(()=>gcal.exchangeCode(code)).then(async () => {
        await persistGoogleStatus(true);
        toast.success('Google Agenda conectada com sucesso!');
        searchParams.delete('code');
        searchParams.delete('state');
        searchParams.delete('scope');
        setSearchParams(searchParams, { replace: true });
      }).catch(() => {
        toast.error('Conexão ou atualização local não confirmada.');
      });
    }
  }, [user?.usuario,confirmAdmin,searchParams,gcal.exchangeCode]);

  const loadAdmin=useCallback(async()=>{
    if(!isMaster)return;
    setAgOnlineLoading(true);setCancelLoading(true);setAdminFailed(false);rowsBaseline.current={};
    try{
      await confirmAdmin();
      const {data,error}=await supabase.from('system_config').select('id,configuracoes,updated_at').in('id',['config_agendamento_online','config_cancelamentos']);
      if(error||!data)throw Error('Consulta não confirmada.');
      for(const id of ['config_agendamento_online','config_cancelamentos']){
        const row=data.find(r=>r.id===id);rowsBaseline.current[id]={raw:row?.configuracoes,version:row?.updated_at??null};
        if(row&&!Number.isFinite(Date.parse(row.updated_at)))throw Error('Versão inválida.');
      }
      const online=rowsBaseline.current.config_agendamento_online.raw,cancel=rowsBaseline.current.config_cancelamentos.raw;
      const o={...ONLINE_DEFAULT,...(online===undefined?{}:configObject(online))},c={...CANCEL_DEFAULT,...(cancel===undefined?{}:configObject(cancel))};
      if(!Array.isArray(o.profissionais_bloqueados)||!Array.isArray(c.motivos))throw Error('Configuração inválida.');
      setAgOnline(o);setCancelConfig(c);
    }catch{setAdminFailed(true);}
    finally{setAgOnlineLoading(false);setCancelLoading(false);}
  },[isMaster,confirmAdmin]);
  const loadPortal=useCallback(async()=>{
    setPortalReady(false);
    try{const raw=await loadPortalSection();const value={...PORTAL_DEFAULT,...(raw===undefined?{}:configObject(raw))};if(!Array.isArray(value.pacientesBloqueados))throw Error('Configuração inválida.');setPortal(value);setPortalReady(true);}
    catch{setPortalReady(false);}
  },[loadPortalSection]);
  useEffect(()=>{if(activeTab==='usuarios'&&isMaster){void loadAdmin();void loadPortal();}},[activeTab,isMaster,loadAdmin,loadPortal]);
  const savePortal=async(key:'permitirPortal'|'enviarSenhaAutomaticamente'|'enviarLinkAcesso',value:boolean)=>{
    if(!portalReady||portalLock.current||!window.confirm('Alterar esta regra geral do Portal do Paciente?'))return;
    portalLock.current=true;setPortalSaving(true);
    try{if(!await writePortalSection(previous=>({...PORTAL_DEFAULT,...(previous===undefined?{}:configObject(previous)),[key]:value})))throw Error('Gravação não confirmada.');setPortal(p=>({...p,[key]:value}));toast.success('Regra do portal confirmada.');}
    catch{setPortalReady(false);toast.error('Regra não confirmada. Atualize antes de repetir.');}
    finally{portalLock.current=false;setPortalSaving(false);}
  };
  const saveAdminRow=async(id:string,draft:Record<string,unknown>)=>{
    const old=rowsBaseline.current[id];if(!old||adminFailed)throw Error('Leitura não confirmada.');
    await confirmAdmin();
    const next={...(old.raw===undefined?{}:configObject(old.raw)),...draft};
    const payload={configuracoes:next as Json,updated_at:old.version?nextVersion(old.version):new Date().toISOString()};
    const result=old.version?await supabase.from('system_config').update(payload).eq('id',id).eq('updated_at',old.version).select('id,updated_at,configuracoes').maybeSingle():await supabase.from('system_config').insert({id,...payload}).select('id,updated_at,configuracoes').single();
    if(result.error||result.data?.id!==id||!sameConfigSection(result.data.configuracoes,next))throw Error('Gravação não confirmada.');
    rowsBaseline.current[id]={raw:result.data.configuracoes,version:result.data.updated_at};
  };
  const saveAgOnline=async()=>{
    if(adminLock.current||adminFailed||agOnlineLoading)return;
    const invalid=validateOnlineRules(agOnline);if(invalid){toast.error(invalid);return;}
    if(!window.confirm('Salvar as regras gerais de agendamento online?'))return;
    adminLock.current=true;setAgOnlineSaving(true);
    try{await saveAdminRow('config_agendamento_online',agOnline);toast.success('Regras de agendamento online confirmadas.');}
    catch{setAdminFailed(true);toast.error('Gravação não confirmada. Atualize antes de repetir.');}
    finally{adminLock.current=false;setAgOnlineSaving(false);}
  };
  const saveCancelConfig=async()=>{
    if(adminLock.current||adminFailed||cancelLoading)return;
    const invalid=validateCancellationRules(cancelConfig);if(invalid){toast.error(invalid);return;}
    if(!window.confirm('Salvar as regras gerais de cancelamento?'))return;
    adminLock.current=true;setCancelSaving(true);
    try{await saveAdminRow('config_cancelamentos',cancelConfig);toast.success('Regras de cancelamento confirmadas.');}
    catch{setAdminFailed(true);toast.error('Gravação não confirmada. Atualize antes de repetir.');}
    finally{adminLock.current=false;setCancelSaving(false);}
  };

  const persistGoogleStatus=async(connected:boolean)=>{
    await confirmAdmin();const {data,error}=await supabase.from('system_config').select('configuracoes').eq('id','default').maybeSingle();
    if(error||!data)throw Error('Configuração não confirmada.');
    const raw=configObject(data.configuracoes).googleCalendar;
    const next={...googleCalendar,...(raw===undefined?{}:configObject(raw)),conectado:connected};
    if(!sameConfigSection(raw,next))await saveSystemConfigPatch({googleCalendar:next},user?.authUserId,{key:'googleCalendar',value:raw});
    integrationBaseline.current={...integrationBaseline.current,googleCalendar:next};setGoogleSaved(next);
  };
  const loadIntegrations=useCallback(async()=>{
    setIntegrationReady(false);
    try{await confirmAdmin();const {data,error}=await supabase.from('system_config').select('configuracoes').eq('id','default').maybeSingle();
      if(error||!data)throw Error('Consulta não confirmada.');
      const raw=configObject(data.configuracoes);integrationBaseline.current=raw;
      const w={url:'',ativo:false,status:'inativo',...(raw.webhook===undefined?{}:configObject(raw.webhook))} as typeof webhook;
      const mail={ativo:false,email:'',senhaApp:'',smtpHost:'smtp.gmail.com',smtpPort:587,...(raw.gmail===undefined?{}:configObject(raw.gmail))};
      const t={...templates,...(raw.templates===undefined?{}:configObject(raw.templates))};
      setGoogleSaved({...googleCalendar,...(raw.googleCalendar===undefined?{}:configObject(raw.googleCalendar))});
      setWebhookSaved(w);setWebhookUrl(w.url);setWebhookEditing(!w.url);setGmailDraft({...mail,senhaApp:''});setTemplateDraft(t);
      setChannel(raw.canalNotificacao==='gmail'||raw.canalNotificacao==='ambos'?raw.canalNotificacao:'webhook');setIntegrationReady(true);
    }catch{toast.error('Integrações não confirmadas. Atualize antes de editar.');}
  },[confirmAdmin]);
  useEffect(()=>{if(activeTab==='unidades'&&_isGlobalMaster){void loadIntegrations();void gcal.checkStatus();}},[activeTab,_isGlobalMaster,loadIntegrations,gcal.checkStatus]);
  const saveIntegration=async(key:string,build:(old:unknown)=>unknown)=>{
    if(integrationLock.current||!integrationReady)return false;
    integrationLock.current=true;setIntegrationBusy(true);
    try{await confirmAdmin();const old=integrationBaseline.current[key],value=build(old);await saveSystemConfigPatch({[key]:value},user?.authUserId,{key,value:old});integrationBaseline.current={...integrationBaseline.current,[key]:value};return true;}
    catch{setIntegrationReady(false);toast.error('Gravação não confirmada. Recarregue as integrações.');return false;}
    finally{integrationLock.current=false;setIntegrationBusy(false);}
  };
  const updateGoogle=async(data:Partial<typeof googleCalendar>)=>{
    if(await saveIntegration('googleCalendar',old=>({...googleSaved,...(old===undefined?{}:configObject(old)),...data}))){setGoogleSaved(prev=>({...prev,...data}));toast.success('Regra Google Agenda confirmada.');}
  };
  const handleConnectGoogle=async()=>{try{await confirmAdmin();await gcal.connect();}catch{toast.error('Erro ao iniciar conexão.');}};
  const handleDisconnectGoogle=async()=>{
    if(integrationLock.current||gcal.loading||!window.confirm('Desconectar o Google Agenda?'))return;
    try{await confirmAdmin();await gcal.disconnect();await persistGoogleStatus(false);await loadIntegrations();toast.success('Desconexão confirmada.');}
    catch{toast.error('Desconexão ou atualização local não confirmada.');}
  };
  const saveWebhook=async(active:boolean)=>{
    if(active&&!safeIntegrationUrl(webhookUrl.trim())){toast.error('Informe uma URL HTTP/HTTPS válida.');return;}
    if(!window.confirm(active?'Salvar e ativar o webhook?':'Desativar o webhook e remover a URL salva?'))return;
    const next={...webhookSaved,url:active?webhookUrl.trim():'',ativo:active,status:active?'ativo':'inativo'} as typeof webhook;
    if(await saveIntegration('webhook',old=>({...old===undefined?{}:configObject(old),...next}))){setWebhookSaved(next);setWebhookUrl(next.url);setWebhookEditing(!active);toast.success('Configuração do webhook confirmada.');}
  };
  const saveGmail=async()=>{
    if(!gmailDraft.email.trim()||!gmailDraft.smtpHost.trim()||!Number.isSafeInteger(gmailDraft.smtpPort)||gmailDraft.smtpPort<1||gmailDraft.smtpPort>65535){toast.error('Confira e-mail, SMTP e porta.');return;}
    const old=integrationBaseline.current.gmail,stored=old===undefined?{}:configObject(old);
    if(gmailDraft.ativo&&!gmailDraft.senhaApp.trim()&&!stored.senhaApp){toast.error('Informe a senha de aplicativo.');return;}
    if(!window.confirm('Salvar as regras Gmail SMTP? O canal de notificação permanece como está.'))return;
    if(await saveIntegration('gmail',raw=>({...raw===undefined?{}:configObject(raw),...gmailDraft,senhaApp:gmailDraft.senhaApp||stored.senhaApp||''}))){setGmailDraft(d=>({...d,senhaApp:''}));setGmailStatus('idle');setGmailMessage('');toast.success('Gmail salvo. Teste a conexão separadamente.');}
  };

  if (!isMaster) {
    return <Navigate to="/painel/dashboard" replace />;
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'prontuario':
        return <ConfigProntuario />;

      case 'medicamentos':
        return <ConfigMedicamentosExames />;

      case 'impressao':
        return <ConfigImpressaoDocumentos />;

      case 'especialidades':
        return <ConfigEspecialidades />;

      case 'carencia':
        return <ConfigRegrasCarencia />;

      case 'campos':
        return <ConfigPersonalizarCampos />;

      case 'whatsapp':
        return <ConfigWhatsApp />;

      case 'fluxo':
        return (
          <div className="space-y-6">
            <ConfigFluxoAtendimento />
            <Separator />
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <HeartPulse className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold font-display text-foreground">Triagem de Enfermagem — unidade</h3>
                    <p className="text-sm text-muted-foreground">{triageSettingId?(triageScope?"Regra específica da unidade":"Regra global utilizada como fallback"):"Sem regra cadastrada"}</p>
                  </div>
                  {triageLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : triageFailed ? <Button variant="outline" size="sm" onClick={()=>void loadUnitTriage()}>Recarregar regra</Button> : (
                    <Switch checked={triageEnabled} onCheckedChange={saveUnitTriage}/>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Quando habilitada, ao confirmar a chegada do paciente na recepção, ele será encaminhado primeiro para triagem.
                </p>
                {triageEnabled && (
                  <div className="mt-3 p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                    <strong className="text-foreground">Técnicos cadastrados:</strong>{' '}
                    {funcionarios.filter(f => f.role === 'tecnico' && f.ativo).length === 0
                      ? <span className="text-destructive">Nenhum técnico cadastrado.</span>
                      : funcionarios.filter(f => f.role === 'tecnico' && f.ativo).map(f => f.nome).join(', ')
                    }
                  </div>
                )}
              </CardContent>
            </Card>
            <ConfiguracaoTriagem />
            <Separator />
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <SettingsIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold font-display text-foreground">Fila de Espera</h3>
                    <p className="text-sm text-muted-foreground">Modo de encaixe automático</p>
                  </div>
                </div>
                <div>
                  <Label>Modo de Encaixe</Label>
                  <Select value={filaEspera.modoEncaixe} onValueChange={v => updateConfiguracoes({ filaEspera: { modoEncaixe: v as 'automatico' | 'assistido' } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="assistido">Assistido — recepção confirma o encaixe</SelectItem>
                      <SelectItem value="automatico">Automático — sistema encaixa sozinho</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'usuarios':
        return (
          <div className="space-y-6">
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Usuários e operações administrativas</h3><p className="text-xs text-muted-foreground">Acessos, portal e correções assistenciais controladas.</p></div><Badge variant="outline">{_isGlobalMaster?'Master global':'Master da unidade'}</Badge></div>
              <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to="/painel/funcionarios"><Users className="w-4 h-4 mr-2"/>Gerenciar funcionários</Link></Button><Button asChild variant="outline"><Link to="/painel/permissoes"><Shield className="w-4 h-4 mr-2"/>Gerenciar permissões</Link></Button></div>
              <p className="text-xs text-muted-foreground">As páginas de destino mantêm as verificações de acesso existentes.</p>
            </div>
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold font-display text-foreground">Acesso do Paciente ao Portal</h3>
                    <p className="text-sm text-muted-foreground">Controle de acesso e envio de credenciais</p>
                  </div>
                </div>
                {!portalReady&&<div role="status" className="text-sm text-muted-foreground mb-3">Regras do portal não confirmadas. <Button size="sm" variant="outline" onClick={()=>void loadPortal()}>Atualizar portal</Button></div>}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-foreground">Permitir acesso ao portal</span>
                      <p className="text-xs text-muted-foreground">Quando desativado, nenhum paciente acessa o portal</p>
                    </div>
                    <Switch
                      checked={portalReady&&portal.permitirPortal}
                      disabled={!portalReady||portalSaving}
                      onCheckedChange={v=>void savePortal('permitirPortal',v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-foreground">Enviar senha automaticamente por e-mail</span>
                      <p className="text-xs text-muted-foreground">Ao cadastrar paciente, envia login e senha temporária</p>
                    </div>
                    <Switch
                      checked={portalReady&&portal.enviarSenhaAutomaticamente}
                      disabled={!portalReady||portalSaving}
                      onCheckedChange={v=>void savePortal('enviarSenhaAutomaticamente',v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-foreground">Enviar link de acesso ao portal</span>
                      <p className="text-xs text-muted-foreground">Inclui link do portal no e-mail de credenciais</p>
                    </div>
                    <Switch
                      checked={portalReady&&portal.enviarLinkAcesso}
                      disabled={!portalReady||portalSaving}
                      onCheckedChange={v=>void savePortal('enviarLinkAcesso',v)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <PortalQrCodeCard />

            <Separator />

            <Card className="shadow-card border border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
                    <RefreshCw className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <h3 className="font-semibold font-display text-foreground">Reativar Botão "Iniciar Atendimento"</h3>
                    <p className="text-sm text-muted-foreground">Corrige status do agendamento quando o botão foi perdido</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5">Etapa 1</Badge>
                    <Label className="text-[13px] font-bold text-foreground/80">Selecionar Profissional</Label>
                  </div>
                  <Select disabled={reativarLoading||transferLoading} value={reativarProfId} onValueChange={v => { setReativarProfId(v); setReativarAgId(''); buscarAgendamentosReativar(v); }}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Selecione o profissional" /></SelectTrigger>
                    <SelectContent>
                      <div className="px-2 pb-2 pt-1 sticky top-0 bg-popover z-10">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            placeholder="Buscar profissional..."
                            className="h-8 pl-8 text-sm"
                            value={reativarProfSearch}
                            onChange={e => setReativarProfSearch(e.target.value)}
                            onKeyDown={e => e.stopPropagation()}
                          />
                        </div>
                      </div>
                      {profissionaisAtivos
                        .filter(p => !reativarProfSearch || p.nome.toLowerCase().includes(reativarProfSearch.toLowerCase()))
                        .map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.nome} — {p.profissao || p.role}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                {reativarBuscando && <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="w-4 h-4 animate-spin" /> Buscando...</div>}
                {reactivateFailed&&<div role="alert" className="py-2 text-sm text-destructive">Consulta ou operação não confirmada. <Button size="sm" variant="outline" onClick={()=>void buscarAgendamentosReativar(reativarProfId)}>Consultar novamente</Button></div>}
                {reativarProfId && !reactivateFailed && !reativarBuscando && reativarAgendamentos.length === 0 && <p className="text-sm text-muted-foreground py-4">Nenhum agendamento encontrado.</p>}
                {reativarProfId && !reativarBuscando && reativarAgendamentos.length > 0 && (
                  <>
                    <Separator className="my-4" />
                    <div className="space-y-2">
                      <Label className="text-[13px] font-bold text-foreground/80">Selecionar Agendamento</Label>
                      <div className="relative mb-2">
                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Buscar paciente..."
                          className="h-8 pl-8 text-sm"
                          value={reativarPacienteSearch}
                          onChange={e => setReativarPacienteSearch(e.target.value)}
                        />
                      </div>
                      <div className="border rounded-lg overflow-hidden max-h-[200px] overflow-y-auto">
                        <Table>
                          <TableHeader><TableRow className="bg-muted/50"><TableHead className="text-xs">Paciente</TableHead><TableHead className="text-xs w-[90px]">Data</TableHead><TableHead className="text-xs w-[70px]">Hora</TableHead><TableHead className="text-xs w-[90px]">Status</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {reativarAgendamentos.filter(ag => !reativarPacienteSearch || ag.paciente_nome?.toLowerCase().includes(reativarPacienteSearch.toLowerCase())).map(ag => (
                              <TableRow key={ag.id} className={cn("cursor-pointer hover:bg-primary/5", reativarAgId === ag.id && "bg-primary/10")} onClick={()=>{if(!operationLock.current&&!reactivateFailed)setReativarAgId(ag.id);}}>
                                <TableCell className="text-sm py-2">{ag.paciente_nome}</TableCell>
                                <TableCell className="text-sm py-2">{ag.data ? new Date(ag.data + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</TableCell>
                                <TableCell className="text-sm py-2">{ag.hora?.slice(0, 5)}</TableCell>
                                <TableCell className="py-2"><Badge variant="outline" className="text-xs capitalize">{ag.status}</Badge></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </>
                )}
                {reativarAgId && (
                  <div className="mt-4">
                    <Button className="gradient-primary text-primary-foreground w-full" disabled={reativarLoading||transferLoading||reativarBuscando||reactivateFailed} onClick={executarReativar}>
                      {reativarLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                      <RefreshCw className="w-4 h-4 mr-2" /> Reativar Atendimento
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-card border border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <ArrowRightLeft className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold font-display text-foreground">Transferir Paciente de Profissional</h3>
                    <p className="text-sm text-muted-foreground">Reatribui agendamento para outro profissional</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px] font-bold text-foreground/80">Profissional de Origem</Label>
                  <Select disabled={reativarLoading||transferLoading} value={transferProfOrigem} onValueChange={v => { setTransferProfOrigem(v); setTransferAgId(''); setTransferNovoProfId(''); setTransferMotivo(''); buscarAgendamentosTransferir(v); }}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Selecione o profissional atual" /></SelectTrigger>
                    <SelectContent>
                      {profissionaisAtivos.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.nome} — {p.profissao || p.role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {transferBuscando && <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="w-4 h-4 animate-spin" /> Buscando...</div>}
                {transferFailed&&<div role="alert" className="py-2 text-sm text-destructive">Consulta ou operação não confirmada. <Button size="sm" variant="outline" onClick={()=>void buscarAgendamentosTransferir(transferProfOrigem)}>Consultar novamente</Button></div>}
                {transferProfOrigem && !transferFailed && !transferBuscando && transferAgendamentos.length === 0 && <p className="text-sm text-muted-foreground py-4">Nenhum agendamento encontrado.</p>}
                {transferProfOrigem && !transferBuscando && transferAgendamentos.length > 0 && (
                  <>
                    <Separator className="my-4" />
                    <div className="space-y-2">
                      <Label className="text-[13px] font-bold text-foreground/80">Selecionar Agendamento</Label>
                      <div className="border rounded-lg overflow-hidden max-h-[200px] overflow-y-auto">
                        <Table>
                          <TableHeader><TableRow className="bg-muted/50"><TableHead className="text-xs">Paciente</TableHead><TableHead className="text-xs w-[90px]">Data</TableHead><TableHead className="text-xs w-[70px]">Hora</TableHead><TableHead className="text-xs w-[90px]">Status</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {transferAgendamentos.map(ag => (
                              <TableRow key={ag.id} className={cn("cursor-pointer hover:bg-primary/5", transferAgId === ag.id && "bg-primary/10")} onClick={()=>{if(!operationLock.current&&!transferFailed){setTransferAgId(ag.id);setTransferNovoProfId('');setTransferMotivo('');}}}>
                                <TableCell className="text-sm py-2">{ag.paciente_nome}</TableCell>
                                <TableCell className="text-sm py-2">{ag.data ? new Date(ag.data + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</TableCell>
                                <TableCell className="text-sm py-2">{ag.hora?.slice(0, 5)}</TableCell>
                                <TableCell className="py-2"><Badge variant="outline" className="text-xs capitalize">{ag.status}</Badge></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </>
                )}
                {transferAgId && (
                  <div className="mt-4 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-[13px] font-bold text-foreground/80">Novo Profissional</Label>
                      <Select disabled={transferLoading||reativarLoading} value={transferNovoProfId} onValueChange={setTransferNovoProfId}>
                        <SelectTrigger><SelectValue placeholder="Selecione o novo profissional" /></SelectTrigger>
                        <SelectContent>
                          {profissionaisAtivos.filter(p => p.ativo && p.id !== transferProfOrigem).map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.nome} — {p.profissao || p.role}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[13px] font-bold text-foreground/80">Motivo da transferência <span className="text-destructive">*</span></Label>
                      <Input placeholder="Ex: Profissional de férias..." value={transferMotivo} onChange={e => setTransferMotivo(e.target.value)} />
                    </div>
                    <Button className="gradient-primary text-primary-foreground w-full" disabled={!transferNovoProfId || !transferMotivo.trim() || transferLoading||reativarLoading||transferFailed||transferBuscando} onClick={executarTransferencia}>
                      {transferLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                      <ArrowRightLeft className="w-4 h-4 mr-2" /> Transferir Paciente
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Separator />

            <div className="flex flex-wrap gap-2 items-center justify-between"><p role="status" className="text-sm text-muted-foreground">{adminFailed?'Configurações não confirmadas. Edição bloqueada.':agOnlineLoading||cancelLoading?'Consultando regras…':'Regras gerais do portal consultadas'}</p><Button variant="outline" size="sm" disabled={agOnlineSaving||cancelSaving||agOnlineLoading||cancelLoading} onClick={()=>{if(window.confirm('Descartar alterações locais e atualizar as regras?'))void loadAdmin();}}>Atualizar regras</Button></div>
            <fieldset disabled={adminFailed||agOnlineLoading||cancelLoading||agOnlineSaving||cancelSaving} className="space-y-6 min-w-0">
            <Card className="shadow-card border border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                    <Globe className="w-5 h-5 text-success" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold font-display text-foreground">Agendamento Online</h3>
                    <p className="text-sm text-muted-foreground">Regras para agendamento pelo portal</p>
                  </div>
                  {agOnlineLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <Switch checked={agOnline.habilitado} onCheckedChange={v => setAgOnline(prev => ({ ...prev, habilitado: v }))} />
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-bold text-foreground/80">Antecedência mínima (dias)</Label>
                    <Input type="number" min={0} value={agOnline.antecedencia_minima_dias} onChange={e => setAgOnline(prev => ({ ...prev, antecedencia_minima_dias: parseInt(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-bold text-foreground/80">Antecedência máxima (dias)</Label>
                    <Input type="number" min={1} value={agOnline.antecedencia_maxima_dias} onChange={e => setAgOnline(prev => ({ ...prev, antecedencia_maxima_dias: parseInt(e.target.value) || 30 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-bold text-foreground/80">Limite por dia por profissional</Label>
                    <Input type="number" min={1} value={agOnline.limite_por_dia_profissional} onChange={e => setAgOnline(prev => ({ ...prev, limite_por_dia_profissional: parseInt(e.target.value) || 5 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-bold text-foreground/80">Confirmação SMS/WhatsApp</Label>
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm text-muted-foreground">Exigir confirmação</span>
                      <Switch checked={agOnline.exigir_confirmacao_sms} onCheckedChange={v => setAgOnline(prev => ({ ...prev, exigir_confirmacao_sms: v }))} />
                    </div>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <Label className="text-[13px] font-bold text-foreground/80">Profissionais com agendamento bloqueado</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                    {profissionaisAtivos.filter(p => ['profissional', 'master', 'coordenador'].includes(p.role)).map(p => (
                      <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <span className="text-sm truncate">{p.nome}</span>
                        <Switch
                          checked={!agOnline.profissionais_bloqueados.includes(p.id)}
                          onCheckedChange={v => {
                            setAgOnline(prev => ({
                              ...prev,
                              profissionais_bloqueados: v
                                ? prev.profissionais_bloqueados.filter(id => id !== p.id)
                                : [...prev.profissionais_bloqueados, p.id],
                            }));
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <Button className="gradient-primary text-primary-foreground w-full mt-4" disabled={adminFailed||agOnlineLoading||agOnlineSaving||cancelSaving} onClick={saveAgOnline}>
                  {agOnlineSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Salvar Configurações de Agendamento Online
                </Button>
              </CardContent>
            </Card>

            <Card className="shadow-card border border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                    <Ban className="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <h3 className="font-semibold font-display text-foreground">Controle de Cancelamentos</h3>
                    <p className="text-sm text-muted-foreground">Regras e penalidades</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-bold text-foreground/80">Prazo mínimo sem penalidade (h)</Label>
                    <Input type="number" min={0} value={cancelConfig.prazo_minimo_horas} onChange={e => setCancelConfig(prev => ({ ...prev, prazo_minimo_horas: parseInt(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-bold text-foreground/80">Limite cancelamentos/mês</Label>
                    <Input type="number" min={1} value={cancelConfig.limite_cancelamentos_mes} onChange={e => setCancelConfig(prev => ({ ...prev, limite_cancelamentos_mes: parseInt(e.target.value) || 3 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-bold text-foreground/80">Dias de bloqueio</Label>
                    <Input type="number" min={0} value={cancelConfig.dias_bloqueio_apos_limite} onChange={e => setCancelConfig(prev => ({ ...prev, dias_bloqueio_apos_limite: parseInt(e.target.value) || 0 }))} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <span className="text-sm font-medium text-foreground">Notificar profissional</span>
                    </div>
                    <Switch checked={cancelConfig.notificar_profissional} onCheckedChange={v => setCancelConfig(prev => ({ ...prev, notificar_profissional: v }))} />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <span className="text-sm font-medium text-foreground">Liberar vaga automaticamente</span>
                    </div>
                    <Switch checked={cancelConfig.liberar_vaga_automaticamente} onCheckedChange={v => setCancelConfig(prev => ({ ...prev, liberar_vaga_automaticamente: v }))} />
                  </div>
                </div>
                <Separator className="my-4" />
                <div className="space-y-2">
                  <Label className="text-[13px] font-bold text-foreground/80">Motivos de cancelamento</Label>
                  <div className="space-y-1.5">
                    {cancelConfig.motivos.map((motivo, i) => (
                      <div key={`motivo-${motivo}-${i}`} className="flex items-center gap-2">
                        <div className="flex-1 px-3 py-2 bg-muted/50 rounded-lg text-sm">{motivo}</div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/70 hover:text-destructive" onClick={() => {
                          setCancelConfig(prev => ({ ...prev, motivos: prev.motivos.filter((_, idx) => idx !== i) }));
                        }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input placeholder="Novo motivo..." value={novoMotivo} onChange={e => setNovoMotivo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && novoMotivo.trim()) { setCancelConfig(prev => ({ ...prev, motivos: [...prev.motivos, novoMotivo.trim()] })); setNovoMotivo(''); } }} />
                    <Button variant="outline" size="icon" disabled={!novoMotivo.trim()} onClick={() => { setCancelConfig(prev => ({ ...prev, motivos: [...prev.motivos, novoMotivo.trim()] })); setNovoMotivo(''); }}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <Button className="gradient-primary text-primary-foreground w-full mt-4" disabled={adminFailed||cancelLoading||cancelSaving||agOnlineSaving} onClick={saveCancelConfig}>
                  {cancelSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Salvar Regras de Cancelamento
                </Button>
              </CardContent>
            </Card>
            </fieldset>
          </div>
        );

      case 'unidades':
        return (
          <div className="space-y-6">
            <SigtapSyncPanel />
            <GerenciarProcedimentos />
            <VincularSigtapProcedimentos />
            <Separator />
            <h2 className="text-lg font-semibold font-display text-foreground">Integrações</h2>
            <div className="flex flex-wrap items-center justify-between gap-2"><p role="status" className="text-sm text-muted-foreground">{integrationReady?'Configurações consultadas':'Consulta não confirmada'}</p><Button variant="outline" size="sm" disabled={integrationBusy||gmailTesting||webhookTesting} onClick={()=>{if(window.confirm('Atualizar e descartar rascunhos?'))void loadIntegrations();}}>Atualizar integrações</Button></div>
            <fieldset disabled={!integrationReady||integrationBusy||gmailTesting||webhookTesting} className="space-y-6 min-w-0">

            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Calendar className="w-5 h-5 text-primary" /></div>
                  <div className="flex-1"><h3 className="font-semibold font-display text-foreground">Google Agenda</h3><p className="text-sm text-muted-foreground">Sincronizar agendamentos</p></div>
                  {gcal.statusConfirmed && gcal.connected ? <span className="flex items-center gap-1 text-xs bg-success/10 text-success px-2 py-1 rounded-full font-medium"><CheckCircle2 className="w-3 h-3" /> Conectado</span> : <span className="flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full font-medium"><XCircle className="w-3 h-3" /> {gcal.statusConfirmed?'Desconectado':'Não confirmado'}</span>}
                </div>
                <div className="space-y-4">
                  {gcal.statusConfirmed && gcal.connected ? (
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={handleConnectGoogle} disabled={gcal.loading}>{gcal.loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Reconectar</Button>
                      <Button variant="destructive" className="flex-1" onClick={handleDisconnectGoogle} disabled={gcal.loading}>Desconectar</Button>
                    </div>
                  ) : (
                    <Button variant="outline" className="w-full" onClick={handleConnectGoogle} disabled={gcal.loading}>{gcal.loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Conectar Google Agenda</Button>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50"><span className="text-sm text-muted-foreground">Criar evento</span><Switch checked={googleSaved.criarEvento} onCheckedChange={v => updateGoogle({ criarEvento: v })} /></div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50"><span className="text-sm text-muted-foreground">Atualizar ao remarcar</span><Switch checked={googleSaved.atualizarRemarcar} onCheckedChange={v => updateGoogle({ atualizarRemarcar: v })} /></div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50"><span className="text-sm text-muted-foreground">Remover ao cancelar</span><Switch checked={googleSaved.removerCancelar} onCheckedChange={v => updateGoogle({ removerCancelar: v })} /></div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50"><span className="text-sm text-muted-foreground">Comprovante e-mail</span><Switch checked={googleSaved.enviarEmail} onCheckedChange={v => updateGoogle({ enviarEmail: v })} /></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center"><Webhook className="w-5 h-5 text-accent-foreground" /></div>
                  <div className="flex-1"><h3 className="font-semibold font-display text-foreground">Webhook Make.com</h3><p className="text-sm text-muted-foreground">Automações via webhook</p></div>
                  <Badge variant={webhookSaved.status === 'ativo' ? 'default' : webhookSaved.status === 'erro' ? 'destructive' : 'secondary'} className="capitalize">{webhookSaved.status === 'ativo' ? '✅ Ativo' : webhookSaved.status === 'erro' ? '❌ Erro' : '⏸ Inativo'}</Badge>
                </div>
                <div className="space-y-4">
                  <div><Label>URL do Webhook</Label><div className="flex gap-2 mt-1"><Input type={webhookEditing?'text':'password'} placeholder="https://hook.us2.make.com/..." value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} disabled={!webhookEditing} className="flex-1" />{!webhookEditing && <Button variant="outline" size="icon" onClick={() => setWebhookEditing(true)}><Pencil className="w-4 h-4" /></Button>}</div></div>
                  <div className="flex gap-2">
                    <Button className="gradient-primary text-primary-foreground flex-1" disabled={!webhookUrl.trim()||integrationBusy} onClick={()=>void saveWebhook(true)}>Salvar Webhook</Button>
                    <Button variant="outline" disabled={!webhookSaved.url || webhookTesting||webhookEditing||webhookUrl!==webhookSaved.url} onClick={async () => {
                      if(!window.confirm('Enviar dados fictícios ao webhook salvo?'))return;
                      setWebhookTesting(true);
                      try {
                        const { data, error } = await supabase.functions.invoke('webhook-notify', { body: { evento: 'teste', paciente_nome: 'Teste do Sistema', telefone: '(00) 00000-0000', email: 'teste@teste.com', data_consulta: new Date().toLocaleDateString('pt-BR'), hora_consulta: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), unidade: 'Unidade Teste', profissional: 'Profissional Teste', tipo_atendimento: 'Teste de Webhook', status_agendamento: 'teste', id_agendamento: 'teste-' + Date.now() } });
                        if (error||!explicitSuccess(data)) throw Error('Teste não confirmado.');
                        toast.success('Webhook testado com sucesso!');
                      } catch { toast.error('Teste de webhook não confirmado.'); } finally { setWebhookTesting(false); }
                    }}>{webhookTesting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}Testar</Button>
                  </div>
                  {webhookSaved.ativo && <Button variant="ghost" className="w-full text-destructive" onClick={()=>void saveWebhook(false)}>Desativar Webhook</Button>}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center"><Mail className="w-5 h-5 text-destructive" /></div>
                  <div className="flex-1"><h3 className="font-semibold font-display text-foreground">Gmail SMTP</h3><p className="text-sm text-muted-foreground">Envio de e-mails</p></div>
                  <Switch checked={gmailDraft.ativo} onCheckedChange={v=>setGmailDraft(d=>({...d,ativo:v}))} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><Label>E-mail remetente</Label><Input placeholder="seuemail@gmail.com" value={gmailDraft.email} onChange={e=>setGmailDraft(d=>({...d,email:e.target.value}))} /></div>
                  <div><Label>Senha de Aplicativo</Label><Input type="password" placeholder="Em branco mantém a senha salva" value={gmailDraft.senhaApp} onChange={e=>setGmailDraft(d=>({...d,senhaApp:e.target.value}))} /></div>
                  <div><Label>Servidor SMTP</Label><Input value={gmailDraft.smtpHost} onChange={e=>setGmailDraft(d=>({...d,smtpHost:e.target.value}))} /></div>
                  <div><Label>Porta</Label><Input type="number" value={gmailDraft.smtpPort} onChange={e=>setGmailDraft(d=>({...d,smtpPort:Number(e.target.value)}))} /></div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button className="gradient-primary text-primary-foreground flex-1" disabled={integrationBusy} onClick={()=>void saveGmail()}>
                    {gmailTesting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Salvar Gmail
                  </Button>
                  <Button variant="outline" disabled={gmailTesting||integrationBusy} onClick={async () => {
                    if(!window.confirm('Testar a configuração SMTP SALVA, não os rascunhos?'))return;
                    setGmailTesting(true); setGmailMessage('');
                    const result = await testGmail();
                    setGmailStatus(result.status as any); setGmailMessage(result.message); setGmailTesting(false);
                    if (result.success) toast.success('Teste SMTP confirmado pelo serviço.'); else toast.error(`Falha: ${result.message}`);
                  }}>
                    {gmailTesting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}Testar
                  </Button>
                </div>
                {gmailMessage && <div className={`mt-4 p-3 rounded-lg text-sm flex items-start gap-2 ${gmailStatus === 'conectado' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>{gmailStatus === 'conectado' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}<span>{gmailMessage}</span></div>}
              </CardContent>
            </Card>

            <Separator />
            <h2 className="text-lg font-semibold font-display text-foreground">Notificações</h2>
            <Card className="shadow-card border-0 ring-2 ring-primary/20">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Send className="w-5 h-5 text-primary" /></div>
                  <div><h3 className="font-semibold font-display text-foreground">Canal de Notificação ao Paciente</h3><p className="text-sm text-muted-foreground">Define como o paciente recebe notificações</p></div>
                </div>
                <Select value={channel} disabled={integrationBusy} onValueChange={async v=>{if((v==='webhook'||v==='gmail'||v==='ambos')&&window.confirm('Alterar o canal de notificação?')&&await saveIntegration('canalNotificacao',()=>v))setChannel(v);}}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="webhook">Apenas Webhook</SelectItem>
                    <SelectItem value="gmail">Apenas Gmail SMTP</SelectItem>
                    <SelectItem value="ambos">Ambos (Webhook + Gmail)</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center"><MessageSquare className="w-5 h-5 text-warning" /></div>
                  <div><h3 className="font-semibold font-display text-foreground">Templates de Mensagem</h3><p className="text-sm text-muted-foreground">Personalizar mensagens automáticas</p></div>
                </div>
                <div className="space-y-3">
                  <div><Label>Confirmação</Label><textarea className="w-full border rounded-lg p-3 text-sm bg-background text-foreground min-h-[80px] border-border" value={templateDraft.confirmacao} onChange={e=>setTemplateDraft(t=>({...t,confirmacao:e.target.value}))} /></div>
                  <div><Label>Lembrete</Label><textarea className="w-full border rounded-lg p-3 text-sm bg-background text-foreground min-h-[80px] border-border" value={templateDraft.lembrete} onChange={e=>setTemplateDraft(t=>({...t,lembrete:e.target.value}))} /></div>
                  <p className="text-xs text-muted-foreground">Variáveis: {'{nome}'}, {'{data}'}, {'{hora}'}, {'{unidade}'}, {'{endereco}'}, {'{profissional}'}, {'{setor}'}</p>
                  <Button className="gradient-primary text-primary-foreground" onClick={async()=>{if(await saveIntegration('templates',old=>({...old===undefined?{}:configObject(old),...templateDraft})))toast.success('Templates confirmados.');}}>Salvar Templates</Button>
                </div>
              </CardContent>
            </Card>
            </fieldset>
          </div>
        );


      case 'integracoes':
        return <ConfigSistemasIntegrados />;

      case 'sistema':
        return <ConfigSistema />;

      default:
        return null;
    }
  };

  return (
    <div className="animate-fade-in space-y-4">
      <header className="rounded-2xl border bg-card p-4 sm:p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><SettingsIcon className="w-5 h-5" aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Administração do sistema</p>
              <h1 className="text-xl sm:text-2xl font-bold font-display text-foreground">Configurações do Sistema</h1>
            </div>
          </div>
          <Badge variant="outline" className="gap-1.5"><Shield className="w-3.5 h-3.5" aria-hidden="true" />{_isGlobalMaster ? 'Master global' : 'Perfil Master'}</Badge>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Gerencie as configurações e regras existentes. As alterações seguem o mecanismo de salvamento de cada seção.</p>
      </header>

      <div className="flex flex-col lg:flex-row gap-4 items-start min-h-[70vh]">
        <div className="w-full lg:w-auto lg:shrink-0 lg:self-stretch">
          <ConfigNavigation activeTab={activeTab} onSelect={setActiveTab} isGlobalMaster={_isGlobalMaster} />
        </div>

        <main className="w-full flex-1 min-w-0 space-y-4" aria-labelledby="config-active-title">
          <div className="rounded-xl border bg-card px-4 py-3 sm:px-5 shadow-sm">
            <p className="text-xs text-muted-foreground">{activeGroup.label}</p>
            <h2 id="config-active-title" className="text-lg font-semibold font-display text-foreground">{activeSection.label}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{activeSection.description}</p>
          </div>
          <ScrollArea className="h-full">
            <Suspense fallback={<div role="status" className="flex items-center justify-center gap-2 rounded-xl border bg-card py-12 text-sm text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> Carregando seção...</div>}>
              {renderTabContent()}
            </Suspense>
          </ScrollArea>
        </main>
      </div>
    </div>
  );
};

export default Configuracoes;
