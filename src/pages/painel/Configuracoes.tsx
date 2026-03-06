import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { MessageSquare, Calendar, QrCode, Settings as SettingsIcon } from 'lucide-react';

const Configuracoes: React.FC = () => {
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
            <div>
              <h3 className="font-semibold font-display text-foreground">WhatsApp Business</h3>
              <p className="text-sm text-muted-foreground">Notificações automáticas</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <Label>Provedor</Label>
              <Select defaultValue="zapi">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="360dialog">360dialog</SelectItem>
                  <SelectItem value="twilio">Twilio</SelectItem>
                  <SelectItem value="zapi">Z-API</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>API Token</Label><Input type="password" placeholder="Cole o token aqui" /></div>
            <div><Label>Número de Envio</Label><Input placeholder="5593999990000" /></div>
            
            <div className="p-4 bg-muted rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <QrCode className="w-5 h-5 text-foreground" />
                <span className="font-medium text-sm text-foreground">QR Code WhatsApp</span>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Escaneie o QR Code para conectar sua conta WhatsApp e enviar notificações automáticas.
              </p>
              <div className="w-40 h-40 bg-background rounded-lg border-2 border-dashed border-border flex items-center justify-center">
                <span className="text-xs text-muted-foreground">QR Code aparecerá aqui</span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium text-sm text-foreground">Notificações automáticas</h4>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Confirmação de agendamento</span><Switch defaultChecked /></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Lembrete 24h antes</span><Switch defaultChecked /></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Lembrete 2h antes</span><Switch /></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Aviso de remarcação</span><Switch defaultChecked /></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Aviso de cancelamento</span><Switch defaultChecked /></div>
            </div>
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
            <div>
              <h3 className="font-semibold font-display text-foreground">Google Agenda</h3>
              <p className="text-sm text-muted-foreground">Sincronizar agendamentos</p>
            </div>
          </div>
          <div className="space-y-4">
            <Button variant="outline" className="w-full">Conectar Google Agenda</Button>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Criar evento ao agendar</span><Switch defaultChecked /></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Atualizar ao remarcar</span><Switch defaultChecked /></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Remover ao cancelar</span><Switch defaultChecked /></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Enviar comprovante por e-mail</span><Switch defaultChecked /></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Templates */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
              <SettingsIcon className="w-5 h-5 text-warning" />
            </div>
            <div>
              <h3 className="font-semibold font-display text-foreground">Templates de Mensagem</h3>
              <p className="text-sm text-muted-foreground">Personalizar mensagens automáticas</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <Label>Confirmação de Agendamento</Label>
              <textarea className="w-full border rounded-lg p-3 text-sm bg-background text-foreground min-h-[80px]" defaultValue="Olá {nome}! Sua consulta foi agendada para {data} às {hora} na {unidade}. Profissional: {profissional}. Endereço: {endereco}" />
            </div>
            <div>
              <Label>Lembrete</Label>
              <textarea className="w-full border rounded-lg p-3 text-sm bg-background text-foreground min-h-[80px]" defaultValue="Lembrete: Sua consulta é amanhã, {data} às {hora} na {unidade} com {profissional}. Comprovante: {link_comprovante}" />
            </div>
            <p className="text-xs text-muted-foreground">Variáveis: {'{nome}'}, {'{data}'}, {'{hora}'}, {'{unidade}'}, {'{endereco}'}, {'{profissional}'}, {'{setor}'}, {'{link_comprovante}'}, {'{link_remarcar}'}</p>
            <Button className="gradient-primary text-primary-foreground">Salvar Templates</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Configuracoes;
