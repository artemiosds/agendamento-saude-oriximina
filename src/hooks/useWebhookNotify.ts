import { supabase } from '@/integrations/supabase/client';

interface WebhookPayload {
  acao: 'novo_agendamento' | 'remarcacao' | 'cancelamento' | 'teste';
  nome: string;
  telefone: string;
  email: string;
  data: string;
  hora: string;
  unidade: string;
  profissional: string;
  tipo_atendimento: string;
  observacoes?: string;
}

export function useWebhookNotify() {
  const notify = async (payload: WebhookPayload) => {
    try {
      const { data, error } = await supabase.functions.invoke('webhook-notify', {
        body: payload,
      });

      if (error) {
        console.error('Webhook notification error:', error);
        return false;
      }

      console.log('Webhook notification sent:', data);
      return true;
    } catch (err) {
      console.error('Webhook notification failed:', err);
      return false;
    }
  };

  return { notify };
}
