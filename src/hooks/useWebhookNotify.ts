import { supabase } from '@/integrations/supabase/client';

export interface WebhookPayload {
  evento: 'novo_agendamento' | 'reagendamento' | 'cancelamento' | 'nao_compareceu' | 'confirmacao' | 'fila_entrada' | 'fila_chamada' | 'vaga_liberada' | 'atendimento_finalizado' | 'lembrete_24h' | 'lembrete_1h' | 'teste';
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

async function getNotificationConfig(): Promise<{ canal: string; gmailAtivo: boolean }> {
  try {
    const { data } = await supabase
      .from('system_config')
      .select('configuracoes')
      .eq('id', 'default')
      .maybeSingle();
    const cfg = data?.configuracoes as any;
    return {
      canal: cfg?.canalNotificacao || 'webhook',
      gmailAtivo: cfg?.gmail?.ativo || false,
    };
  } catch {
    return { canal: 'webhook', gmailAtivo: false };
  }
}

export function useWebhookNotify() {
  const notify = async (payload: WebhookPayload) => {
    const config = await getNotificationConfig();
    const results: { webhook?: boolean; gmail?: boolean } = {};

    // Send webhook
    if (config.canal === 'webhook' || config.canal === 'ambos') {
      try {
        const { error } = await supabase.functions.invoke('webhook-notify', { body: payload });
        results.webhook = !error;
        if (error) console.error('Webhook error:', error);
      } catch (err) {
        console.error('Webhook failed:', err);
        results.webhook = false;
      }
    }

    // Send Gmail
    if (config.canal === 'gmail' || config.canal === 'ambos') {
      try {
        const { data, error } = await supabase.functions.invoke('send-email', { body: payload });
        results.gmail = !error && data?.success;
        if (error) console.error('Gmail error:', error);
      } catch (err) {
        console.error('Gmail failed:', err);
        results.gmail = false;
      }
    }

    // Fallback: if webhook failed and canal is 'ambos', Gmail already sent above
    // If canal is 'webhook' only and it failed, try Gmail as fallback if configured
    if (config.canal === 'webhook' && results.webhook === false && config.gmailAtivo) {
      try {
        const { data, error } = await supabase.functions.invoke('send-email', { body: payload });
        results.gmail = !error && data?.success;
        console.log('Gmail fallback:', results.gmail);
      } catch {
        results.gmail = false;
      }
    }

    return results.webhook || results.gmail || false;
  };

  const testGmail = async (): Promise<{ success: boolean; status: string; message: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          test_only: true,
          evento: 'teste',
          paciente_nome: 'Teste do Sistema',
          telefone: '(00) 00000-0000',
          email: 'teste@teste.com',
          data_consulta: new Date().toLocaleDateString('pt-BR'),
          hora_consulta: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          unidade: 'Unidade Teste',
          profissional: 'Profissional Teste',
          tipo_atendimento: 'Teste Gmail SMTP',
          status_agendamento: 'teste',
          id_agendamento: 'teste-gmail-' + Date.now(),
        },
      });
      if (error) {
        return { success: false, status: 'erro_envio', message: error.message || 'Erro ao testar Gmail' };
      }
      return {
        success: data?.success || false,
        status: data?.status || 'erro',
        message: data?.message || data?.error || 'Resposta inesperada',
      };
    } catch (err) {
      return {
        success: false,
        status: 'erro_conexao',
        message: err instanceof Error ? err.message : 'Erro desconhecido',
      };
    }
  };

  return { notify, testGmail };
}
