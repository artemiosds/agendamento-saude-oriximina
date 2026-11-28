import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOperacional } from '@/contexts/OperacionalContext';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MessageSquare, Send, Loader2, CheckCircle2, XCircle, AlertCircle,
  RefreshCw, Eye, RotateCcw, Clock, Calendar, Bell, Settings,
  Smartphone, FileText, Zap, Shield
} from 'lucide-react';
import ConfigWhatsAppAntiBan from './ConfigWhatsAppAntiBan';
import ConfigWhatsAppEvents from './ConfigWhatsAppEvents';
import QueueTable from './whatsapp/QueueTable';
import InboxPanel from './whatsapp/InboxPanel';
import HealthDashboard from './whatsapp/HealthDashboard';
import WebhookUrlCard from './whatsapp/WebhookUrlCard';
import { whatsappService, uazapigoService } from '@/services/whatsappService';
import { toast } from 'sonner';
import type {Tables,TablesUpdate,Json} from '@/integrations/supabase/types';
import {configObject} from '@/lib/configSectionGuard';
import {confirmedCounts,validReminderHours,providerFunction,confirmedProcessing,nextVersion} from '@/lib/adminWhatsApp';

const TEMPLATE_TYPES = [
  { tipo: 'confirmacao', label: 'Agendamento Criado', icon: '✅', description: 'Quando um agendamento é criado' },
  { tipo: 'lembrete_24h', label: 'Lembrete 24h', icon: '⏰', description: 'Lembrete automático 24h antes' },
  { tipo: 'lembrete_2h', label: 'Lembrete 2h', icon: '🔔', description: 'Lembrete automático 2h antes' },
  { tipo: 'cancelamento', label: 'Cancelamento', icon: '❌', description: 'Quando um agendamento é cancelado' },
  { tipo: 'remarcacao', label: 'Remarcação', icon: '🔄', description: 'Quando um agendamento é remarcado' },
  { tipo: 'falta', label: 'Falta', icon: '⚠️', description: 'Quando o paciente falta' },
  { tipo: 'lista_espera', label: 'Lista de Espera', icon: '📋', description: 'Quando o paciente entra na lista' },
  { tipo: 'vaga_disponivel', label: 'Vaga Disponível', icon: '🎯', description: 'Quando uma vaga abre na lista' },
] as const;

const DEFAULT_TEMPLATES: Record<string, string> = {
  confirmacao: `Olá, *{{nome}}*! 👋\n\nSeu atendimento foi agendado com sucesso.\n\n📍 Unidade: {{unidade}}\n👨‍⚕️ Profissional: *{{profissional}}*\n📅 Data: {{data}}\n⏰ Horário: {{hora}}\n\nChegue com antecedência.\n\n_Secretaria Municipal de Saúde_`,
  lembrete_24h: `Olá, *{{nome}}*! 👋\n\nLembrete do seu atendimento amanhã:\n\n📍 Unidade: {{unidade}}\n👨‍⚕️ Profissional: *{{profissional}}*\n📅 {{data}}\n⏰ {{hora}}\n\nContamos com sua presença.\n\n_Secretaria Municipal de Saúde_`,
  lembrete_2h: `Olá, *{{nome}}*! 👋\n\nSeu atendimento é hoje:\n\n📍 Unidade: {{unidade}}\n👨‍⚕️ Profissional: *{{profissional}}*\n⏰ {{hora}}\n\nAguardamos você.\n\n_Secretaria Municipal de Saúde_`,
  cancelamento: `Olá, *{{nome}}*.\n\nSeu atendimento foi cancelado.\n\n📍 Unidade: {{unidade}}\n👨‍⚕️ Profissional: *{{profissional}}*\n📅 {{data}}\n⏰ {{hora}}\n\n_Secretaria Municipal de Saúde_`,
  remarcacao: `Olá, *{{nome}}*! 👋\n\nSeu atendimento foi remarcado:\n\n📍 Unidade: {{unidade}}\n👨‍⚕️ Profissional: *{{profissional}}*\n📅 {{data}}\n⏰ {{hora}}\n\n_Secretaria Municipal de Saúde_`,
  falta: `Olá, *{{nome}}*.\n\nRegistramos sua ausência:\n\n📍 Unidade: {{unidade}}\n👨‍⚕️ Profissional: *{{profissional}}*\n📅 {{data}}\n⏰ {{hora}}\n\nProcure a unidade para reagendar.\n\n_Secretaria Municipal de Saúde_`,
  lista_espera: `Olá, *{{nome}}*! 👋\n\nVocê está na lista de espera para:\n\n👨‍⚕️ *{{profissional}}*\n📍 {{unidade}}\n\nAguardando disponibilidade.\n\n_Secretaria Municipal de Saúde_`,
  vaga_disponivel: `Olá, *{{nome}}*! 👋\n\nTemos vaga disponível:\n\n👨‍⚕️ *{{profissional}}*\n📍 {{unidade}}\n\nProcure a unidade para confirmação.\n\n_Secretaria Municipal de Saúde_`,
};

const VARIABLES = [
  { key: '{{nome}}', label: 'Nome do paciente' },
  { key: '{{unidade}}', label: 'Nome da unidade' },
  { key: '{{profissional}}', label: 'Nome do profissional' },
  { key: '{{data}}', label: 'Data da consulta' },
  { key: '{{hora}}', label: 'Horário da consulta' },
];

interface TemplateRow {
  id?: string;
  unidade_id: string;
  tipo: string;
  mensagem: string;
  ativo: boolean;
}

interface NotifLog {
  id: string;
  evento: string;
  canal: string;
  destinatario_telefone: string;
  status: string;
  erro: string | null;
  criado_em: string;
  agendamento_id: string | null;
  resposta: string | null;
}

