import { supabase } from '@/integrations/supabase/client';

export interface WebhookPayload {
  evento: 'novo_agendamento' | 'reagendamento' | 'cancelamento' | 'nao_compareceu' | 'confirmacao' | 'fila_entrada' | 'fila_chamada' | 'atendimento_finalizado' | 'teste';
  paciente_nome: string;
  telefone: string;
  email: string;
  data_consulta: string;
  hora_consulta: string;
  unidade: string;
  profissional: string;
  tipo_atendimento: string;
  status_agendamento: string;
  id_agendamento: string;
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
