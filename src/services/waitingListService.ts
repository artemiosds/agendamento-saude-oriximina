import { supabase } from '@/integrations/supabase/client';

export const waitingListService = {
  async getAll(filters?: { unidadeId?: string; profissionalId?: string }) {
    let query = supabase.from('fila_espera').select('*').order('criado_em', { ascending: true });
    if (filters?.unidadeId) query = query.eq('unidade_id', filters.unidadeId);
    if (filters?.profissionalId) query = query.eq('profissional_id', filters.profissionalId);
    const { data } = await query;
    return data || [];
  },

  async checkPatientInQueue(patientId: string): Promise<boolean> {
    const { data } = await supabase.from('fila_espera').select('id')
      .eq('paciente_id', patientId)
      .in('status', ['aguardando', 'chamado'])
      .limit(1);
    return (data?.length || 0) > 0;
  },
};
