import { supabase } from '@/integrations/supabase/client';

interface InvokeResult<T = any> {
  data: T | null;
  error: unknown;
}

async function invokeWhatsApp<T = any>(body: Record<string, unknown>): Promise<InvokeResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke('send-whatsapp-evolution', { body });
    if (error) console.error('[WhatsApp] Erro:', error);
    return { data: (data as T) ?? null, error };
  } catch (err) {
    console.error('[WhatsApp] Erro:', err);
    return { data: null, error: err };
  }
}

/**
 * Serviço centralizado para envio de WhatsApp via Evolution API.
 * Todas as chamadas passam pela edge function send-whatsapp-evolution.
 */
export const whatsappService = {
  /** Envia notificação vinculada a um agendamento */
  async sendByAgendamento(agendamentoId: string, tipo: string) {
    return invokeWhatsApp({ agendamento_id: agendamentoId, tipo });
  },

  /** Envia notificação direta (sem agendamento, ex: lista de espera, aviso manual). */
  async sendDirect(params: {
    tipo: string;
    telefone: string;
    paciente_nome: string;
    profissional?: string;
    unidade?: string;
    unidade_id?: string;
    data_consulta?: string;
    hora_consulta?: string;
    observacoes?: string;
  }) {
    return invokeWhatsApp({
      tipo: params.tipo,
      telefone_direto: params.telefone,
      paciente_nome_direto: params.paciente_nome,
      dados_direto: {
        profissional: params.profissional || '',
        unidade: params.unidade || '',
        unidade_id: params.unidade_id || '',
        data_consulta: params.data_consulta || '',
        hora_consulta: params.hora_consulta || '',
        observacoes: params.observacoes || '',
      },
    });
  },

  async sendTest(telefone: string) {
    return invokeWhatsApp<{ success?: boolean; error?: string }>({ tipo: 'teste', telefone_teste: telefone });
  },

  async getConnectionStatus() {
    return invokeWhatsApp<{ success?: boolean; connected?: boolean; state?: string; error?: string }>({ action: 'status' });
  },

  async getInstances() {
    return invokeWhatsApp<{ success?: boolean; instances?: { instanceName: string; state: string }[]; error?: string }>({ action: 'instances' });
  },
};
