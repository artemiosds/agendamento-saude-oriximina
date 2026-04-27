import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
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
import { whatsappService } from '@/services/whatsappService';
import { toast } from 'sonner';

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
  const { unidades, configuracoes, updateConfiguracoes } = useData();
  const { whatsapp } = configuracoes;

  const isGlobalAdmin = user?.usuario === 'admin.sms';
  const userUnitId = user?.unidadeId || '';

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
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('clinica_config').select('*').limit(1).maybeSingle();
        if (data) {
          setEvolutionConfigId(data.id);
          const apiKey = data.evolution_api_key || '';
          setOriginalApiKey(apiKey);
          setEvolutionConfig({
            nome_clinica: data.nome_clinica || '',
            logo_url: data.logo_url || '',
            telefone: data.telefone || '',
            evolution_base_url: data.evolution_base_url || 'https://api.agendamento-saude-sms-oriximina.site',
            evolution_api_key: apiKey,
            evolution_instance_name: data.evolution_instance_name || '',
          });
          if (data.evolution_instance_name && apiKey) {
            const [{ data: statusData }, { data: instancesData }] = await Promise.all([
              whatsappService.getConnectionStatus(),
              whatsappService.getInstances(),
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
        }

        // Load reminder hours from system_config
        const { data: sysData } = await supabase.from('system_config').select('configuracoes').eq('id', 'config_whatsapp').maybeSingle();
        if (sysData?.configuracoes) {
          const cfg = sysData.configuracoes as any;
          if (cfg.horas_lembrete_1) setHorasLembrete1(cfg.horas_lembrete_1);
          if (cfg.horas_lembrete_2) setHorasLembrete2(cfg.horas_lembrete_2);
        }
      } catch {}
      setEvolutionLoading(false);
    })();
  }, []);

  // Carrega métricas da fila quando aba Logs ou Conexão é aberta
  const loadQueueStats = useCallback(async () => {
    try {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [{ count: pendentes }, { count: enviadas }, { count: falhas }, { count: expiradas }, { count: processando }] = await Promise.all([
        supabase.from('whatsapp_queue' as any).select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
        supabase.from('whatsapp_queue' as any).select('id', { count: 'exact', head: true }).eq('status', 'enviado').gte('processado_em', dayAgo),
        supabase.from('whatsapp_queue' as any).select('id', { count: 'exact', head: true }).eq('status', 'erro').gte('processado_em', dayAgo),
        supabase.from('whatsapp_queue' as any).select('id', { count: 'exact', head: true }).eq('status', 'bloqueado').gte('processado_em', dayAgo),
        supabase.from('whatsapp_queue' as any).select('id', { count: 'exact', head: true }).eq('status', 'processando'),
      ]);
      setQueueStats({
        pendentes: pendentes ?? 0,
        enviadas_24h: enviadas ?? 0,
        falhas_24h: falhas ?? 0,
        expiradas_24h: expiradas ?? 0,
        processando: processando ?? 0,
      });
    } catch {}
  }, []);

  useEffect(() => { loadQueueStats(); }, [loadQueueStats]);

  // Load templates
  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      let query = supabase.from('whatsapp_templates').select('*');
      if (!isGlobalAdmin) query = query.eq('unidade_id', userUnitId);
      const { data } = await query.order('tipo');
      setTemplates((data as any[]) || []);
    } catch {}
    setTemplatesLoading(false);
  }, [isGlobalAdmin, userUnitId]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  // Set editing message when template changes
  useEffect(() => {
    const existing = templates.find(t => t.tipo === selectedTemplate && t.unidade_id === userUnitId);
    setEditingMessage(existing?.mensagem || DEFAULT_TEMPLATES[selectedTemplate] || '');
  }, [selectedTemplate, templates, userUnitId]);

  const getCurrentTemplate = () => templates.find(t => t.tipo === selectedTemplate && t.unidade_id === userUnitId);
  const isTemplateActive = () => getCurrentTemplate()?.ativo ?? true;

  const saveTemplate = async () => {
    setTemplateSaving(true);
    try {
      const existing = getCurrentTemplate();
      if (existing?.id) {
        await supabase.from('whatsapp_templates').update({
          mensagem: editingMessage,
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id);
      } else {
        await supabase.from('whatsapp_templates').insert({
          unidade_id: userUnitId,
          tipo: selectedTemplate,
          mensagem: editingMessage,
          ativo: true,
        });
      }
      await loadTemplates();
      toast.success('Template salvo com sucesso!');
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    }
    setTemplateSaving(false);
  };

  const toggleTemplate = async (tipo: string) => {
    const existing = templates.find(t => t.tipo === tipo && t.unidade_id === userUnitId);
    if (existing?.id) {
      await supabase.from('whatsapp_templates').update({ ativo: !existing.ativo }).eq('id', existing.id);
    } else {
      await supabase.from('whatsapp_templates').insert({
        unidade_id: userUnitId, tipo, mensagem: DEFAULT_TEMPLATES[tipo] || '', ativo: false,
      });
    }
    await loadTemplates();
  };

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

  // Save Evolution config
  const saveEvolutionConfig = async () => {
    setEvolutionSaving(true);
    try {
      if (evolutionConfigId) {
        await supabase.from('clinica_config').update({ ...evolutionConfig, updated_at: new Date().toISOString() }).eq('id', evolutionConfigId);
      } else {
        const { data } = await supabase.from('clinica_config').insert(evolutionConfig).select('id').single();
        if (data) setEvolutionConfigId(data.id);
      }
      toast.success('Configurações salvas!');
    } catch (err: any) { toast.error(`Erro: ${err.message}`); }
    setEvolutionSaving(false);
  };

  const checkConnection = async () => {
    if (!evolutionConfig.evolution_instance_name || !evolutionConfig.evolution_api_key) {
      toast.error('Configure a instância e API Key primeiro.');
      return;
    }
    try {
      const [{ data: statusData, error: statusError }, { data: instancesData }] = await Promise.all([
        whatsappService.getConnectionStatus(),
        whatsappService.getInstances(),
      ]);
      if (statusError) throw statusError;
      if (instancesData?.instances) setEvolutionInstances(instancesData.instances);
      if (statusData?.success) {
        const connected = !!statusData.connected;
        setEvolutionStatus(connected ? 'connected' : 'disconnected');
        toast[connected ? 'success' : 'warning'](connected ? 'Instância conectada!' : 'Desconectada. Verifique QR Code.');
      } else { setEvolutionStatus('error'); toast.error(statusData?.error || 'Erro ao verificar.'); }
    } catch { setEvolutionStatus('error'); toast.error('Não foi possível conectar.'); }
  };

  const testWhatsApp = async () => {
    if (!testPhone) { toast.error('Informe o número para teste.'); return; }
    setEvolutionTesting(true);
    try {
      const { data, error } = await whatsappService.sendTest(testPhone);
      if (error) throw error;
      if (data?.success) {
        toast.success('Mensagem de teste enviada!');
        setEvolutionStatus('connected');
      } else { toast.error(data?.error || 'Erro ao enviar'); setEvolutionStatus('error'); }
    } catch (err: any) { toast.error(`Erro: ${err.message}`); setEvolutionStatus('error'); }
    setEvolutionTesting(false);
  };

  // Load logs
  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      let query = supabase.from('notification_logs').select('*')
        .eq('canal', 'whatsapp_evolution')
        .order('criado_em', { ascending: false })
        .limit(100);
      if (logsFilter !== 'todos') query = query.eq('status', logsFilter);
      const { data } = await query;
      setLogs((data as any[]) || []);
    } catch {}
    setLogsLoading(false);
  }, [logsFilter]);

  useEffect(() => { if (activeSubTab === 'logs') loadLogs(); }, [activeSubTab, loadLogs]);

  const resendMessage = async (log: NotifLog) => {
    if (!log.agendamento_id) { toast.error('Sem agendamento vinculado.'); return; }
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp-evolution', {
        body: { agendamento_id: log.agendamento_id, tipo: log.evento },
      });
      if (error) throw error;
      if (data?.success) toast.success('Mensagem reenviada!');
      else toast.error(data?.error || 'Erro');
      loadLogs();
    } catch (err: any) { toast.error(`Erro: ${err.message}`); }
  };

  // Save reminder config
  const saveReminderConfig = async () => {
    try {
      await supabase.from('system_config').upsert({
        id: 'config_whatsapp',
        configuracoes: { horas_lembrete_1: horasLembrete1, horas_lembrete_2: horasLembrete2 } as any,
        updated_at: new Date().toISOString(),
      });
      toast.success('Configurações de tempo salvas!');
    } catch (err: any) { toast.error(`Erro: ${err.message}`); }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'connected': return <Badge className="bg-success/10 text-success border-0"><CheckCircle2 className="w-3 h-3 mr-1" /> Conectado</Badge>;
      case 'disconnected': return <Badge variant="secondary"><XCircle className="w-3 h-3 mr-1" /> Desconectado</Badge>;
      case 'error': return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" /> Erro</Badge>;
      default: return <Badge variant="outline">Não verificado</Badge>;
    }
  };

  const templateInfo = TEMPLATE_TYPES.find(t => t.tipo === selectedTemplate);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-success/10 flex items-center justify-center">
          <MessageSquare className="w-6 h-6 text-success" />
        </div>
        <div>
          <h2 className="text-xl font-bold font-display text-foreground">WhatsApp Business</h2>
          <p className="text-sm text-muted-foreground">Automação de mensagens via Evolution API</p>
        </div>
        <div className="ml-auto">{statusBadge(evolutionStatus)}</div>
      </div>

      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="conexao" className="gap-1.5"><Zap className="w-4 h-4" /> Conexão</TabsTrigger>
          <TabsTrigger value="mensagens" className="gap-1.5"><FileText className="w-4 h-4" /> Mensagens</TabsTrigger>
          <TabsTrigger value="eventos" className="gap-1.5"><Bell className="w-4 h-4" /> Eventos</TabsTrigger>
          <TabsTrigger value="antiban" className="gap-1.5"><Shield className="w-4 h-4" /> Anti-Ban</TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5"><Clock className="w-4 h-4" /> Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="antiban" className="mt-4">
          <ConfigWhatsAppAntiBan />
        </TabsContent>

        {/* ─── CONEXÃO ─── */}
        <TabsContent value="conexao" className="space-y-4 mt-4">
          <Card className="shadow-card border-0">
            <CardContent className="p-5 space-y-4">
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
                    <div><Label>Base URL</Label><Input value={evolutionConfig.evolution_base_url} onChange={e => setEvolutionConfig(p => ({ ...p, evolution_base_url: e.target.value }))} /></div>
                    <div><Label>API Key</Label><Input type="password" value={evolutionConfig.evolution_api_key} onChange={e => setEvolutionConfig(p => ({ ...p, evolution_api_key: e.target.value }))} /></div>
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
                  <div className="flex gap-2">
                    <Button className="gradient-primary text-primary-foreground flex-1" disabled={evolutionSaving || !evolutionConfig.evolution_instance_name} onClick={saveEvolutionConfig}>
                      {evolutionSaving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Salvar
                    </Button>
                    <Button variant="outline" disabled={!evolutionConfig.evolution_instance_name} onClick={checkConnection}>
                      <RefreshCw className="w-4 h-4 mr-1" />Verificar
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-card border-0">
            <CardContent className="p-5 space-y-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2"><Send className="w-4 h-4" /> Teste de Envio</h3>
              <div className="flex gap-2">
                <Input placeholder="5593999990000" value={testPhone} onChange={e => setTestPhone(e.target.value)} className="flex-1" />
                <Button variant="outline" disabled={evolutionTesting || !testPhone} onClick={testWhatsApp}>
                  {evolutionTesting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}Enviar Teste
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card border-0">
            <CardContent className="p-5 space-y-4">
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
              <Button className="gradient-primary text-primary-foreground" onClick={saveReminderConfig}>Salvar Tempo</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── MENSAGENS ─── */}
        <TabsContent value="mensagens" className="space-y-4 mt-4">
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
                    onClick={() => setSelectedTemplate(tt.tipo)}
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
              <Card className="shadow-card border-0">
                <CardContent className="p-5 space-y-4">
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
              <Card className="shadow-card border-0">
                <CardContent className="p-5">
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
        </TabsContent>

        {/* ─── EVENTOS ─── */}
        <TabsContent value="eventos" className="space-y-4 mt-4">
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
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
                      <Switch checked={enabled} onCheckedChange={() => toggleTemplate(tt.tipo)} />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card border-0">
            <CardContent className="p-5">
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
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
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
              ) : logs.length === 0 ? (
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
                              <Button variant="ghost" size="sm" onClick={() => resendMessage(log)}>
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
