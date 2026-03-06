import React from 'react';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { MessageSquare, Calendar, QrCode, Settings as SettingsIcon } from 'lucide-react';
import { toast } from 'sonner';

const Configuracoes: React.FC = () => {
  const { configuracoes, updateConfiguracoes } = useData();
  const { whatsapp, googleCalendar, filaEspera, templates } = configuracoes;

  const updateWhatsapp = (data: Partial<typeof whatsapp>) => {
    updateConfiguracoes({ whatsapp: { ...whatsapp, ...data } });
  };

  const updateNotificacoes = (data: Partial<typeof whatsapp.notificacoes>) => {
    updateConfiguracoes({ whatsapp: { ...whatsapp, notificacoes: { ...whatsapp.notificacoes, ...data } } });
  };

  const updateGoogle = (data: Partial<typeof googleCalendar>) => {
    updateConfiguracoes({ googleCalendar: { ...googleCalendar, ...data } });
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
            {googleCalendar.conectado ? (
              <span className="text-xs bg-success/10 text-success px-2 py-1 rounded-full font-medium">Conectado</span>
            ) : (
              <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full font-medium">Desconectado</span>
            )}
          </div>
          <div className="space-y-4">
            <Button variant="outline" className="w-full" onClick={() => toast.info('Para conectar o Google Agenda, ative o Lovable Cloud e configure as credenciais OAuth.')}>
              {googleCalendar.conectado ? 'Reconectar' : 'Conectar'} Google Agenda
            </Button>
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
    </div>
  );
};

export default Configuracoes;