const ConfigWhatsApp: React.FC = () => {
  const { user } = useAuth();
  const { unidades, configuracoes, updateConfiguracoes } = useOperacional();
  const { whatsapp } = configuracoes;

  const userUnitId = user?.unidadeId || '';
  const [connectionFailed,setConnectionFailed]=useState(false);
  const [connectionBusy,setConnectionBusy]=useState(false);
  const connectionLock=useRef(false);
  const baseline=useRef<Tables<'clinica_config'>|null>(null);
  const reminderBaseline=useRef<{raw:unknown;version:string|null}|null>(null);
  const [reminderReady,setReminderReady]=useState(false);
  const [reminderSaving,setReminderSaving]=useState(false);
  const reminderLock=useRef(false);
  const [templatesFailed,setTemplatesFailed]=useState(false);
  const templateLock=useRef(false);
  const templateRequest=useRef(0),templateScope=useRef(''),logRequest=useRef(0);
  const [statsReady,setStatsReady]=useState(false);
  const [logsFailed,setLogsFailed]=useState(false);
  const actionLock=useRef(false);
  const [actionBusy,setActionBusy]=useState(false);
  const confirmSession=useCallback(async()=>{const {data,error}=await supabase.auth.getSession();if(error||!user?.authUserId||user.role!=='master'||user.ativo!==true||data.session?.user.id!==user.authUserId)throw Error('Sessão administrativa não confirmada.');},[user?.authUserId,user?.role,user?.ativo]);
  const evolutionDiagnostic=useCallback(async(action:'status'|'instances')=>supabase.functions.invoke('send-whatsapp-evolution',{body:{action}}),[]);

  // Evolution API config
  const [evolutionConfig, setEvolutionConfig] = useState({
    nome_clinica: '', logo_url: '', telefone: '',
    evolution_base_url: 'https://api.agendamento-saude-sms-oriximina.site',
    evolution_api_key: '', evolution_instance_name: '',
  });
  const [evolutionConfigId, setEvolutionConfigId] = useState<string | null>(null);
  const [evolutionInstances, setEvolutionInstances] = useState<{ instanceName: string; state: string }[]>([]);
  const [evolutionLoading, setEvolutionLoading] = useState(true);
  const [evolutionSaving, setEvolutionSaving] = useState(false);
  const [evolutionTesting, setEvolutionTesting] = useState(false);
  const [evolutionStatus, setEvolutionStatus] = useState<'idle' | 'connected' | 'disconnected' | 'error' | 'qrcode' | 'connecting'>('idle');
  const [statusDetail, setStatusDetail] = useState<{
    last_check_at?: string;
    last_connected_at?: string;
    last_disconnected_at?: string;
    last_success_send_at?: string;
    last_error?: string;
  }>({});
  const [apiKeyMasked, setApiKeyMasked] = useState(true);
  const [originalApiKey, setOriginalApiKey] = useState('');
  // Métricas da fila
  const [queueStats, setQueueStats] = useState({
    pendentes: 0, enviadas_24h: 0, falhas_24h: 0, expiradas_24h: 0, processando: 0,
  });
  const [reprocessing, setReprocessing] = useState(false);

  // Provedor ativo
  const [activeProvider, setActiveProvider] = useState<'evolution' | 'uazapigo'>('evolution');

  // UazapiGO config
  const [uazConfig, setUazConfig] = useState({
    uazapi_server_url: 'https://free.uazapi.com',
    uazapi_admin_token: '',
    uazapi_instance: '',
    uazapi_ativo: false,
  });
  const [uazTokenMasked, setUazTokenMasked] = useState(true);
  const [originalUazToken, setOriginalUazToken] = useState('');
  const [uazSaving, setUazSaving] = useState(false);
  const [uazTesting, setUazTesting] = useState(false);
  const [uazCreating, setUazCreating] = useState(false);
  const [uazStatus, setUazStatus] = useState<'idle' | 'connected' | 'disconnected' | 'error' | 'qrcode' | 'connecting' | 'no_instance'>('idle');

  // Templates
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('confirmacao');
  const [editingMessage, setEditingMessage] = useState('');
  const [templateSaving, setTemplateSaving] = useState(false);

  // Reminder config
  const [horasLembrete1, setHorasLembrete1] = useState(24);
  const [horasLembrete2, setHorasLembrete2] = useState(2);

  // Logs
  const [logs, setLogs] = useState<NotifLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsFilter, setLogsFilter] = useState('todos');

  // Test
  const [testPhone, setTestPhone] = useState('');

  // Active tab
  const [activeSubTab, setActiveSubTab] = useState('conexao');

  // Load Evolution config
  const loadConnection=useCallback(async()=>{
      setEvolutionLoading(true);setConnectionFailed(false);setReminderReady(false);baseline.current=null;reminderBaseline.current=null;setEvolutionStatus('idle');setUazStatus('idle');
      try {
        await confirmSession();
        const { data,error } = await supabase.from('clinica_config').select('*').maybeSingle();
        if(error||!data)throw Error('Configuração da conexão não confirmada.');
        baseline.current=data;
        if (data) {
          setEvolutionConfigId(data.id);
          const apiKey = data.evolution_api_key || '';
          setOriginalApiKey(apiKey);
          setEvolutionConfig({
            nome_clinica: data.nome_clinica || '',
            logo_url: data.logo_url || '',
            telefone: data.telefone || '',
            evolution_base_url: data.evolution_base_url || 'https://api.agendamento-saude-sms-oriximina.site',
            evolution_api_key: '',
            evolution_instance_name: data.evolution_instance_name || '',
          });
          if (data.evolution_instance_name && apiKey) {
            const [{ data: statusData }, { data: instancesData }] = await Promise.all([
              evolutionDiagnostic('status'),
              evolutionDiagnostic('instances'),
            ]);
            if (statusData) {
              const detailed = (statusData as any).status_detailed;
              if (detailed === 'conectado') setEvolutionStatus('connected');
              else if (detailed === 'qrcode_necessario') setEvolutionStatus('qrcode');
              else if (detailed === 'conectando') setEvolutionStatus('connecting');
              else if (statusData.success) setEvolutionStatus('disconnected');
              else setEvolutionStatus('error');
            }
            if (instancesData?.instances) setEvolutionInstances(instancesData.instances);

            // Carrega último status persistido (last_check_at, etc)
            const { data: persisted } = await supabase
              .from('whatsapp_connection_status' as any)
              .select('*')
              .eq('instance_name', data.evolution_instance_name)
              .maybeSingle();
            if (persisted) setStatusDetail(persisted as any);
          }

          // UazapiGO
          const uazTok = (data as any).uazapi_admin_token || '';
          setOriginalUazToken(uazTok);
          setUazConfig({
            uazapi_server_url: (data as any).uazapi_server_url || 'https://free.uazapi.com',
            uazapi_admin_token: '',
            uazapi_instance: (data as any).uazapi_instance || '',
            uazapi_ativo: !!(data as any).uazapi_ativo,
          });
          setActiveProvider(((data as any).whatsapp_provider_active === 'uazapigo') ? 'uazapigo' : 'evolution');
          if (!(data as any).uazapi_instance) setUazStatus('no_instance');
        }

        // Load reminder hours from system_config
        const { data: sysData,error:sysError } = await supabase.from('system_config').select('configuracoes,updated_at').eq('id', 'config_whatsapp').maybeSingle();
        if(!sysError){reminderBaseline.current={raw:sysData?.configuracoes,version:sysData?.updated_at??null};setReminderReady(true);}
        if (sysData?.configuracoes) {
          const cfg = sysData.configuracoes as any;
          if (cfg.horas_lembrete_1) setHorasLembrete1(cfg.horas_lembrete_1);
          if (cfg.horas_lembrete_2) setHorasLembrete2(cfg.horas_lembrete_2);
        }
      } catch {setConnectionFailed(true);}
      finally{setEvolutionLoading(false);}
  }, [confirmSession,evolutionDiagnostic]);
  useEffect(()=>{void loadConnection();},[loadConnection]);

  // Carrega métricas da fila quando aba Logs ou Conexão é aberta
  const loadQueueStats = useCallback(async () => {
    setStatsReady(false);
    try {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const results = await Promise.all([
        supabase.from('whatsapp_queue' as any).select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
        supabase.from('whatsapp_queue' as any).select('id', { count: 'exact', head: true }).eq('status', 'enviado').gte('processado_em', dayAgo),
        supabase.from('whatsapp_queue' as any).select('id', { count: 'exact', head: true }).eq('status', 'erro').gte('processado_em', dayAgo),
        supabase.from('whatsapp_queue' as any).select('id', { count: 'exact', head: true }).eq('status', 'bloqueado').gte('processado_em', dayAgo),
        supabase.from('whatsapp_queue' as any).select('id', { count: 'exact', head: true }).eq('status', 'processando'),
      ]);
      const counts=confirmedCounts(results);if(!counts)return;
      const [pendentes,enviadas,falhas,expiradas,processando]=counts;
      setQueueStats({pendentes,enviadas_24h:enviadas,falhas_24h:falhas,expiradas_24h:expiradas,processando});setStatsReady(true);
    } catch {}
  }, []);

  useEffect(() => { loadQueueStats(); }, [loadQueueStats]);

  // Load templates
  const loadTemplates = useCallback(async () => {
    if(templateLock.current)return;
    const request=++templateRequest.current;
    templateScope.current='';setTemplatesLoading(true);setTemplatesFailed(false);
    try {
      await confirmSession();
      if(!userUnitId)throw Error('Unidade não confirmada.');
      const {data,error}=await supabase.from('whatsapp_templates').select('id,unidade_id,tipo,mensagem,ativo').eq('unidade_id',userUnitId).order('tipo');
      if(error||!data)throw Error('Consulta não confirmada.');
      if(request!==templateRequest.current)return;
      setTemplates(data);templateScope.current=JSON.stringify([user?.authUserId,userUnitId]);
    }catch{if(request===templateRequest.current)setTemplatesFailed(true);}
    finally{if(request===templateRequest.current)setTemplatesLoading(false);}
  },[confirmSession,user?.authUserId,userUnitId]);
  useEffect(()=>{if((activeSubTab==='mensagens'||activeSubTab==='eventos')&&templateScope.current!==JSON.stringify([user?.authUserId,userUnitId]))void loadTemplates();},[activeSubTab,user?.authUserId,userUnitId,loadTemplates]);
  useEffect(()=>()=>{templateRequest.current++;logRequest.current++;},[user?.authUserId,userUnitId]);

  const currentTemplate=templates.find(t=>t.tipo===selectedTemplate&&t.unidade_id===userUnitId);
  const confirmedMessage=currentTemplate?.mensagem??DEFAULT_TEMPLATES[selectedTemplate]??'';
  useEffect(()=>{setEditingMessage(confirmedMessage);},[confirmedMessage,selectedTemplate,userUnitId]);
  const isTemplateActive=()=>currentTemplate?.ativo??true;
  const writeTemplate=async(tipo:string,patch:{mensagem?:string;ativo?:boolean})=>{
    if(templateLock.current||templatesLoading||templatesFailed||!userUnitId||templateScope.current!==JSON.stringify([user?.authUserId,userUnitId]))return;
    templateLock.current=true;setTemplateSaving(true);
    try{
      await confirmSession();
      const existing=templates.find(t=>t.tipo===tipo&&t.unidade_id===userUnitId);
      const {data:actual,error:readError}=await supabase.from('whatsapp_templates').select('id,mensagem,ativo').eq('unidade_id',userUnitId).eq('tipo',tipo).maybeSingle();
      if(readError||actual?.id!==existing?.id||(actual&&(actual.mensagem!==existing?.mensagem||actual.ativo!==existing?.ativo)))throw Error('Modelo alterado. Recarregue.');
      const result=actual?await supabase.from('whatsapp_templates').update({...patch,updated_at:new Date().toISOString()}).eq('id',actual.id).eq('unidade_id',userUnitId).eq('mensagem',actual.mensagem).eq('ativo',actual.ativo).select('id,unidade_id,tipo,mensagem,ativo').maybeSingle():await supabase.from('whatsapp_templates').insert({unidade_id:userUnitId,tipo,mensagem:DEFAULT_TEMPLATES[tipo]||'',ativo:true,...patch}).select('id,unidade_id,tipo,mensagem,ativo').single();
      if(result.error||!result.data)throw Error('Gravação não confirmada.');
      const saved=result.data;setTemplates(prev=>[...prev.filter(t=>t.id!==saved.id),saved]);toast.success('Configuração de mensagem confirmada.');
    }catch{setTemplatesFailed(true);toast.error('Gravação não confirmada. Atualize os modelos antes de repetir.');}
    finally{templateLock.current=false;setTemplateSaving(false);}
  };
  const saveTemplate=()=>{if(!editingMessage.trim()){toast.error('Informe a mensagem.');return;}void writeTemplate(selectedTemplate,{mensagem:editingMessage});};
  const toggleTemplate=(tipo:string)=>{const existing=templates.find(t=>t.tipo===tipo&&t.unidade_id===userUnitId);void writeTemplate(tipo,{ativo:!(existing?.ativo??true)});};

  const resetToDefault = () => {
    setEditingMessage(DEFAULT_TEMPLATES[selectedTemplate] || '');
  };

  // Preview
  const previewMessage = editingMessage
    .replace(/\{\{nome\}\}/g, 'João da Silva')
    .replace(/\{\{unidade\}\}/g, 'Centro de Reabilitação')
    .replace(/\{\{profissional\}\}/g, 'Dr. Maria Santos')
    .replace(/\{\{data\}\}/g, '20/04/2026')
    .replace(/\{\{hora\}\}/g, '14:00');


  const writeConnection=async(patch:TablesUpdate<'clinica_config'>)=>{
    if(connectionLock.current||actionLock.current||connectionFailed||!baseline.current)throw Error('Configuração não confirmada.');
    connectionLock.current=true;setConnectionBusy(true);
    try{await confirmSession();const old=baseline.current;const {data,error}=await supabase.from('clinica_config').update({...patch,updated_at:nextVersion(old.updated_at)}).eq('id',old.id).eq('updated_at',old.updated_at).select('*').maybeSingle();if(error||!data)throw Error('Gravação não confirmada.');baseline.current=data;return data;}
    catch(error){setConnectionFailed(true);throw error;}
    finally{connectionLock.current=false;setConnectionBusy(false);}
  };
  // Save Evolution config
  const saveEvolutionConfig = async () => {
    if(connectionLock.current||connectionFailed||!window.confirm('Salvar configuração da Evolution API?'))return;
    setEvolutionSaving(true);
    try {
      const baseUrl = (evolutionConfig.evolution_base_url || '').replace(/\/+$/, '');
      if (!baseUrl) { toast.error('Base URL é obrigatória'); setEvolutionSaving(false); return; }
      if (!evolutionConfig.evolution_instance_name) { toast.error('Instância é obrigatória'); setEvolutionSaving(false); return; }
      const apiKeyToSave = evolutionConfig.evolution_api_key || originalApiKey;
      if (!apiKeyToSave) { toast.error('API Key é obrigatória'); setEvolutionSaving(false); return; }

      const payload = {
        evolution_base_url: baseUrl,
        evolution_api_key: apiKeyToSave,
        evolution_instance_name: evolutionConfig.evolution_instance_name,
        updated_at: new Date().toISOString()
      };
      
      await writeConnection(payload);
      
      setEvolutionConfig(p=>({...p,evolution_api_key:'',evolution_base_url:baseUrl}));setEvolutionStatus('idle');setOriginalApiKey(apiKeyToSave);
      setApiKeyMasked(true);
      toast.success('Configurações da Evolution API salvas!');
    } catch { toast.error('Gravação não confirmada. Atualize a conexão.'); }
    setEvolutionSaving(false);
  };

  const checkConnection = async () => {
    if(actionLock.current||connectionLock.current||connectionFailed||connectionBusy||!baseline.current)return;
    if(evolutionConfig.evolution_instance_name!==baseline.current.evolution_instance_name||evolutionConfig.evolution_base_url!==baseline.current.evolution_base_url||!apiKeyMasked){toast.error('Salve as alterações antes de verificar.');return;}
    if (!evolutionConfig.evolution_instance_name || !originalApiKey) {
      toast.error('Configure a instância e API Key primeiro.');
      return;
    }
    actionLock.current=true;setActionBusy(true);
    try {
      await confirmSession();
      const [{ data: statusData, error: statusError }, { data: instancesData }] = await Promise.all([
        evolutionDiagnostic('status'),
        evolutionDiagnostic('instances'),
      ]);
      if (statusError) throw statusError;
      if (instancesData?.instances) setEvolutionInstances(instancesData.instances);

      const detailed = (statusData as any)?.status_detailed;
      const errorMsg = statusData?.error;

      // Atualiza painel de detalhes
      setStatusDetail(prev => ({
        ...prev,
        last_check_at: new Date().toISOString(),
        last_error: errorMsg ? 'Diagnóstico retornou erro. Confira o provedor.' : '',
      }));

      switch (detailed) {
        case 'conectado':
          setEvolutionStatus('connected');
          toast.success('✅ Instância conectada!');
          break;
        case 'qrcode_necessario':
          setEvolutionStatus('qrcode');
          toast.warning('📱 QR Code necessário. Escaneie no painel da Evolution API.');
          break;
        case 'conectando':
          setEvolutionStatus('connecting');
          toast.info('🔄 Conectando...');
          break;
        case 'desconectado':
          setEvolutionStatus('disconnected');
          toast.warning('Instância desconectada. Reconecte no painel da Evolution.');
          break;
        case 'api_key_invalida':
          setEvolutionStatus('error');
          toast.error('❌ API Key inválida');
          break;
        case 'instancia_inexistente':
          setEvolutionStatus('error');
          toast.error('❌ Instância não encontrada');
          break;
        case 'base_url_inacessivel':
          setEvolutionStatus('error');
          toast.error('❌ Base URL inacessível');
          break;
        default:
          setEvolutionStatus('error');
          toast.error('Erro ao verificar conexão. Confira a instância salva.');
      }

      // Recarrega métricas e status persistido
      loadQueueStats();
      const { data: persisted } = await supabase
        .from('whatsapp_connection_status' as any)
        .select('*')
        .eq('instance_name', evolutionConfig.evolution_instance_name)
        .maybeSingle();
      if (persisted) setStatusDetail(persisted as any);
    } catch { setEvolutionStatus('error'); toast.error('Não foi possível conectar.'); }
    finally{actionLock.current=false;setActionBusy(false);}
  };

  const reprocessQueue = async () => {
    if(actionLock.current||!window.confirm('Processar a fila agora? Poderá disparar mensagens reais elegíveis.'))return;
    actionLock.current=true;setActionBusy(true);setReprocessing(true);
    try {
      await confirmSession();
      const { data, error } = await whatsappService.processQueue();
      if (error) throw error;
      if(!confirmedProcessing(data))throw Error('Processamento não confirmado.');
      toast.success(`Processamento confirmado: ${data.processed} processadas${data.failed===undefined?'':` · ${data.failed} falhas`}`);
      loadQueueStats();
    } catch (err: any) {
      toast.error(`Erro ao processar fila: ${err.message}`);
    }
    actionLock.current=false;setActionBusy(false);setReprocessing(false);
  };

  const testWhatsApp = async () => {
    if (!testPhone) { toast.error('Informe o número para teste.'); return; }
    if(actionLock.current||connectionFailed||!window.confirm('Enviar mensagem de teste real para o número informado?'))return;
    actionLock.current=true;setActionBusy(true);setEvolutionTesting(true);
    try {
      await confirmSession();
      const {data:provider,error:providerError}=await supabase.from('clinica_config').select('whatsapp_provider_active').eq('id',evolutionConfigId!).maybeSingle();
      if(providerError||!provider||provider.whatsapp_provider_active!==activeProvider)throw Error('Provedor alterado. Atualize a conexão.');
      const {data,error}=await supabase.functions.invoke(providerFunction(activeProvider),{body:{tipo:'teste',telefone_teste:testPhone}});
      if (error) throw error;
      if (data?.success) {
        toast.success('Solicitação de teste aceita. Confira o recebimento.');
        if (activeProvider === 'evolution') setEvolutionStatus('connected');
        else setUazStatus('connected');
      } else { 
        toast.error(data?.error || 'Erro ao enviar'); 
        if (activeProvider === 'evolution') setEvolutionStatus('error');
        else setUazStatus('error');
      }
    } catch (err: any) { 
      toast.error(`Erro: ${err.message}`); 
      if (activeProvider === 'evolution') setEvolutionStatus('error');
      else setUazStatus('error');
    }
    actionLock.current=false;setActionBusy(false);setEvolutionTesting(false);
  };

  // Load logs
  const loadLogs = useCallback(async () => {
    const request=++logRequest.current;
    setLogsLoading(true);setLogsFailed(false);
    try {
      await confirmSession();
      let query = supabase.from('notification_logs').select('*')
        .in('canal', ['whatsapp_evolution', 'whatsapp_uazapigo'])
        .order('criado_em', { ascending: false })
        .limit(100);
      if (logsFilter !== 'todos') query = query.eq('status', logsFilter);
      const { data,error } = await query;
      if(error||!data)throw Error('Consulta não confirmada.');if(request===logRequest.current)setLogs(data as NotifLog[]);
    } catch {if(request===logRequest.current)setLogsFailed(true);}
    finally{if(request===logRequest.current)setLogsLoading(false);}
  }, [logsFilter,confirmSession]);

  useEffect(() => { if (activeSubTab === 'logs') void loadLogs(); return()=>{logRequest.current++;}; }, [activeSubTab, loadLogs]);

  const resendMessage = async (log: NotifLog) => {
    if (!log.agendamento_id) { toast.error('Sem agendamento vinculado.'); return; }
    if(actionLock.current||logsFailed||connectionFailed||!window.confirm('Solicitar novo envio? Confira se o destinatário ainda não recebeu.'))return;
    actionLock.current=true;setActionBusy(true);
    try {
      await confirmSession();
      const {data:provider,error:providerError}=await supabase.from('clinica_config').select('whatsapp_provider_active').eq('id',evolutionConfigId!).maybeSingle();
      if(providerError||!provider||provider.whatsapp_provider_active!==activeProvider)throw Error('Provedor alterado. Atualize a conexão.');
      const { data, error } = await supabase.functions.invoke(providerFunction(activeProvider), {
        body: { agendamento_id: log.agendamento_id, tipo: log.evento },
      });
      if (error) throw error;
      if (data?.success) toast.success('Solicitação de reenvio aceita. Confira o histórico.');
      else toast.error(data?.error || 'Erro');
      loadLogs();
    } catch { toast.error('Reenvio não confirmado. Confira o histórico antes de repetir.'); }
    finally{actionLock.current=false;setActionBusy(false);}
  };

  // Save reminder config
  const saveReminderConfig=async()=>{
    if(reminderLock.current||!reminderReady||!reminderBaseline.current||!validReminderHours(horasLembrete1,horasLembrete2)){toast.error('Confira a leitura e os limites de lembretes.');return;}
    reminderLock.current=true;setReminderSaving(true);
    try{await confirmSession();const old=reminderBaseline.current;const next={...(old.raw===undefined?{}:configObject(old.raw)),horas_lembrete_1:horasLembrete1,horas_lembrete_2:horasLembrete2};
      const payload={configuracoes:next as Json,updated_at:old.version?nextVersion(old.version):new Date().toISOString()};
      const result=old.version?await supabase.from('system_config').update(payload).eq('id','config_whatsapp').eq('updated_at',old.version).select('id,updated_at').maybeSingle():await supabase.from('system_config').insert({id:'config_whatsapp',...payload}).select('id,updated_at').single();
      if(result.error||!result.data)throw Error('Gravação não confirmada.');
      reminderBaseline.current={raw:next,version:result.data.updated_at};toast.success('Tempo de lembretes confirmado.');
    }catch{setReminderReady(false);toast.error('Gravação não confirmada. Atualize a configuração.');}
    finally{reminderLock.current=false;setReminderSaving(false);}
  };

  // ─── UazapiGO ──────────────────────────────────────────────
  const saveUazConfig = async () => {
    if(connectionLock.current||connectionFailed||!window.confirm('Salvar configuração UazapiGO?'))return;
    setUazSaving(true);
    try {
      const serverUrl = (uazConfig.uazapi_server_url || '').trim().replace(/\/+$/, '');
      if (serverUrl && !/^https?:\/\//i.test(serverUrl)) {
        toast.error('Server URL deve começar com http:// ou https://');
        setUazSaving(false); return;
      }
      const tokenToSave = uazConfig.uazapi_admin_token || originalUazToken;
      const payload: any = {
        uazapi_server_url: serverUrl,
        uazapi_admin_token: tokenToSave,
        uazapi_instance: uazConfig.uazapi_instance || '',
        uazapi_ativo: uazConfig.uazapi_ativo,
        updated_at: new Date().toISOString()
      };
      
      await writeConnection(payload);
      
      setUazConfig(p=>({...p,uazapi_admin_token:'',uazapi_server_url:serverUrl}));setUazStatus('idle');setOriginalUazToken(tokenToSave);
      setUazTokenMasked(true);
      toast.success('Configuração UazapiGO salva.');
    } catch (err: any) { toast.error(`Erro: ${err.message}`); }
    setUazSaving(false);
  };

  const checkUazConnection = async () => {
    if (!uazConfig.uazapi_server_url || !originalUazToken) {
      toast.error('Preencha Server URL e Admin Token primeiro.');
      return;
    }
    if(actionLock.current||connectionLock.current||connectionFailed||!baseline.current||uazConfig.uazapi_server_url!==baseline.current.uazapi_server_url||uazConfig.uazapi_instance!==baseline.current.uazapi_instance||!uazTokenMasked){toast.error('Salve as alterações antes de verificar.');return;}
    actionLock.current=true;setActionBusy(true);setUazTesting(true);
    try {
      await confirmSession();
      const { data,error } = await uazapigoService.getConnectionStatus();
      if(error)throw Error('Diagnóstico não confirmado.');
      const detailed = (data as any)?.status_detailed;
      switch (detailed) {
        case 'conectado': setUazStatus('connected'); toast.success('✅ UazapiGO conectada!'); break;
        case 'qrcode_necessario': setUazStatus('qrcode'); toast.warning('📱 QR Code necessário no painel UazapiGO.'); break;
        case 'conectando': setUazStatus('connecting'); toast.info('🔄 Conectando...'); break;
        case 'desconectado': setUazStatus('disconnected'); toast.warning('Instância desconectada.'); break;
        case 'admin_token_invalido': setUazStatus('error'); toast.error('❌ Admin Token inválido'); break;
        case 'instancia_inexistente': setUazStatus('no_instance'); toast.error('❌ Instância não encontrada'); break;
        case 'server_url_invalida': setUazStatus('error'); toast.error('❌ Server URL inválido'); break;
        case 'rede_indisponivel': setUazStatus('error'); toast.error('❌ Rede indisponível'); break;
        default: setUazStatus('error'); toast.error('Erro ao verificar UazapiGO. Confira a instância salva.');
      }
    } catch { setUazStatus('error'); toast.error('Não foi possível confirmar o diagnóstico UazapiGO.'); }
    finally{actionLock.current=false;setActionBusy(false);setUazTesting(false);}
  };

  const createUazInstance = async () => {
    if (!uazConfig.uazapi_server_url || !originalUazToken) {
      toast.error('Configure Server URL e Admin Token para criar instância.');
      return;
    }
    const name = uazConfig.uazapi_instance?.trim() || prompt('Nome da nova instância UazapiGO:') || '';
    if (!name) return;
    if(actionLock.current||connectionFailed||!window.confirm('Criar uma instância no serviço UazapiGO?'))return;
    actionLock.current=true;setActionBusy(true);setUazCreating(true);
    try {
      await confirmSession();
      const { data } = await uazapigoService.createInstance(name);
      const d = data as any;
      if (d?.success && d?.instance) {
        setUazConfig(p => ({ ...p, uazapi_instance: d.instance.name }));
        toast.success(`Instância "${d.instance.name}" criada. Verifique o QR no painel UazapiGO.`);
        setUazStatus('qrcode');
      } else {
        toast.error(d?.error || 'Falha ao criar instância');
      }
    } catch (err: any) { toast.error(`Erro: ${err.message}`); }
    actionLock.current=false;setActionBusy(false);setUazCreating(false);
  };

  const switchProvider=async(next:'evolution'|'uazapigo')=>{
    const old=baseline.current;
    if(!old||connectionFailed||connectionLock.current||actionLock.current||next===activeProvider)return;
    if(next==='uazapigo'&&(!old.uazapi_ativo||!old.uazapi_server_url||!old.uazapi_admin_token||!old.uazapi_instance)){toast.error('Salve a configuração UazapiGO antes de selecionar.');return;}
    if(next==='evolution'&&(!old.evolution_base_url||!old.evolution_api_key||!old.evolution_instance_name)){toast.error('Configure a Evolution antes de selecionar.');return;}
    if(!window.confirm('Alterar o provedor ativo de envio de WhatsApp?'))return;
    try{const saved=await writeConnection({whatsapp_provider_active:next});if(saved.whatsapp_provider_active!==next)throw Error('Provedor não confirmado.');setActiveProvider(next);toast.success('Provedor ativo confirmado.');}
    catch{toast.error('Alteração de provedor não confirmada.');}
  };
  const maskedUazToken=originalUazToken?'••••••••':'';

  const statusBadge = (status: string) => {
    switch (status) {
      case 'connected': return <Badge className="bg-success/10 text-success border-0"><CheckCircle2 className="w-3 h-3 mr-1" /> Conectado</Badge>;
      case 'disconnected': return <Badge variant="secondary"><XCircle className="w-3 h-3 mr-1" /> Desconectado</Badge>;
      case 'qrcode': return <Badge className="bg-yellow-500/10 text-yellow-600 border-0"><AlertCircle className="w-3 h-3 mr-1" /> QR Code</Badge>;
      case 'connecting': return <Badge className="bg-blue-500/10 text-blue-600 border-0"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Conectando</Badge>;
      case 'error': return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" /> Erro</Badge>;
      default: return <Badge variant="outline">Não verificado</Badge>;
    }
  };

  const formatDateTime = (iso?: string) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const maskedApiKey=originalApiKey?'••••••••':'';

  const templateInfo = TEMPLATE_TYPES.find(t => t.tipo === selectedTemplate);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-success/10 flex items-center justify-center">
          <MessageSquare className="w-6 h-6 text-success" />
        </div>
        <div>
          <h2 className="text-xl font-bold font-display text-foreground">WhatsApp Business</h2>
          <p className="text-sm text-muted-foreground">Central de conexões, automações e acompanhamento de envios</p>
        </div>
        <div className="ml-auto">{connectionFailed?<Badge variant="outline">Não confirmado</Badge>:statusBadge(activeProvider==='evolution'?evolutionStatus:uazStatus)}</div>
      </div>



      <div className="rounded-xl border bg-card p-4 flex flex-wrap gap-3 items-center justify-between"><div><p className="font-semibold">Provedor salvo: {connectionFailed||evolutionLoading?'não confirmado':activeProvider==='evolution'?'Evolution API':'UazapiGO'}</p><p role="status" className="text-xs text-muted-foreground">{connectionFailed?'Conexão não confirmada. Atualize antes de editar.':connectionBusy?'Gravando configuração…':'As verificações consultam a configuração salva.'}</p></div><Button size="sm" variant="outline" disabled={connectionBusy||actionBusy||reminderSaving||evolutionLoading} onClick={()=>{if(window.confirm('Recarregar a conexão e descartar alterações locais?'))void loadConnection();}}>Atualizar conexão</Button></div>
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="config-admin-tabs grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 w-full h-auto gap-1">
          <TabsTrigger value="conexao" className="gap-1.5"><Zap className="w-4 h-4" /> Conexão</TabsTrigger>
          <TabsTrigger value="mensagens" className="gap-1.5"><FileText className="w-4 h-4" /> Mensagens</TabsTrigger>
          <TabsTrigger value="eventos" className="gap-1.5"><Bell className="w-4 h-4" /> Eventos</TabsTrigger>
          <TabsTrigger value="antiban" className="gap-1.5"><Shield className="w-4 h-4" /> Anti-ban</TabsTrigger>
          <TabsTrigger value="fila" className="gap-1.5"><RotateCcw className="w-4 h-4" /> Fila</TabsTrigger>
          <TabsTrigger value="respostas" className="gap-1.5"><MessageSquare className="w-4 h-4" /> Respostas</TabsTrigger>
          <TabsTrigger value="saude" className="gap-1.5"><AlertCircle className="w-4 h-4" /> Saúde</TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5"><Clock className="w-4 h-4" /> Logs</TabsTrigger>
        </TabsList>


        <TabsContent value="eventos" className="mt-4">
          <ConfigWhatsAppEvents />
        </TabsContent>

        <TabsContent value="antiban" className="mt-4">
          <ConfigWhatsAppAntiBan />
        </TabsContent>

        <TabsContent value="fila" className="mt-4">
          <QueueTable />
        </TabsContent>

        <TabsContent value="respostas" className="mt-4">
          <InboxPanel />
        </TabsContent>

        <TabsContent value="saude" className="mt-4">
          <HealthDashboard />
        </TabsContent>


        {/* ─── CONEXÃO ─── */}
        <TabsContent value="conexao" className="space-y-4 mt-4">
          {/* ─── PROVEDOR ATIVO ─── */}
          <Card className="config-admin-card shadow-card border-0">
            <CardContent className="p-3 sm:p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="font-semibold text-foreground flex items-center gap-2"><Zap className="w-4 h-4" /> Provedor de envio ativo</h3>
                  <p className="text-xs text-muted-foreground mt-1">Apenas o provedor selecionado envia mensagens. Nunca os dois ao mesmo tempo.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Select disabled={connectionFailed||connectionBusy||evolutionLoading||actionBusy} value={activeProvider} onValueChange={(v) => switchProvider(v as 'evolution' | 'uazapigo')}>
                    <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="evolution">Evolution API</SelectItem>
                      <SelectItem value="uazapigo">UazapiGO</SelectItem>
                    </SelectContent>
                  </Select>
                  <Badge variant={activeProvider === 'uazapigo' ? 'default' : 'secondary'}>
                    {activeProvider === 'uazapigo' ? 'UazapiGO' : 'Evolution'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <WebhookUrlCard />



          <Card className="config-admin-card shadow-card border-0">
            <CardContent className="p-3 sm:p-4 space-y-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2"><Smartphone className="w-4 h-4" /> Evolution API</h3>
              {evolutionLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><Label>Nome da Clínica</Label><Input value={evolutionConfig.nome_clinica} onChange={e => setEvolutionConfig(p => ({ ...p, nome_clinica: e.target.value }))} /></div>
                    <div><Label>Telefone</Label><Input placeholder="5593999990000" value={evolutionConfig.telefone} onChange={e => setEvolutionConfig(p => ({ ...p, telefone: e.target.value }))} /></div>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><Label>Base URL</Label><Input value={evolutionConfig.evolution_base_url} onChange={e => setEvolutionConfig(p => ({ ...p, evolution_base_url: e.target.value.replace(/\/+$/, '') }))} /></div>
                    <div>
                      <Label>API Key</Label>
                      {apiKeyMasked && originalApiKey ? (
                        <div className="flex gap-2">
                          <Input value={maskedApiKey} disabled className="font-mono" />
                          <Button type="button" variant="outline" size="sm" onClick={() => { setApiKeyMasked(false); setEvolutionConfig(p => ({ ...p, evolution_api_key: '' })); }}>
                            Alterar
                          </Button>
                        </div>
                      ) : (
                        <Input
                          type="password"
                          placeholder={originalApiKey ? 'Digite a nova API Key' : 'Cole a API Key'}
                          value={evolutionConfig.evolution_api_key}
                          onChange={e => setEvolutionConfig(p => ({ ...p, evolution_api_key: e.target.value }))}
                        />
                      )}
                    </div>
                  </div>
                  <div>
                    <Label>Instância</Label>
                    {evolutionInstances.length > 0 ? (
                      <Select value={evolutionConfig.evolution_instance_name} onValueChange={v => setEvolutionConfig(p => ({ ...p, evolution_instance_name: v }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>{evolutionInstances.map(inst => (
                          <SelectItem key={inst.instanceName} value={inst.instanceName}>
                            {inst.instanceName} {inst.state === 'open' ? '✅' : '⚠️'}
                          </SelectItem>
                        ))}</SelectContent>
                      </Select>
                    ) : <Input placeholder="Nome da instância" value={evolutionConfig.evolution_instance_name} onChange={e => setEvolutionConfig(p => ({ ...p, evolution_instance_name: e.target.value }))} />}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button className="gradient-primary text-primary-foreground flex-1 min-w-[120px]" disabled={connectionFailed||connectionBusy||actionBusy||evolutionSaving || !evolutionConfig.evolution_instance_name} onClick={saveEvolutionConfig}>
                      {evolutionSaving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Salvar
                    </Button>
                    <Button variant="outline" disabled={actionBusy||evolutionLoading||connectionFailed||connectionBusy||!evolutionConfig.evolution_instance_name} onClick={checkConnection}>
                      <RefreshCw className="w-4 h-4 mr-1" />Verificar
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* ─── UAZAPIGO ─── */}
          <Card className="config-admin-card shadow-card border-0">
            <CardContent className="p-3 sm:p-4 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <Smartphone className="w-4 h-4" /> UazapiGO
                  <Badge variant="outline" className="ml-1">Alternativa</Badge>
                </h3>
                <div className="flex items-center gap-2">
                  <Label htmlFor="uaz-ativo" className="text-xs">Ativo</Label>
                  <Switch
                    id="uaz-ativo"
                    checked={uazConfig.uazapi_ativo}
                    onCheckedChange={(v) => setUazConfig(p => ({ ...p, uazapi_ativo: v }))}
                  />
                  <span className="ml-2">{statusBadge(uazStatus === 'no_instance' ? 'idle' : uazStatus)}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Server URL</Label>
                  <Input
                    placeholder="https://free.uazapi.com"
                    value={uazConfig.uazapi_server_url}
                    onChange={e => setUazConfig(p => ({ ...p, uazapi_server_url: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Admin Token</Label>
                  {uazTokenMasked && originalUazToken ? (
                    <div className="flex gap-2">
                      <Input value={maskedUazToken} disabled className="font-mono" />
                      <Button type="button" variant="outline" size="sm"
                        onClick={() => { setUazTokenMasked(false); setUazConfig(p => ({ ...p, uazapi_admin_token: '' })); }}>
                        Alterar
                      </Button>
                    </div>
                  ) : (
                    <Input
                      type="password"
                      placeholder={originalUazToken ? 'Digite o novo Admin Token' : 'Cole o Admin Token'}
                      value={uazConfig.uazapi_admin_token}
                      onChange={e => setUazConfig(p => ({ ...p, uazapi_admin_token: e.target.value }))}
                    />
                  )}
                </div>
              </div>

              <div>
                <Label>Nome/ID da Instância</Label>
                <Input
                  placeholder="Ex.: clinica-sms (deixe vazio se ainda não criou)"
                  value={uazConfig.uazapi_instance}
                  onChange={e => setUazConfig(p => ({ ...p, uazapi_instance: e.target.value }))}
                />
                {!uazConfig.uazapi_instance && (
                  <p className="text-xs text-muted-foreground mt-1">⚠️ Instância não configurada — UazapiGO não enviará mensagens.</p>
                )}
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button
                  className="gradient-primary text-primary-foreground flex-1 min-w-[120px]"
                  disabled={connectionFailed||connectionBusy||actionBusy||evolutionLoading||uazSaving}
                  onClick={saveUazConfig}
                >
                  {uazSaving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Salvar
                </Button>
                <Button
                  variant="outline"
                  disabled={actionBusy||evolutionLoading||connectionFailed||connectionBusy||uazTesting || !uazConfig.uazapi_server_url || !originalUazToken}
                  onClick={checkUazConnection}
                >
                  {uazTesting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                  Verificar
                </Button>
                <Button
                  variant="outline"
                  disabled={connectionFailed||actionBusy||uazCreating || !uazConfig.uazapi_server_url || !originalUazToken}
                  onClick={createUazInstance}
                  title={(!uazConfig.uazapi_server_url || !originalUazToken)
                    ? 'Configure Server URL e Admin Token para criar instância.'
                    : 'Criar nova instância UazapiGO'}
                >
                  {uazCreating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Smartphone className="w-4 h-4 mr-1" />}
                  Nova Instância UazapiGO
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                ℹ️ A UazapiGO só é usada para envios quando estiver marcada como <strong>Provedor ativo</strong> acima.
                Token mascarado na interface. A credencial continua no armazenamento existente.
              </p>
            </CardContent>
          </Card>

          {/* Painel de monitoramento e fila */}

          <Card className="config-admin-card shadow-card border-0">
            <CardContent className="p-3 sm:p-4 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <Shield className="w-4 h-4" /> Monitoramento e Fila
                </h3>
                <Button variant="outline" size="sm" disabled={actionBusy||reprocessing} onClick={reprocessQueue}>
                  {reprocessing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RotateCcw className="w-4 h-4 mr-1" />}
                  Reprocessar fila agora
                </Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground">Status atual</div>
                  <div className="font-medium mt-1">{statusBadge(evolutionStatus)}</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground">Última verificação</div>
                  <div className="font-medium mt-1 text-xs">{formatDateTime(statusDetail.last_check_at)}</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground">Último envio OK</div>
                  <div className="font-medium mt-1 text-xs">{formatDateTime(statusDetail.last_success_send_at)}</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground">Última conexão</div>
                  <div className="font-medium mt-1 text-xs">{formatDateTime(statusDetail.last_connected_at)}</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground">Última desconexão</div>
                  <div className="font-medium mt-1 text-xs">{formatDateTime(statusDetail.last_disconnected_at)}</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground">Último erro</div>
                  <div className="font-medium mt-1 text-xs truncate" title={statusDetail.last_error ? 'Falha registrada pelo provedor' : ''}>
                    {statusDetail.last_error ? 'Falha registrada pelo provedor' : '—'}
                  </div>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center">
                <div className="p-3 rounded-lg bg-yellow-500/10">
                  <div className="text-2xl font-bold text-yellow-600">{statsReady?queueStats.pendentes:'—'}</div>
                  <div className="text-xs text-muted-foreground">Pendentes</div>
                </div>
                <div className="p-3 rounded-lg bg-blue-500/10">
                  <div className="text-2xl font-bold text-blue-600">{statsReady?queueStats.processando:'—'}</div>
                  <div className="text-xs text-muted-foreground">Processando</div>
                </div>
                <div className="p-3 rounded-lg bg-success/10">
                  <div className="text-2xl font-bold text-success">{statsReady?queueStats.enviadas_24h:'—'}</div>
                  <div className="text-xs text-muted-foreground">Enviadas 24h</div>
                </div>
                <div className="p-3 rounded-lg bg-destructive/10">
                  <div className="text-2xl font-bold text-destructive">{statsReady?queueStats.falhas_24h:'—'}</div>
                  <div className="text-xs text-muted-foreground">Falhas 24h</div>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <div className="text-2xl font-bold text-muted-foreground">{statsReady?queueStats.expiradas_24h:'—'}</div>
                  <div className="text-xs text-muted-foreground">Bloqueadas 24h</div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                ℹ️ Mensagens cujo evento (consulta/sessão) já passou são marcadas como expiradas e <strong>não são reenviadas</strong>, mesmo após reconexão da instância.
              </p>
            </CardContent>
          </Card>

          <Card className="config-admin-card shadow-card border-0">
            <CardContent className="p-3 sm:p-4 space-y-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2"><Send className="w-4 h-4" /> Teste de Envio</h3>
              <div className="flex gap-2">
                <Input placeholder="5593999990000" value={testPhone} onChange={e => setTestPhone(e.target.value)} className="flex-1" />
                <Button variant="outline" disabled={actionBusy||connectionFailed||evolutionLoading||evolutionTesting || !testPhone} onClick={testWhatsApp}>
                  {evolutionTesting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}Enviar Teste
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="config-admin-card shadow-card border-0">
            <CardContent className="p-3 sm:p-4 space-y-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2"><Clock className="w-4 h-4" /> Configuração de Tempo</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Lembrete 1 (horas antes)</Label>
                  <Input type="number" min={1} max={72} value={horasLembrete1} onChange={e => setHorasLembrete1(parseInt(e.target.value) || 24)} />
                  <p className="text-xs text-muted-foreground mt-1">Padrão: 24h antes</p>
                </div>
                <div>
                  <Label>Lembrete 2 (horas antes)</Label>
                  <Input type="number" min={1} max={12} value={horasLembrete2} onChange={e => setHorasLembrete2(parseInt(e.target.value) || 2)} />
                  <p className="text-xs text-muted-foreground mt-1">Padrão: 2h antes</p>
                </div>
              </div>
              <Button className="gradient-primary text-primary-foreground" disabled={!reminderReady||reminderSaving} onClick={saveReminderConfig}>Salvar Tempo</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── MENSAGENS ─── */}
        <TabsContent value="mensagens" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><p role="status" className="text-sm text-muted-foreground">{templatesFailed?'Consulta/gravação não confirmada.':templatesLoading?'Carregando modelos…':editingMessage!==confirmedMessage?'Alterações ainda não salvas':'Modelos consultados'} · Unidade: {unidades.find(u=>u.id===userUnitId)?.nome??'não selecionada'}</p><Button size="sm" variant="outline" disabled={templateSaving} onClick={()=>{if(editingMessage===confirmedMessage||window.confirm('Descartar a edição e recarregar?'))void loadTemplates();}}>Atualizar modelos</Button></div>
          <fieldset disabled={templatesFailed||templatesLoading||templateSaving||!userUnitId} className="min-w-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Sidebar - Template list */}
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground text-sm mb-3">Tipo de Mensagem</h3>
              {TEMPLATE_TYPES.map(tt => {
                const isActive = selectedTemplate === tt.tipo;
                const tmpl = templates.find(t => t.tipo === tt.tipo && t.unidade_id === userUnitId);
                const enabled = tmpl?.ativo ?? true;
                return (
                  <button
                    key={tt.tipo}
                    onClick={()=>{if(editingMessage===confirmedMessage||window.confirm('Descartar alterações não salvas?'))setSelectedTemplate(tt.tipo);}}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                      isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <span className="text-lg">{tt.icon}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block">{tt.label}</span>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${enabled ? 'bg-success' : 'bg-muted-foreground/30'}`} />
                  </button>
                );
              })}
            </div>

            {/* Editor */}
            <div className="lg:col-span-2 space-y-4">
              <Card className="config-admin-card shadow-card border-0">
                <CardContent className="p-3 sm:p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">{templateInfo?.icon} {templateInfo?.label}</h3>
                      <p className="text-xs text-muted-foreground">{templateInfo?.description}</p>
                    </div>
                    <Switch
                      checked={isTemplateActive()}
                      onCheckedChange={() => toggleTemplate(selectedTemplate)}
                    />
                  </div>
                  <Separator />
                  <div>
                    <Label>Mensagem</Label>
                    <Textarea
                      value={editingMessage}
                      onChange={e => setEditingMessage(e.target.value)}
                      className="min-h-[200px] font-mono text-sm"
                      placeholder="Digite a mensagem..."
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {VARIABLES.map(v => (
                      <button
                        key={v.key}
                        onClick={() => setEditingMessage(prev => prev + v.key)}
                        className="px-2 py-1 text-xs bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors"
                        title={v.label}
                      >
                        {v.key}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button className="gradient-primary text-primary-foreground flex-1" disabled={templateSaving} onClick={saveTemplate}>
                      {templateSaving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Salvar Template
                    </Button>
                    <Button variant="outline" onClick={resetToDefault}>
                      <RotateCcw className="w-4 h-4 mr-1" />Padrão
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Preview */}
              <Card className="config-admin-card shadow-card border-0">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Eye className="w-4 h-4 text-muted-foreground" />
                    <h3 className="font-semibold text-foreground text-sm">Preview</h3>
                  </div>
                  <div className="bg-[#e5ddd5] dark:bg-muted rounded-xl p-4">
                    <div className="bg-[#dcf8c6] dark:bg-success/20 rounded-lg p-3 max-w-sm ml-auto shadow-sm">
                      <p className="text-sm text-foreground whitespace-pre-wrap break-words">{previewMessage}</p>
                      <p className="text-[10px] text-muted-foreground text-right mt-1">
                        {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ✓✓
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
          </fieldset>
        </TabsContent>

        {/* ─── EVENTOS ─── */}
        <TabsContent value="eventos" className="space-y-4 mt-4">
          <Card className="config-admin-card shadow-card border-0">
            <CardContent className="p-3 sm:p-4">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <Bell className="w-4 h-4" /> Eventos Ativos por Tipo
              </h3>
              <div className="space-y-3">
                {TEMPLATE_TYPES.map(tt => {
                  const tmpl = templates.find(t => t.tipo === tt.tipo && t.unidade_id === userUnitId);
                  const enabled = tmpl?.ativo ?? true;
                  return (
                    <div key={tt.tipo} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{tt.icon}</span>
                        <div>
                          <span className="text-sm font-medium text-foreground">{tt.label}</span>
                          <p className="text-xs text-muted-foreground">{tt.description}</p>
                        </div>
                      </div>
                      <Switch checked={enabled} disabled={templatesFailed||templatesLoading||templateSaving||!userUnitId} onCheckedChange={() => toggleTemplate(tt.tipo)} />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="config-admin-card shadow-card border-0">
            <CardContent className="p-3 sm:p-4">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <Settings className="w-4 h-4" /> Configurações Globais
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <span className="text-sm font-medium text-foreground">WhatsApp Ativo</span>
                    <p className="text-xs text-muted-foreground">Ativar/desativar envio para esta unidade</p>
                  </div>
                  <Switch checked={whatsapp.ativo} onCheckedChange={v => updateConfiguracoes({ whatsapp: { ...whatsapp, ativo: v } })} />
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <span className="text-sm font-medium text-foreground">Confirmação ao agendar</span>
                    <p className="text-xs text-muted-foreground">Enviar mensagem quando agendamento é criado</p>
                  </div>
                  <Switch checked={whatsapp.notificacoes?.confirmacao ?? true} onCheckedChange={v => updateConfiguracoes({ whatsapp: { ...whatsapp, notificacoes: { ...whatsapp.notificacoes, confirmacao: v } } })} />
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <span className="text-sm font-medium text-foreground">Lembrete 24h</span>
                  </div>
                  <Switch checked={whatsapp.notificacoes?.lembrete24h ?? true} onCheckedChange={v => updateConfiguracoes({ whatsapp: { ...whatsapp, notificacoes: { ...whatsapp.notificacoes, lembrete24h: v } } })} />
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <span className="text-sm font-medium text-foreground">Lembrete 2h</span>
                  </div>
                  <Switch checked={whatsapp.notificacoes?.lembrete2h ?? true} onCheckedChange={v => updateConfiguracoes({ whatsapp: { ...whatsapp, notificacoes: { ...whatsapp.notificacoes, lembrete2h: v } } })} />
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <span className="text-sm font-medium text-foreground">Cancelamento</span>
                  </div>
                  <Switch checked={whatsapp.notificacoes?.cancelamento ?? true} onCheckedChange={v => updateConfiguracoes({ whatsapp: { ...whatsapp, notificacoes: { ...whatsapp.notificacoes, cancelamento: v } } })} />
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <span className="text-sm font-medium text-foreground">Remarcação</span>
                  </div>
                  <Switch checked={whatsapp.notificacoes?.remarcacao ?? true} onCheckedChange={v => updateConfiguracoes({ whatsapp: { ...whatsapp, notificacoes: { ...whatsapp.notificacoes, remarcacao: v } } })} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── LOGS ─── */}
        <TabsContent value="logs" className="space-y-4 mt-4">
          <Card className="config-admin-card shadow-card border-0">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Histórico de Envios
                </h3>
                <div className="flex gap-2">
                  <Select value={logsFilter} onValueChange={setLogsFilter}>
                    <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="enviado">Enviados</SelectItem>
                      <SelectItem value="erro">Erros</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" onClick={loadLogs} disabled={logsLoading}>
                    <RefreshCw className={`w-4 h-4 ${logsLoading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>

              {logsLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : logsFailed ? <p role="alert" className="text-sm text-destructive">Histórico não confirmado. Atualize a consulta.</p> : logs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Nenhum log encontrado</div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Evento</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map(log => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs">
                            {new Date(log.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs capitalize">{log.evento}</Badge>
                          </TableCell>
                          <TableCell className="text-xs font-mono">{log.destinatario_telefone}</TableCell>
                          <TableCell>
                            {log.status === 'enviado' ? (
                              <Badge className="bg-success/10 text-success border-0 text-xs">✅ Enviado</Badge>
                            ) : (
                              <Badge variant="destructive" className="text-xs">❌ Erro</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {log.status === 'erro' && log.agendamento_id && (
                              <Button variant="ghost" size="sm" disabled={actionBusy||logsFailed||connectionFailed} onClick={() => resendMessage(log)}>
                                <RotateCcw className="w-3 h-3 mr-1" />Reenviar
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ConfigWhatsApp;
