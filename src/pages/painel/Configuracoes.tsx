import React, { useEffect, useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Calendar, QrCode, Settings as SettingsIcon, Loader2, CheckCircle2, XCircle, Webhook, Send, Pencil, Mail, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useWebhookNotify } from '@/hooks/useWebhookNotify';

const Configuracoes: React.FC = () => {
  const { configuracoes, updateConfiguracoes } = useData();
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
          <div className="space-y-4">
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
            <div><Label>API Token</Label><Input type="password" placeholder="Cole o token aqui" value={whatsapp.token} onChange={e => updateWhatsapp({ token: e.target.value })} /></div>
            <div><Label>Número de Envio</Label><Input placeholder="5593999990000" value={whatsapp.numero} onChange={e => updateWhatsapp({ numero: e.target.value })} /></div>
            
            <div className="p-4 bg-muted rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <QrCode className="w-5 h-5 text-foreground" />
                <span className="font-medium text-sm text-foreground">QR Code WhatsApp</span>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Escaneie o QR Code para conectar. Requer Lovable Cloud ativo para funcionar.
              </p>
              <div className="w-40 h-40 bg-background rounded-lg border-2 border-dashed border-border flex items-center justify-center">
                <span className="text-xs text-muted-foreground">QR Code aparecerá aqui</span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium text-sm text-foreground">Notificações automáticas</h4>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Confirmação de agendamento</span><Switch checked={whatsapp.notificacoes.confirmacao} onCheckedChange={v => updateNotificacoes({ confirmacao: v })} /></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Lembrete 24h antes</span><Switch checked={whatsapp.notificacoes.lembrete24h} onCheckedChange={v => updateNotificacoes({ lembrete24h: v })} /></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Lembrete 2h antes</span><Switch checked={whatsapp.notificacoes.lembrete2h} onCheckedChange={v => updateNotificacoes({ lembrete2h: v })} /></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Aviso de remarcação</span><Switch checked={whatsapp.notificacoes.remarcacao} onCheckedChange={v => updateNotificacoes({ remarcacao: v })} /></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Aviso de cancelamento</span><Switch checked={whatsapp.notificacoes.cancelamento} onCheckedChange={v => updateNotificacoes({ cancelamento: v })} /></div>
            </div>
            <Button className="gradient-primary text-primary-foreground w-full" onClick={() => toast.success('Configurações de WhatsApp salvas!')}>Salvar WhatsApp</Button>
          </div>
        </CardContent>
      </Card>

      {/* Google Calendar - Now with real OAuth */}
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
            <div className="space-y-2">
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Criar evento ao agendar</span><Switch checked={googleCalendar.criarEvento} onCheckedChange={v => updateGoogle({ criarEvento: v })} /></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Atualizar ao remarcar</span><Switch checked={googleCalendar.atualizarRemarcar} onCheckedChange={v => updateGoogle({ atualizarRemarcar: v })} /></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Remover ao cancelar</span><Switch checked={googleCalendar.removerCancelar} onCheckedChange={v => updateGoogle({ removerCancelar: v })} /></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Enviar comprovante por e-mail</span><Switch checked={googleCalendar.enviarEmail} onCheckedChange={v => updateGoogle({ enviarEmail: v })} /></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Queue Settings */}
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
          <div className="space-y-4">
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
                    toast.success('Webhook testado com sucesso! Verifique seu cenário no Make.com.');
                  } catch (err) {
                    updateConfiguracoes({ webhook: { ...webhook, status: 'erro' } });
                    toast.error('Erro ao testar webhook. Verifique a URL e se o cenário está ativo no Make.com.');
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
              Payload padronizado com todos os dados do paciente, profissional, unidade e status.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Canal de Notificação */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-info/10 flex items-center justify-center">
              <Send className="w-5 h-5 text-info" />
            </div>
            <div>
              <h3 className="font-semibold font-display text-foreground">Canal de Notificação</h3>
              <p className="text-sm text-muted-foreground">Escolha como enviar notificações</p>
            </div>
          </div>
          <div>
            <Label>Canal preferido</Label>
            <Select value={configuracoes.canalNotificacao || 'webhook'} onValueChange={v => updateConfiguracoes({ canalNotificacao: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="webhook">Apenas Webhook (Make.com)</SelectItem>
                <SelectItem value="gmail">Apenas Gmail SMTP</SelectItem>
                <SelectItem value="ambos">Ambos (Webhook + Gmail)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">Se o webhook falhar e o canal for "Ambos", o sistema usará Gmail como fallback automaticamente.</p>
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
                <Badge variant="destructive">❌ Erro de autenticação</Badge>
              )}
              {gmailStatus === 'erro_conexao' && (
                <Badge variant="destructive">❌ Erro de conexão</Badge>
              )}
              {gmailStatus === 'erro_envio' && (
                <Badge variant="destructive">❌ Erro de envio</Badge>
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
          <div className="space-y-4">
            <div>
              <Label>E-mail remetente</Label>
              <Input placeholder="seuemail@gmail.com" value={configuracoes.gmail?.email || ''} onChange={e => updateConfiguracoes({ gmail: { ...configuracoes.gmail!, email: e.target.value } })} />
            </div>
            <div>
              <Label>Senha de Aplicativo</Label>
              <Input type="password" placeholder="Senha de app do Google" value={configuracoes.gmail?.senhaApp || ''} onChange={e => updateConfiguracoes({ gmail: { ...configuracoes.gmail!, senhaApp: e.target.value } })} />
              <p className="text-xs text-muted-foreground mt-1">Gere uma senha de aplicativo em myaccount.google.com → Segurança → Senhas de app</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
              <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${
                gmailStatus === 'conectado' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
              }`}>
                {gmailStatus === 'conectado' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                <span>{gmailMessage}</span>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                className="gradient-primary text-primary-foreground flex-1"
                disabled={!configuracoes.gmail?.email || !configuracoes.gmail?.senhaApp}
                onClick={async () => {
                  updateConfiguracoes({ gmail: { ...configuracoes.gmail! } });
                  toast.success('Configurações Gmail salvas!');
                  // Auto-test after save
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
                    toast.success('E-mail de teste enviado com sucesso! Verifique sua caixa de entrada.');
                  } else {
                    toast.error(`Falha no teste: ${result.message}`);
                  }
                }}
              >
                {gmailTesting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                Testar Gmail
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              O teste enviará um e-mail real para o endereço remetente configurado, verificando conexão, autenticação e envio.
            </p>
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
};

export default Configuracoes;
