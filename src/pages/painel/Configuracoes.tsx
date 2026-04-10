import React, { useEffect, useState } from 'react';
import { useData } from '@/contexts/DataContext';
import GerenciarProcedimentos from '@/components/GerenciarProcedimentos';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { MessageSquare, Calendar, QrCode, Settings as SettingsIcon, Loader2, CheckCircle2, XCircle, Webhook, Send, Pencil, Mail, AlertCircle, HeartPulse, Shield, Users, Bell, ShieldAlert, RefreshCw, ArrowRightLeft, User, Clock, CalendarDays, Info, FileText, Globe, Ban, Plus, Trash2 } from 'lucide-react';
import EditorProntuarioConfig from '@/components/EditorProntuarioConfig';
import ModelosDocumentos from '@/components/ModelosDocumentos';
import { Stamp } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useWebhookNotify } from '@/hooks/useWebhookNotify';

const Configuracoes: React.FC = () => {
  const { configuracoes, updateConfiguracoes, unidades, funcionarios } = useData();
  const { user } = useAuth();
  const { whatsapp, googleCalendar, filaEspera, templates, webhook } = configuracoes;
  const gcal = useGoogleCalendar();
  const [searchParams, setSearchParams] = useSearchParams();
  const [webhookUrl, setWebhookUrl] = useState(webhook.url);
  const [webhookEditing, setWebhookEditing] = useState(!webhook.url);
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [gmailTesting, setGmailTesting] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<'idle' | 'conectado' | 'erro_autenticacao' | 'erro_conexao' | 'erro_envio' | 'nao_configurado'>('idle');
  const [gmailMessage, setGmailMessage] = useState('');
  const { testGmail } = useWebhookNotify();
  const [triageEnabled, setTriageEnabled] = useState(false);
  const [triageLoading, setTriageLoading] = useState(true);
  const [triageSettingId, setTriageSettingId] = useState<string | null>(null);

  // Admin: Reativar atendimento
  const [reativarProfId, setReativarProfId] = useState('');
  const [reativarAgendamentos, setReativarAgendamentos] = useState<any[]>([]);
  const [reativarAgId, setReativarAgId] = useState('');
  const [reativarLoading, setReativarLoading] = useState(false);
  const [reativarBuscando, setReativarBuscando] = useState(false);

  // Admin: Transferir paciente
  const [transferAgId, setTransferAgId] = useState('');
  const [transferNovoProfId, setTransferNovoProfId] = useState('');
  const [transferMotivo, setTransferMotivo] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferAgendamentos, setTransferAgendamentos] = useState<any[]>([]);
  const [transferProfOrigem, setTransferProfOrigem] = useState('');
  const [transferBuscando, setTransferBuscando] = useState(false);

  // Config Agendamento Online
  const [agOnline, setAgOnline] = useState({
    habilitado: false,
    antecedencia_minima_dias: 1,
    antecedencia_maxima_dias: 30,
    limite_por_dia_profissional: 5,
    mensagem_confirmacao: 'Seu agendamento foi confirmado com sucesso!',
    exigir_confirmacao_sms: false,
    profissionais_bloqueados: [] as string[],
  });
  const [agOnlineLoading, setAgOnlineLoading] = useState(true);
  const [agOnlineSaving, setAgOnlineSaving] = useState(false);

  // Config Cancelamentos
  const [cancelConfig, setCancelConfig] = useState({
    prazo_minimo_horas: 24,
    limite_cancelamentos_mes: 3,
    dias_bloqueio_apos_limite: 7,
    motivos: ['Compromisso pessoal', 'Problema de saúde', 'Falta de transporte', 'Horário incompatível', 'Outro'] as string[],
    notificar_profissional: true,
    liberar_vaga_automaticamente: true,
  });
  const [cancelLoading, setCancelLoading] = useState(true);
  const [cancelSaving, setCancelSaving] = useState(false);
  const [novoMotivo, setNovoMotivo] = useState('');

  // Evolution API WhatsApp
  const [evolutionConfig, setEvolutionConfig] = useState({
    nome_clinica: '',
    logo_url: '',
    telefone: '',
    evolution_base_url: 'https://api.agendamento-saude-sms-oriximina.site',
    evolution_api_key: 'ee602586e9594a126109ceae5759d19c',
    evolution_instance_name: '',
  });
  const [evolutionConfigId, setEvolutionConfigId] = useState<string | null>(null);
  const [evolutionInstances, setEvolutionInstances] = useState<{ instanceName: string; state: string }[]>([]);
  const [evolutionLoading, setEvolutionLoading] = useState(true);
  const [evolutionSaving, setEvolutionSaving] = useState(false);
  const [evolutionTesting, setEvolutionTesting] = useState(false);
  const [evolutionStatus, setEvolutionStatus] = useState<'idle' | 'connected' | 'disconnected' | 'error'>('idle');

  const isMaster = user?.role === 'master';
  const profissionaisAtivos = [...funcionarios].sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
  );

  const buscarTodosAgendamentosPorProfissional = async (profId: string, selectFields: string) => {
    const pageSize = 500;
    const todos: any[] = [];
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('agendamentos')
        .select(selectFields)
        .eq('profissional_id', profId)
        .order('data', { ascending: false })
        .order('hora', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      if (!data?.length) break;

      todos.push(...data);

      if (data.length < pageSize) break;
      from += pageSize;
    }

    return todos;
  };

  const buscarAgendamentosReativar = async (profId: string) => {
    if (!profId) { setReativarAgendamentos([]); return; }
    setReativarBuscando(true);
    try {
      const data = await buscarTodosAgendamentosPorProfissional(profId, 'id, paciente_nome, data, hora, status');
      setReativarAgendamentos(data);
    } catch (err: any) {
      toast.error(`Erro ao buscar agendamentos: ${err.message}`);
      setReativarAgendamentos([]);
    } finally {
      setReativarBuscando(false);
    }
  };

  const executarReativar = async () => {
    if (!reativarAgId) return;
    setReativarLoading(true);
    try {
      const { error } = await supabase
        .from('agendamentos')
        .update({ status: 'apto_atendimento', atualizado_em: new Date().toISOString() })
        .eq('id', reativarAgId);
      if (error) throw error;
      toast.success('Botão Iniciar Atendimento reativado com sucesso.');
      setReativarAgId('');
      buscarAgendamentosReativar(reativarProfId);
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setReativarLoading(false);
    }
  };

  const buscarAgendamentosTransferir = async (profId: string) => {
    if (!profId) { setTransferAgendamentos([]); return; }
    setTransferBuscando(true);
    try {
      const data = await buscarTodosAgendamentosPorProfissional(profId, 'id, paciente_nome, data, hora, status, profissional_nome, observacoes');
      setTransferAgendamentos(data);
    } catch (err: any) {
      toast.error(`Erro ao buscar agendamentos: ${err.message}`);
      setTransferAgendamentos([]);
    } finally {
      setTransferBuscando(false);
    }
  };

  const executarTransferencia = async () => {
    if (!transferAgId || !transferNovoProfId || !transferMotivo.trim()) return;
    setTransferLoading(true);
    try {
      const novoProfissional = funcionarios.find(f => f.id === transferNovoProfId);
      if (!novoProfissional) throw new Error('Profissional não encontrado');

      const ag = transferAgendamentos.find(a => a.id === transferAgId);
      const obsAnterior = ag?.observacoes || '';
      const novaObs = `${obsAnterior}\n[TRANSFERÊNCIA] De ${ag?.profissional_nome || 'N/A'} para ${novoProfissional.nome}. Motivo: ${transferMotivo.trim()}`.trim();

      const { error } = await supabase
        .from('agendamentos')
        .update({
          profissional_id: novoProfissional.id,
          profissional_nome: novoProfissional.nome,
          observacoes: novaObs,
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', transferAgId);
      if (error) throw error;

      toast.success(`Paciente transferido para ${novoProfissional.nome} com sucesso.`);
      setTransferAgId('');
      setTransferMotivo('');
      setTransferNovoProfId('');
      buscarAgendamentosTransferir(transferProfOrigem);
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setTransferLoading(false);
    }
  };
  useEffect(() => {
    (async () => {
      try {
        const unitId = user?.unidadeId || '';
        // Try to find setting for this unit, or a global one (null unidade_id)
        const { data } = await supabase
          .from('triage_settings')
          .select('*')
          .or(`unidade_id.eq.${unitId},unidade_id.is.null`)
          .order('unidade_id', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        if (data) {
          setTriageEnabled(data.enabled || false);
          setTriageSettingId(data.id);
        }
      } catch {}
      setTriageLoading(false);
    })();
  }, [user?.unidadeId]);

  // Handle OAuth callback
  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      gcal.exchangeCode(code).then(() => {
        toast.success('Google Agenda conectada com sucesso!');
        updateConfiguracoes({ googleCalendar: { ...googleCalendar, conectado: true } });
        // Clean URL
        searchParams.delete('code');
        searchParams.delete('state');
        searchParams.delete('scope');
        setSearchParams(searchParams, { replace: true });
      }).catch(() => {
        toast.error('Erro ao conectar Google Agenda.');
      });
    }
  }, []);

  // Load Agendamento Online + Cancelamentos configs
  useEffect(() => {
    if (!isMaster) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('system_config')
          .select('id, configuracoes')
          .in('id', ['config_agendamento_online', 'config_cancelamentos']);
        if (data) {
          for (const row of data) {
            const cfg = row.configuracoes as any;
            if (row.id === 'config_agendamento_online' && cfg) {
              setAgOnline(prev => ({ ...prev, ...cfg }));
            }
            if (row.id === 'config_cancelamentos' && cfg) {
              setCancelConfig(prev => ({ ...prev, ...cfg }));
            }
          }
        }
      } catch {}
      setAgOnlineLoading(false);
      setCancelLoading(false);
    })();
  }, [isMaster]);

  const saveAgOnline = async () => {
    setAgOnlineSaving(true);
    try {
      const { error } = await supabase.from('system_config').upsert({
        id: 'config_agendamento_online',
        configuracoes: agOnline as any,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success('Configurações de agendamento online salvas!');
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setAgOnlineSaving(false);
    }
  };

  const saveCancelConfig = async () => {
    setCancelSaving(true);
    try {
      const { error } = await supabase.from('system_config').upsert({
        id: 'config_cancelamentos',
        configuracoes: cancelConfig as any,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success('Regras de cancelamento salvas!');
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setCancelSaving(false);
    }
  };

  // Check connection status on mount
  useEffect(() => {
    gcal.checkStatus().then((connected) => {
      if (connected !== googleCalendar.conectado) {
        updateConfiguracoes({ googleCalendar: { ...googleCalendar, conectado: connected } });
      }
    });
  }, []);

  const updateWhatsapp = (data: Partial<typeof whatsapp>) => {
    updateConfiguracoes({ whatsapp: { ...whatsapp, ...data } });
  };

  const updateNotificacoes = (data: Partial<typeof whatsapp.notificacoes>) => {
    updateConfiguracoes({ whatsapp: { ...whatsapp, notificacoes: { ...whatsapp.notificacoes, ...data } } });
  };

  const updateGoogle = (data: Partial<typeof googleCalendar>) => {
    updateConfiguracoes({ googleCalendar: { ...googleCalendar, ...data } });
  };

  const handleConnectGoogle = async () => {
    try {
      await gcal.connect();
    } catch {
      toast.error('Erro ao iniciar conexão com Google Agenda.');
    }
  };

  const handleDisconnectGoogle = async () => {
    try {
      await gcal.disconnect();
      updateConfiguracoes({ googleCalendar: { ...googleCalendar, conectado: false } });
      toast.success('Google Agenda desconectada.');
    } catch {
      toast.error('Erro ao desconectar.');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground">Configurações</h1>
        <p className="text-muted-foreground text-sm">Integrações e preferências do sistema</p>
      </div>

      <Tabs defaultValue="integracoes" className="w-full">
        <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-muted/50 p-1 rounded-lg">
          <TabsTrigger value="integracoes" className="flex items-center gap-1.5 text-xs sm:text-sm flex-1 min-w-[100px]">
            <Webhook className="w-4 h-4 hidden sm:block" />
            Integrações
          </TabsTrigger>
          <TabsTrigger value="atendimento" className="flex items-center gap-1.5 text-xs sm:text-sm flex-1 min-w-[100px]">
            <HeartPulse className="w-4 h-4 hidden sm:block" />
            Atendimento
          </TabsTrigger>
          <TabsTrigger value="paciente" className="flex items-center gap-1.5 text-xs sm:text-sm flex-1 min-w-[100px]">
            <Users className="w-4 h-4 hidden sm:block" />
            Paciente
          </TabsTrigger>
          <TabsTrigger value="notificacoes" className="flex items-center gap-1.5 text-xs sm:text-sm flex-1 min-w-[100px]">
            <Bell className="w-4 h-4 hidden sm:block" />
            Notificações
          </TabsTrigger>
          {isMaster && (
            <TabsTrigger value="prontuario" className="flex items-center gap-1.5 text-xs sm:text-sm flex-1 min-w-[100px]">
              <FileText className="w-4 h-4 hidden sm:block" />
              Prontuário
            </TabsTrigger>
          )}
          {isMaster && (
            <TabsTrigger value="documentos" className="flex items-center gap-1.5 text-xs sm:text-sm flex-1 min-w-[100px]">
              <Stamp className="w-4 h-4 hidden sm:block" />
              Documentos
            </TabsTrigger>
          )}
          {isMaster && (
            <TabsTrigger value="admin" className="flex items-center gap-1.5 text-xs sm:text-sm flex-1 min-w-[100px]">
              <ShieldAlert className="w-4 h-4 hidden sm:block" />
              Administração
            </TabsTrigger>
          )}
        </TabsList>

        {/* ═══ ABA INTEGRAÇÕES ═══ */}
        <TabsContent value="integracoes" className="space-y-4 mt-4">
          {/* WhatsApp Integration */}
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-success" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold font-display text-foreground">WhatsApp Business</h3>
                  <p className="text-sm text-muted-foreground">Notificações automáticas</p>
                </div>
                <Switch checked={whatsapp.ativo} onCheckedChange={v => updateWhatsapp({ ativo: v })} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Provedor</Label>
                  <Select value={whatsapp.provedor} onValueChange={v => updateWhatsapp({ provedor: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="360dialog">360dialog</SelectItem>
                      <SelectItem value="twilio">Twilio</SelectItem>
                      <SelectItem value="zapi">Z-API</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Número de Envio</Label><Input placeholder="5593999990000" value={whatsapp.numero} onChange={e => updateWhatsapp({ numero: e.target.value })} /></div>
                <div className="md:col-span-2"><Label>API Token</Label><Input type="password" placeholder="Cole o token aqui" value={whatsapp.token} onChange={e => updateWhatsapp({ token: e.target.value })} /></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="p-4 bg-muted rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <QrCode className="w-5 h-5 text-foreground" />
                    <span className="font-medium text-sm text-foreground">QR Code WhatsApp</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Escaneie o QR Code para conectar.
                  </p>
                  <div className="w-40 h-40 bg-background rounded-lg border-2 border-dashed border-border flex items-center justify-center">
                    <span className="text-xs text-muted-foreground">QR Code aparecerá aqui</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium text-sm text-foreground mb-2">Notificações automáticas</h4>
                  <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Confirmação de agendamento</span><Switch checked={whatsapp.notificacoes.confirmacao} onCheckedChange={v => updateNotificacoes({ confirmacao: v })} /></div>
                  <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Lembrete 24h antes</span><Switch checked={whatsapp.notificacoes.lembrete24h} onCheckedChange={v => updateNotificacoes({ lembrete24h: v })} /></div>
                  <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Lembrete 2h antes</span><Switch checked={whatsapp.notificacoes.lembrete2h} onCheckedChange={v => updateNotificacoes({ lembrete2h: v })} /></div>
                  <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Aviso de remarcação</span><Switch checked={whatsapp.notificacoes.remarcacao} onCheckedChange={v => updateNotificacoes({ remarcacao: v })} /></div>
                  <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Aviso de cancelamento</span><Switch checked={whatsapp.notificacoes.cancelamento} onCheckedChange={v => updateNotificacoes({ cancelamento: v })} /></div>
                </div>
              </div>
              <Button className="gradient-primary text-primary-foreground w-full mt-4" onClick={() => toast.success('Configurações de WhatsApp salvas!')}>Salvar WhatsApp</Button>
            </CardContent>
          </Card>

          {/* Google Calendar */}
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-info/10 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-info" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold font-display text-foreground">Google Agenda</h3>
                  <p className="text-sm text-muted-foreground">Sincronizar agendamentos</p>
                </div>
                {gcal.connected || googleCalendar.conectado ? (
                  <span className="flex items-center gap-1 text-xs bg-success/10 text-success px-2 py-1 rounded-full font-medium">
                    <CheckCircle2 className="w-3 h-3" /> Conectado
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full font-medium">
                    <XCircle className="w-3 h-3" /> Desconectado
                  </span>
                )}
              </div>
              <div className="space-y-4">
                {gcal.connected || googleCalendar.conectado ? (
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={handleConnectGoogle} disabled={gcal.loading}>
                      {gcal.loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                      Reconectar
                    </Button>
                    <Button variant="destructive" className="flex-1" onClick={handleDisconnectGoogle} disabled={gcal.loading}>
                      Desconectar
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" className="w-full" onClick={handleConnectGoogle} disabled={gcal.loading}>
                    {gcal.loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Conectar Google Agenda
                  </Button>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50"><span className="text-sm text-muted-foreground">Criar evento ao agendar</span><Switch checked={googleCalendar.criarEvento} onCheckedChange={v => updateGoogle({ criarEvento: v })} /></div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50"><span className="text-sm text-muted-foreground">Atualizar ao remarcar</span><Switch checked={googleCalendar.atualizarRemarcar} onCheckedChange={v => updateGoogle({ atualizarRemarcar: v })} /></div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50"><span className="text-sm text-muted-foreground">Remover ao cancelar</span><Switch checked={googleCalendar.removerCancelar} onCheckedChange={v => updateGoogle({ removerCancelar: v })} /></div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50"><span className="text-sm text-muted-foreground">Enviar comprovante por e-mail</span><Switch checked={googleCalendar.enviarEmail} onCheckedChange={v => updateGoogle({ enviarEmail: v })} /></div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Webhook Make.com */}
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                  <Webhook className="w-5 h-5 text-accent-foreground" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold font-display text-foreground">Webhook Make.com</h3>
                  <p className="text-sm text-muted-foreground">Integração via webhook para automações</p>
                </div>
                <Badge variant={webhook.status === 'ativo' ? 'default' : webhook.status === 'erro' ? 'destructive' : 'secondary'} className="capitalize">
                  {webhook.status === 'ativo' ? '✅ Ativo' : webhook.status === 'erro' ? '❌ Erro' : '⏸ Inativo'}
                </Badge>
              </div>
              <div className="space-y-4">
                <div>
                  <Label>URL do Webhook</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      placeholder="https://hook.us2.make.com/..."
                      value={webhookUrl}
                      onChange={e => setWebhookUrl(e.target.value)}
                      disabled={!webhookEditing}
                      className="flex-1"
                    />
                    {!webhookEditing && (
                      <Button variant="outline" size="icon" onClick={() => setWebhookEditing(true)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    className="gradient-primary text-primary-foreground flex-1"
                    disabled={!webhookUrl.trim()}
                    onClick={() => {
                      updateConfiguracoes({ webhook: { url: webhookUrl.trim(), ativo: true, status: 'ativo' } });
                      setWebhookEditing(false);
                      toast.success('Webhook salvo com sucesso!');
                    }}
                  >
                    Salvar Webhook
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!webhook.url || webhookTesting}
                    onClick={async () => {
                      setWebhookTesting(true);
                      try {
                        const { data, error } = await supabase.functions.invoke('webhook-notify', {
                          body: {
                            evento: 'teste',
                            paciente_nome: 'Teste do Sistema',
                            telefone: '(00) 00000-0000',
                            email: 'teste@teste.com',
                            data_consulta: new Date().toLocaleDateString('pt-BR'),
                            hora_consulta: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                            unidade: 'Unidade Teste',
                            profissional: 'Profissional Teste',
                            tipo_atendimento: 'Teste de Webhook',
                            status_agendamento: 'teste',
                            id_agendamento: 'teste-' + Date.now(),
                          },
                        });
                        if (error) throw error;
                        updateConfiguracoes({ webhook: { ...webhook, url: webhookUrl.trim(), ativo: true, status: 'ativo' } });
                        toast.success('Webhook testado com sucesso!');
                      } catch (err) {
                        updateConfiguracoes({ webhook: { ...webhook, status: 'erro' } });
                        toast.error('Erro ao testar webhook.');
                      } finally {
                        setWebhookTesting(false);
                      }
                    }}
                  >
                    {webhookTesting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                    Testar
                  </Button>
                </div>
                {webhook.ativo && (
                  <Button
                    variant="ghost"
                    className="w-full text-destructive"
                    onClick={() => {
                      updateConfiguracoes({ webhook: { url: '', ativo: false, status: 'inativo' } });
                      setWebhookUrl('');
                      setWebhookEditing(true);
                      toast.info('Webhook desativado.');
                    }}
                  >
                    Desativar Webhook
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  Eventos enviados: novo agendamento, reagendamento, cancelamento, falta, confirmação, fila de espera e atendimento finalizado.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Gmail SMTP */}
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-destructive" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold font-display text-foreground">Gmail SMTP</h3>
                  <p className="text-sm text-muted-foreground">Envio de e-mails via Gmail</p>
                </div>
                <div className="flex items-center gap-2">
                  {gmailStatus === 'conectado' && (
                    <Badge className="bg-success/10 text-success border-0">✅ Conectado</Badge>
                  )}
                  {gmailStatus === 'erro_autenticacao' && (
                    <Badge variant="destructive">❌ Erro auth</Badge>
                  )}
                  {gmailStatus === 'erro_conexao' && (
                    <Badge variant="destructive">❌ Erro conexão</Badge>
                  )}
                  {gmailStatus === 'erro_envio' && (
                    <Badge variant="destructive">❌ Erro envio</Badge>
                  )}
                  {gmailStatus === 'nao_configurado' && (
                    <Badge variant="secondary">⚠️ Não configurado</Badge>
                  )}
                  {gmailStatus === 'idle' && configuracoes.gmail?.ativo && configuracoes.gmail?.email && configuracoes.gmail?.senhaApp && (
                    <Badge variant="secondary">⚙️ Configurado</Badge>
                  )}
                  {gmailStatus === 'idle' && (!configuracoes.gmail?.ativo || !configuracoes.gmail?.email) && (
                    <Badge variant="outline">Desativado</Badge>
                  )}
                  <Switch checked={configuracoes.gmail?.ativo || false} onCheckedChange={v => updateConfiguracoes({ gmail: { ...configuracoes.gmail!, ativo: v } })} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>E-mail remetente</Label>
                  <Input placeholder="seuemail@gmail.com" value={configuracoes.gmail?.email || ''} onChange={e => updateConfiguracoes({ gmail: { ...configuracoes.gmail!, email: e.target.value } })} />
                </div>
                <div>
                  <Label>Senha de Aplicativo</Label>
                  <Input type="password" placeholder="Senha de app do Google" value={configuracoes.gmail?.senhaApp || ''} onChange={e => updateConfiguracoes({ gmail: { ...configuracoes.gmail!, senhaApp: e.target.value } })} />
                  <p className="text-xs text-muted-foreground mt-1">Gere em myaccount.google.com → Segurança → Senhas de app</p>
                </div>
                <div>
                  <Label>Servidor SMTP</Label>
                  <Input value={configuracoes.gmail?.smtpHost || 'smtp.gmail.com'} onChange={e => updateConfiguracoes({ gmail: { ...configuracoes.gmail!, smtpHost: e.target.value } })} />
                </div>
                <div>
                  <Label>Porta</Label>
                  <Input type="number" value={configuracoes.gmail?.smtpPort || 587} onChange={e => updateConfiguracoes({ gmail: { ...configuracoes.gmail!, smtpPort: parseInt(e.target.value) || 587 } })} />
                </div>
              </div>

              {gmailMessage && (
                <div className={`mt-4 p-3 rounded-lg text-sm flex items-start gap-2 ${
                  gmailStatus === 'conectado' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
                }`}>
                  {gmailStatus === 'conectado' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                  <span>{gmailMessage}</span>
                </div>
              )}

              <div className="flex gap-2 mt-4">
                <Button
                  className="gradient-primary text-primary-foreground flex-1"
                  disabled={!configuracoes.gmail?.email || !configuracoes.gmail?.senhaApp}
                  onClick={async () => {
                    const gmailData = {
                      ...configuracoes.gmail!,
                      ativo: true,
                      smtpHost: configuracoes.gmail?.smtpHost || 'smtp.gmail.com',
                      smtpPort: configuracoes.gmail?.smtpPort || 587,
                    };
                    const currentCanal = configuracoes.canalNotificacao || 'webhook';
                    const newCanal = currentCanal === 'webhook' ? 'ambos' : currentCanal;
                    updateConfiguracoes({ gmail: gmailData, canalNotificacao: newCanal });
                    if (currentCanal === 'webhook') {
                      toast.success('Gmail salvo! Canal alterado para "Ambos" automaticamente.');
                    } else {
                      toast.success('Configurações Gmail salvas!');
                    }
                    setGmailTesting(true);
                    setGmailMessage('');
                    const result = await testGmail();
                    setGmailStatus(result.status as any);
                    setGmailMessage(result.message);
                    setGmailTesting(false);
                    if (result.success) {
                      toast.success('Gmail SMTP verificado com sucesso!');
                    } else {
                      toast.error(`Erro Gmail: ${result.message}`);
                    }
                  }}
                >
                  {gmailTesting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  Salvar Gmail
                </Button>
                <Button
                  variant="outline"
                  disabled={!configuracoes.gmail?.ativo || !configuracoes.gmail?.email || !configuracoes.gmail?.senhaApp || gmailTesting}
                  onClick={async () => {
                    setGmailTesting(true);
                    setGmailMessage('');
                    const result = await testGmail();
                    setGmailStatus(result.status as any);
                    setGmailMessage(result.message);
                    setGmailTesting(false);
                    if (result.success) {
                      toast.success('E-mail de teste enviado com sucesso!');
                    } else {
                      toast.error(`Falha no teste: ${result.message}`);
                    }
                  }}
                >
                  {gmailTesting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                  Testar Gmail
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                O teste enviará um e-mail real para o endereço remetente configurado.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ ABA ATENDIMENTO ═══ */}
        <TabsContent value="atendimento" className="space-y-4 mt-4">
          {/* Fila de Espera */}
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

          {/* Triagem de Enfermagem */}
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <HeartPulse className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold font-display text-foreground">Triagem de Enfermagem</h3>
                  <p className="text-sm text-muted-foreground">Etapa opcional antes do atendimento</p>
                </div>
                {triageLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Switch
                    checked={triageEnabled}
                    onCheckedChange={async (v) => {
                      setTriageEnabled(v);
                      try {
                        const unitId = user?.unidadeId || null;
                        if (triageSettingId) {
                          const { error } = await supabase
                            .from('triage_settings')
                            .update({ enabled: v, updated_at: new Date().toISOString() })
                            .eq('id', triageSettingId);
                          if (error) throw error;
                        } else {
                          const { data: inserted, error } = await supabase
                            .from('triage_settings')
                            .insert({ enabled: v, unidade_id: unitId, profissional_id: null })
                            .select('id')
                            .single();
                          if (error) throw error;
                          if (inserted) setTriageSettingId(inserted.id);
                        }
                        toast.success(v ? 'Triagem habilitada!' : 'Triagem desabilitada.');
                      } catch (err) {
                        console.error('Erro ao salvar triagem:', err);
                        setTriageEnabled(!v);
                        toast.error('Erro ao salvar configuração de triagem.');
                      }
                    }}
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Quando habilitada, ao confirmar a chegada do paciente na recepção, ele será encaminhado primeiro para triagem
                por um Técnico de Enfermagem antes de ir para o atendimento com o profissional.
              </p>
              {triageEnabled && (
                <div className="mt-3 p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                  <strong className="text-foreground">Técnicos cadastrados:</strong>{' '}
                  {funcionarios.filter(f => f.role === 'tecnico' && f.ativo).length === 0
                    ? <span className="text-destructive">Nenhum técnico cadastrado. Cadastre um em Funcionários com perfil "Técnico de Enfermagem".</span>
                    : funcionarios.filter(f => f.role === 'tecnico' && f.ativo).map(f => f.nome).join(', ')
                  }
                </div>
              )}
            </CardContent>
          </Card>

          {/* Controle de Triagem por Profissional */}
          <ConfiguracaoTriagem />
        </TabsContent>

        {/* ═══ ABA PACIENTE ═══ */}
        <TabsContent value="paciente" className="space-y-4 mt-4">
          {/* Acesso do Paciente ao Portal */}
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-info/10 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-info" />
                </div>
                <div>
                  <h3 className="font-semibold font-display text-foreground">Acesso do Paciente</h3>
                  <p className="text-sm text-muted-foreground">Controle de acesso ao portal e envio de credenciais</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-foreground">Permitir acesso ao portal do paciente</span>
                    <p className="text-xs text-muted-foreground">Quando desativado, nenhum paciente consegue acessar o portal</p>
                  </div>
                  <Switch
                    checked={configuracoes.portalPaciente?.permitirPortal ?? true}
                    onCheckedChange={v => updateConfiguracoes({ portalPaciente: { ...configuracoes.portalPaciente!, permitirPortal: v, enviarSenhaAutomaticamente: configuracoes.portalPaciente?.enviarSenhaAutomaticamente ?? true, enviarLinkAcesso: configuracoes.portalPaciente?.enviarLinkAcesso ?? true, pacientesBloqueados: configuracoes.portalPaciente?.pacientesBloqueados ?? [] } })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-foreground">Enviar senha automaticamente por e-mail</span>
                    <p className="text-xs text-muted-foreground">Ao cadastrar paciente, envia login e senha temporária por e-mail</p>
                  </div>
                  <Switch
                    checked={configuracoes.portalPaciente?.enviarSenhaAutomaticamente ?? true}
                    onCheckedChange={v => updateConfiguracoes({ portalPaciente: { ...configuracoes.portalPaciente!, enviarSenhaAutomaticamente: v, permitirPortal: configuracoes.portalPaciente?.permitirPortal ?? true, enviarLinkAcesso: configuracoes.portalPaciente?.enviarLinkAcesso ?? true, pacientesBloqueados: configuracoes.portalPaciente?.pacientesBloqueados ?? [] } })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-foreground">Enviar link de acesso ao portal</span>
                    <p className="text-xs text-muted-foreground">Inclui link do portal no e-mail de credenciais</p>
                  </div>
                  <Switch
                    checked={configuracoes.portalPaciente?.enviarLinkAcesso ?? true}
                    onCheckedChange={v => updateConfiguracoes({ portalPaciente: { ...configuracoes.portalPaciente!, enviarLinkAcesso: v, permitirPortal: configuracoes.portalPaciente?.permitirPortal ?? true, enviarSenhaAutomaticamente: configuracoes.portalPaciente?.enviarSenhaAutomaticamente ?? true, pacientesBloqueados: configuracoes.portalPaciente?.pacientesBloqueados ?? [] } })}
                  />
                </div>
                <div className="p-3 bg-muted rounded-lg text-xs text-muted-foreground">
                  <p><strong>Nota:</strong> Notificações de agendamento continuam funcionando independentemente destas configurações.</p>
                  <p className="mt-1">Para bloquear o acesso de um paciente específico, use o botão "Bloquear Portal" no cadastro individual.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Procedimentos Clínicos */}
          <GerenciarProcedimentos />
        </TabsContent>

        {/* ═══ ABA NOTIFICAÇÕES ═══ */}
        <TabsContent value="notificacoes" className="space-y-4 mt-4">
          {/* Canal de Notificação */}
          <Card className="shadow-card border-0 ring-2 ring-primary/20">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Send className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold font-display text-foreground">Canal de Notificação ao Paciente</h3>
                  <p className="text-sm text-muted-foreground">Define como o paciente recebe e-mails e notificações</p>
                </div>
              </div>
              <div>
                <Label className="font-medium">Canal ativo para envio</Label>
                <Select value={configuracoes.canalNotificacao || 'webhook'} onValueChange={v => updateConfiguracoes({ canalNotificacao: v as any })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="webhook">Apenas Webhook (Make.com)</SelectItem>
                    <SelectItem value="gmail">Apenas Gmail SMTP (e-mail direto)</SelectItem>
                    <SelectItem value="ambos">Ambos (Webhook + Gmail)</SelectItem>
                  </SelectContent>
                </Select>

                {configuracoes.gmail?.ativo && configuracoes.gmail?.email && configuracoes.gmail?.senhaApp && (configuracoes.canalNotificacao || 'webhook') === 'webhook' && (
                  <div className="mt-3 p-3 bg-warning/10 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-warning">Gmail configurado mas NÃO ativo como canal</p>
                      <p className="text-muted-foreground text-xs mt-1">O canal está definido como "Apenas Webhook". Para enviar e-mails via Gmail, mude para "Apenas Gmail SMTP" ou "Ambos".</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 text-xs"
                        onClick={() => {
                          updateConfiguracoes({ canalNotificacao: 'ambos' });
                          toast.success('Canal alterado para Ambos (Webhook + Gmail)!');
                        }}
                      >
                        Ativar Gmail + Webhook agora
                      </Button>
                    </div>
                  </div>
                )}

                {(configuracoes.canalNotificacao === 'gmail' || configuracoes.canalNotificacao === 'ambos') && (!configuracoes.gmail?.ativo || !configuracoes.gmail?.email || !configuracoes.gmail?.senhaApp) && (
                  <div className="mt-3 p-3 bg-destructive/10 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                    <p className="text-sm text-destructive">Gmail selecionado como canal mas não está configurado. Configure o Gmail SMTP na aba Integrações.</p>
                  </div>
                )}

                <p className="text-xs text-muted-foreground mt-2">Se o webhook falhar e o canal for "Ambos", o Gmail envia automaticamente como fallback.</p>
              </div>
            </CardContent>
          </Card>

          {/* Templates */}
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <h3 className="font-semibold font-display text-foreground">Templates de Mensagem</h3>
                  <p className="text-sm text-muted-foreground">Personalizar mensagens automáticas</p>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <Label>Confirmação de Agendamento</Label>
                  <textarea className="w-full border rounded-lg p-3 text-sm bg-background text-foreground min-h-[80px] border-border"
                    value={templates.confirmacao}
                    onChange={e => updateConfiguracoes({ templates: { ...templates, confirmacao: e.target.value } })} />
                </div>
                <div>
                  <Label>Lembrete</Label>
                  <textarea className="w-full border rounded-lg p-3 text-sm bg-background text-foreground min-h-[80px] border-border"
                    value={templates.lembrete}
                    onChange={e => updateConfiguracoes({ templates: { ...templates, lembrete: e.target.value } })} />
                </div>
                <p className="text-xs text-muted-foreground">Variáveis: {'{nome}'}, {'{data}'}, {'{hora}'}, {'{unidade}'}, {'{endereco}'}, {'{profissional}'}, {'{setor}'}</p>
                <Button className="gradient-primary text-primary-foreground" onClick={() => toast.success('Templates salvos!')}>Salvar Templates</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ ABA PRONTUÁRIO (MASTER) ═══ */}
        {isMaster && (
          <TabsContent value="prontuario" className="space-y-4 mt-4">
            <EditorProntuarioConfig />
          </TabsContent>
        )}

        {/* ═══ ABA DOCUMENTOS (MASTER) ═══ */}
        {isMaster && (
          <TabsContent value="documentos" className="space-y-4 mt-4">
            <ModelosDocumentos />
          </TabsContent>
        )}

        {/* ═══ ABA ADMINISTRAÇÃO (MASTER) ═══ */}
        {isMaster && (
          <TabsContent value="admin" className="space-y-4 mt-4">
            {/* CONFIG 1 — Reativar Iniciar Atendimento */}
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

                {/* ETAPA 1 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5">Etapa 1</Badge>
                    <Label className="text-[13px] font-bold text-foreground/80">Selecionar Profissional</Label>
                  </div>
                  <Select value={reativarProfId} onValueChange={v => { setReativarProfId(v); setReativarAgId(''); buscarAgendamentosReativar(v); }}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Selecione o profissional" /></SelectTrigger>
                    <SelectContent>
                      {profissionaisAtivos.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.nome} — {p.profissao || p.role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Info className="w-3 h-3" /> Selecione o profissional cujo agendamento precisa ser reativado</p>
                </div>

                {reativarBuscando && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="w-4 h-4 animate-spin" /> Buscando agendamentos...</div>
                )}

                {reativarProfId && !reativarBuscando && reativarAgendamentos.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4">Nenhum agendamento encontrado para este profissional.</p>
                )}

                {reativarProfId && !reativarBuscando && reativarAgendamentos.length > 0 && (
                  <>
                    <Separator className="my-5" />
                    {/* ETAPA 2 */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5">Etapa 2</Badge>
                        <Label className="text-[13px] font-bold text-foreground/80">Selecionar Agendamento</Label>
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><Info className="w-3 h-3" /> Clique na linha do agendamento que deseja reativar</p>
                      <div className="border rounded-lg overflow-hidden max-h-[280px] overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead className="text-xs font-semibold">Paciente</TableHead>
                              <TableHead className="text-xs font-semibold w-[100px]">Data</TableHead>
                              <TableHead className="text-xs font-semibold w-[80px]">Horário</TableHead>
                              <TableHead className="text-xs font-semibold w-[110px]">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {reativarAgendamentos.map(ag => (
                              <TableRow
                                key={ag.id}
                                className={`cursor-pointer transition-colors hover:bg-primary/5 ${reativarAgId === ag.id ? 'bg-primary/10 ring-1 ring-primary/30' : ''}`}
                                onClick={() => setReativarAgId(ag.id)}
                              >
                                <TableCell className="text-sm font-medium py-2">{ag.paciente_nome}</TableCell>
                                <TableCell className="text-sm py-2">{ag.data ? new Date(ag.data + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</TableCell>
                                <TableCell className="text-sm py-2">{ag.hora?.slice(0, 5) || '-'}</TableCell>
                                <TableCell className="py-2">
                                  <Badge variant="outline" className={`text-xs capitalize ${ag.status === 'confirmado' ? 'border-green-500 text-green-700 bg-green-50' : ag.status === 'pendente' ? 'border-yellow-500 text-yellow-700 bg-yellow-50' : 'border-border text-muted-foreground'}`}>
                                    {ag.status}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </>
                )}

                {reativarAgId && (() => {
                  const ag = reativarAgendamentos.find(a => a.id === reativarAgId);
                  if (!ag) return null;
                  return (
                    <>
                      <Separator className="my-5" />
                      {/* ETAPA 3 */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5">Etapa 3</Badge>
                          <Label className="text-[13px] font-bold text-foreground/80">Confirmar Reativação</Label>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3 text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="flex items-center gap-1"><User className="w-3.5 h-3.5 text-muted-foreground" /> <strong>{ag.paciente_nome}</strong></span>
                          <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5 text-muted-foreground" /> {ag.data ? new Date(ag.data + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</span>
                          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-muted-foreground" /> {ag.hora?.slice(0, 5)}</span>
                          <span className="text-muted-foreground">Status: <strong>{ag.status}</strong></span>
                        </div>
                        <Button
                          className="gradient-primary text-primary-foreground w-full"
                          disabled={reativarLoading}
                          onClick={executarReativar}
                        >
                          {reativarLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Reativar Atendimento
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Altera o status para "apto_atendimento", permitindo que o profissional inicie o atendimento normalmente.
                        </p>
                      </div>
                    </>
                  );
                })()}
              </CardContent>
            </Card>

            {/* CONFIG 2 — Transferir Paciente */}
            <Card className="shadow-card border border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-info/10 flex items-center justify-center">
                    <ArrowRightLeft className="w-5 h-5 text-info" />
                  </div>
                  <div>
                    <h3 className="font-semibold font-display text-foreground">Transferir Paciente de Profissional</h3>
                    <p className="text-sm text-muted-foreground">Reatribui agendamento para outro profissional</p>
                  </div>
                </div>

                {/* ETAPA 1 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5">Etapa 1</Badge>
                    <Label className="text-[13px] font-bold text-foreground/80">Profissional de Origem</Label>
                  </div>
                  <Select value={transferProfOrigem} onValueChange={v => { setTransferProfOrigem(v); setTransferAgId(''); setTransferNovoProfId(''); setTransferMotivo(''); buscarAgendamentosTransferir(v); }}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Selecione o profissional atual" /></SelectTrigger>
                    <SelectContent>
                      {profissionaisAtivos.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.nome} — {p.profissao || p.role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Info className="w-3 h-3" /> Selecione o profissional que possui o agendamento</p>
                </div>

                {transferBuscando && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="w-4 h-4 animate-spin" /> Buscando agendamentos...</div>
                )}

                {transferProfOrigem && !transferBuscando && transferAgendamentos.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4">Nenhum agendamento encontrado para este profissional.</p>
                )}

                {transferProfOrigem && !transferBuscando && transferAgendamentos.length > 0 && (
                  <>
                    <Separator className="my-5" />
                    {/* ETAPA 2 */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5">Etapa 2</Badge>
                        <Label className="text-[13px] font-bold text-foreground/80">Selecionar Agendamento</Label>
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><Info className="w-3 h-3" /> Clique na linha do agendamento que deseja transferir</p>
                      <div className="border rounded-lg overflow-hidden max-h-[280px] overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead className="text-xs font-semibold">Paciente</TableHead>
                              <TableHead className="text-xs font-semibold w-[100px]">Data</TableHead>
                              <TableHead className="text-xs font-semibold w-[80px]">Horário</TableHead>
                              <TableHead className="text-xs font-semibold w-[110px]">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {transferAgendamentos.map(ag => (
                              <TableRow
                                key={ag.id}
                                className={`cursor-pointer transition-colors hover:bg-primary/5 ${transferAgId === ag.id ? 'bg-primary/10 ring-1 ring-primary/30' : ''}`}
                                onClick={() => { setTransferAgId(ag.id); setTransferNovoProfId(''); setTransferMotivo(''); }}
                              >
                                <TableCell className="text-sm font-medium py-2">{ag.paciente_nome}</TableCell>
                                <TableCell className="text-sm py-2">{ag.data ? new Date(ag.data + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</TableCell>
                                <TableCell className="text-sm py-2">{ag.hora?.slice(0, 5) || '-'}</TableCell>
                                <TableCell className="py-2">
                                  <Badge variant="outline" className={`text-xs capitalize ${ag.status === 'confirmado' ? 'border-green-500 text-green-700 bg-green-50' : ag.status === 'pendente' ? 'border-yellow-500 text-yellow-700 bg-yellow-50' : 'border-border text-muted-foreground'}`}>
                                    {ag.status}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </>
                )}

                {transferAgId && (() => {
                  const ag = transferAgendamentos.find(a => a.id === transferAgId);
                  if (!ag) return null;
                  return (
                    <>
                      <Separator className="my-5" />
                      {/* ETAPA 3 */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5">Etapa 3</Badge>
                          <Label className="text-[13px] font-bold text-foreground/80">Configurar Transferência</Label>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3 text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="flex items-center gap-1"><User className="w-3.5 h-3.5 text-muted-foreground" /> <strong>{ag.paciente_nome}</strong></span>
                          <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5 text-muted-foreground" /> {ag.data ? new Date(ag.data + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</span>
                          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-muted-foreground" /> {ag.hora?.slice(0, 5)}</span>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-[13px] font-bold text-foreground/80">Novo Profissional</Label>
                          <Select value={transferNovoProfId} onValueChange={setTransferNovoProfId}>
                            <SelectTrigger className="w-full"><SelectValue placeholder="Selecione o novo profissional" /></SelectTrigger>
                            <SelectContent>
                              {profissionaisAtivos.filter(p => p.id !== transferProfOrigem).map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.nome} — {p.profissao || p.role}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-[13px] font-bold text-foreground/80">Motivo da transferência <span className="text-destructive">*</span></Label>
                          <Input
                            placeholder="Ex: Profissional de férias, erro no agendamento..."
                            value={transferMotivo}
                            onChange={e => setTransferMotivo(e.target.value)}
                          />
                        </div>

                        <Button
                          className="gradient-primary text-primary-foreground w-full"
                          disabled={!transferNovoProfId || !transferMotivo.trim() || transferLoading}
                          onClick={executarTransferencia}
                        >
                          {transferLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                          <ArrowRightLeft className="w-4 h-4 mr-2" />
                          Transferir Paciente
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          O motivo será registrado nas observações do agendamento para fins de auditoria.
                        </p>
                      </div>
                    </>
                  );
                })()}
              </CardContent>
            </Card>

            {/* CONFIG 3 — Agendamento Online */}
            <Card className="shadow-card border border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                    <Globe className="w-5 h-5 text-success" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold font-display text-foreground">Agendamento Online (Controle)</h3>
                    <p className="text-sm text-muted-foreground">Regras para agendamento pelo portal do paciente</p>
                  </div>
                  {agOnlineLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <Switch checked={agOnline.habilitado} onCheckedChange={v => setAgOnline(prev => ({ ...prev, habilitado: v }))} />
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-bold text-foreground/80">Antecedência mínima (dias)</Label>
                    <Input type="number" min={0} value={agOnline.antecedencia_minima_dias} onChange={e => setAgOnline(prev => ({ ...prev, antecedencia_minima_dias: parseInt(e.target.value) || 0 }))} />
                    <p className="text-xs text-muted-foreground">Ex: 1 = paciente agenda com pelo menos 1 dia de antecedência</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-bold text-foreground/80">Antecedência máxima (dias)</Label>
                    <Input type="number" min={1} value={agOnline.antecedencia_maxima_dias} onChange={e => setAgOnline(prev => ({ ...prev, antecedencia_maxima_dias: parseInt(e.target.value) || 30 }))} />
                    <p className="text-xs text-muted-foreground">Ex: 30 = paciente pode agendar até 30 dias à frente</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-bold text-foreground/80">Limite por dia por profissional</Label>
                    <Input type="number" min={1} value={agOnline.limite_por_dia_profissional} onChange={e => setAgOnline(prev => ({ ...prev, limite_por_dia_profissional: parseInt(e.target.value) || 5 }))} />
                    <p className="text-xs text-muted-foreground">Máximo de agendamentos online por profissional/dia</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-bold text-foreground/80">Confirmação por SMS/WhatsApp</Label>
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm text-muted-foreground">Exigir confirmação antes de confirmar vaga</span>
                      <Switch checked={agOnline.exigir_confirmacao_sms} onCheckedChange={v => setAgOnline(prev => ({ ...prev, exigir_confirmacao_sms: v }))} />
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-1.5">
                  <Label className="text-[13px] font-bold text-foreground/80">Mensagem de confirmação para o paciente</Label>
                  <textarea
                    className="w-full border rounded-lg p-3 text-sm bg-background text-foreground min-h-[80px] border-border"
                    value={agOnline.mensagem_confirmacao}
                    onChange={e => setAgOnline(prev => ({ ...prev, mensagem_confirmacao: e.target.value }))}
                    placeholder="Mensagem exibida ao paciente ao confirmar agendamento"
                  />
                </div>

                <Separator className="my-4" />

                <div className="space-y-2">
                  <Label className="text-[13px] font-bold text-foreground/80">Profissionais com agendamento online bloqueado</Label>
                  <p className="text-xs text-muted-foreground">Profissionais marcados não receberão agendamentos pelo portal</p>
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

                <Button className="gradient-primary text-primary-foreground w-full mt-4" disabled={agOnlineSaving} onClick={saveAgOnline}>
                  {agOnlineSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Salvar Configurações de Agendamento Online
                </Button>
              </CardContent>
            </Card>

            {/* CONFIG 4 — Controle de Cancelamentos */}
            <Card className="shadow-card border border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                    <Ban className="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <h3 className="font-semibold font-display text-foreground">Controle de Cancelamentos</h3>
                    <p className="text-sm text-muted-foreground">Regras e penalidades para cancelamentos de agendamentos</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-bold text-foreground/80">Prazo mínimo sem penalidade (horas)</Label>
                    <Input type="number" min={0} value={cancelConfig.prazo_minimo_horas} onChange={e => setCancelConfig(prev => ({ ...prev, prazo_minimo_horas: parseInt(e.target.value) || 0 }))} />
                    <p className="text-xs text-muted-foreground">Ex: 24 = cancelar até 24h antes sem penalidade</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-bold text-foreground/80">Limite de cancelamentos/mês</Label>
                    <Input type="number" min={1} value={cancelConfig.limite_cancelamentos_mes} onChange={e => setCancelConfig(prev => ({ ...prev, limite_cancelamentos_mes: parseInt(e.target.value) || 3 }))} />
                    <p className="text-xs text-muted-foreground">Máximo por paciente por mês</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-bold text-foreground/80">Dias de bloqueio ao atingir limite</Label>
                    <Input type="number" min={0} value={cancelConfig.dias_bloqueio_apos_limite} onChange={e => setCancelConfig(prev => ({ ...prev, dias_bloqueio_apos_limite: parseInt(e.target.value) || 0 }))} />
                    <p className="text-xs text-muted-foreground">Paciente fica impedido de agendar por X dias</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <span className="text-sm font-medium text-foreground">Notificar profissional ao cancelar</span>
                      <p className="text-xs text-muted-foreground">Envia notificação ao profissional</p>
                    </div>
                    <Switch checked={cancelConfig.notificar_profissional} onCheckedChange={v => setCancelConfig(prev => ({ ...prev, notificar_profissional: v }))} />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <span className="text-sm font-medium text-foreground">Liberar vaga automaticamente</span>
                      <p className="text-xs text-muted-foreground">Vaga fica disponível imediatamente</p>
                    </div>
                    <Switch checked={cancelConfig.liberar_vaga_automaticamente} onCheckedChange={v => setCancelConfig(prev => ({ ...prev, liberar_vaga_automaticamente: v }))} />
                  </div>
                </div>

                <Separator className="my-4" />

                <div className="space-y-2">
                  <Label className="text-[13px] font-bold text-foreground/80">Motivos de cancelamento obrigatórios</Label>
                  <p className="text-xs text-muted-foreground">Paciente/recepção deve selecionar um motivo ao cancelar</p>
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
                    <Input
                      placeholder="Novo motivo..."
                      value={novoMotivo}
                      onChange={e => setNovoMotivo(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && novoMotivo.trim()) {
                          setCancelConfig(prev => ({ ...prev, motivos: [...prev.motivos, novoMotivo.trim()] }));
                          setNovoMotivo('');
                        }
                      }}
                    />
                    <Button variant="outline" size="icon" disabled={!novoMotivo.trim()} onClick={() => {
                      setCancelConfig(prev => ({ ...prev, motivos: [...prev.motivos, novoMotivo.trim()] }));
                      setNovoMotivo('');
                    }}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <Button className="gradient-primary text-primary-foreground w-full mt-4" disabled={cancelSaving} onClick={saveCancelConfig}>
                  {cancelSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Salvar Regras de Cancelamento
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default Configuracoes;
