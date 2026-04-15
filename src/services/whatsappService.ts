import { supabase } from '@/integrations/supabase/client';

/**
 * Serviço centralizado para envio de WhatsApp via Evolution API.
 * Todas as chamadas passam pela edge function send-whatsapp-evolution.
 */
export const whatsappService = {
  /** Envia notificação vinculada a um agendamento */
  async sendByAgendamento(agendamentoId: string, tipo: string) {
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp-evolution', {
        body: { agendamento_id: agendamentoId, tipo },
      });
      if (error) console.error('[WhatsApp] Erro:', error);
      return { data, error };
    } catch (err) {
      console.error('[WhatsApp] Erro:', err);
      return { data: null, error: err };
    }
  },

  /** Envia notificação direta (sem agendamento, ex: lista de espera) */
  async sendDirect(params: {
    tipo: string;
    telefone: string;
    paciente_nome: string;
    profissional?: string;
    unidade?: string;
    data_consulta?: string;
    hora_consulta?: string;
    observacoes?: string;
  }) {
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp-evolution', {
        body: {
          tipo: params.tipo,
          telefone_direto: params.telefone,
          paciente_nome_direto: params.paciente_nome,
          dados_direto: {
            profissional: params.profissional || '',
            unidade: params.unidade || '',
            data_consulta: params.data_consulta || '',
            hora_consulta: params.hora_consulta || '',
            observacoes: params.observacoes || '',
          },
        },
      });
      if (error) console.error('[WhatsApp] Erro:', error);
      return { data, error };
    } catch (err) {
      console.error('[WhatsApp] Erro:', err);
      return { data: null, error: err };
    }
  },
};
