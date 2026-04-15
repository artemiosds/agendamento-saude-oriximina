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

interface NotificationConfig {
  canal: 'webhook' | 'gmail' | 'ambos';
  gmailAtivo: boolean;
  webhookAtivo: boolean;
  webhookUrl: string;
}

async function getNotificationConfig(): Promise<NotificationConfig> {
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
      webhookAtivo: cfg?.webhook?.ativo || false,
      webhookUrl: cfg?.webhook?.url || '',
    };
  } catch {
    return { canal: 'webhook', gmailAtivo: false, webhookAtivo: false, webhookUrl: '' };
  }
}

// Validate required fields before sending
function validatePayload(payload: WebhookPayload): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!payload.paciente_nome) missing.push('paciente_nome');
  if (!payload.email && !payload.telefone) missing.push('email ou telefone');
  if (!payload.evento) missing.push('evento');
  if (!payload.data_consulta) missing.push('data_consulta');
  if (!payload.hora_consulta) missing.push('hora_consulta');
  return { valid: missing.length === 0, missing };
}

const isDev = import.meta.env.DEV;

export function useWebhookNotify() {
  const notify = async (payload: WebhookPayload): Promise<{ webhook?: boolean; gmail?: boolean; success: boolean }> => {
    const config = await getNotificationConfig();
    const results: { webhook?: boolean; gmail?: boolean } = {};

    // Skip test events validation
    if (payload.evento !== 'teste') {
      const validation = validatePayload(payload);
      if (!validation.valid) {
        console.warn('Notificação não enviada - campos obrigatórios ausentes:', validation.missing);
        return { success: false };
      }
    }

    // Determine which channels to use
    const shouldSendWebhook = (config.canal === 'webhook' || config.canal === 'ambos') && config.webhookAtivo && config.webhookUrl;
    const shouldSendGmail = (config.canal === 'gmail' || config.canal === 'ambos') && config.gmailAtivo;

    // Debug logs removed for production cleanliness

    // Send webhook
    if (shouldSendWebhook) {
      try {
        const { error } = await supabase.functions.invoke('webhook-notify', { body: payload });
        results.webhook = !error;
        if (error) console.error('Webhook error:', error);
        // success — no log needed
      } catch (err) {
        console.error('Webhook failed:', err);
        results.webhook = false;
      }
    }

    // Send Gmail
    if (shouldSendGmail) {
      // Only send email if paciente has email
      if (!payload.email) {
        if (isDev) console.warn('[Notificação] Gmail: paciente sem e-mail cadastrado');
        results.gmail = false;
      } else {
        try {
          const { data, error } = await supabase.functions.invoke('send-email', { body: payload });
          results.gmail = !error && data?.success;
          if (error) {
            console.error('Gmail error:', error);
          } else if (data?.success) {
            // success — no log needed
          } else {
            console.error('Gmail falhou:', data?.error || data?.message);
          }
        } catch (err) {
          console.error('Gmail failed:', err);
          results.gmail = false;
        }
      }
    }

    // Fallback: if webhook failed and canal is 'ambos', Gmail already sent above
    // If canal is 'webhook' only and it failed, try Gmail as fallback if configured
    if (config.canal === 'webhook' && results.webhook === false && config.gmailAtivo && payload.email) {
      // Webhook failed, trying Gmail fallback
      try {
        const { data, error } = await supabase.functions.invoke('send-email', { body: payload });
        results.gmail = !error && data?.success;
        // fallback result captured in results.gmail
      } catch {
        results.gmail = false;
      }
    }

    const success = results.webhook === true || results.gmail === true;
    // Final result captured in return value
    return { ...results, success };
  };

  const testWebhook = async (): Promise<{ success: boolean; status: string; message: string }> => {
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
          id_agendamento: 'teste-webhook-' + Date.now(),
        },
      });
      if (error) {
        return { success: false, status: 'erro_envio', message: error.message || 'Erro ao testar Webhook' };
      }
      return {
        success: data?.success !== false,
        status: data?.success !== false ? 'ativo' : 'erro',
        message: data?.message || 'Webhook testado',
      };
    } catch (err) {
      return {
        success: false,
        status: 'erro_conexao',
        message: err instanceof Error ? err.message : 'Erro desconhecido',
      };
    }
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

  return { notify, testGmail, testWebhook };
}
