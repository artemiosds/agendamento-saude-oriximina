// WebhookUrlCard — Fase 3 hardening (cont.)
// Exibe a URL fixa do webhook receiver para o usuário colar no painel
// do UazapiGO / Evolution. Read-only + botão de copiar.
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Webhook, Copy } from 'lucide-react';
import { toast } from 'sonner';

const WEBHOOK_URL = 'https://ygbgywglxsshkkoiriul.supabase.co/functions/v1/whatsapp-webhook-receiver';

export const WebhookUrlCard: React.FC = () => {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(WEBHOOK_URL);
      toast.success('URL copiada');
    } catch {
      toast.error('Não foi possível copiar — selecione manualmente.');
    }
  };
  return (
    <Card className="shadow-card border-0">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Webhook className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Webhook de respostas</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Configure esta URL no painel do <b>UazapiGO</b> em <i>Webhook Global</i> (ou no Evolution em <i>Webhook by Events</i>) para receber respostas,
          status de entrega e detectar opt-out automaticamente. Eventos suportados: <code>messages.upsert</code>, <code>messages.update</code>.
        </p>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label className="text-xs">URL do Webhook</Label>
            <Input readOnly value={WEBHOOK_URL} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          </div>
          <Button type="button" variant="outline" onClick={copy} className="gap-1">
            <Copy className="w-4 h-4" /> Copiar URL
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
export default WebhookUrlCard;
