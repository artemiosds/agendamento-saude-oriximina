import { supabase } from '@/integrations/supabase/client';

export const appointmentService = {
  async getByDate(date: string, filters?: { unidadeId?: string; profissionalId?: string }) {
    let query = supabase.from('agendamentos').select('*').eq('data', date);
    if (filters?.unidadeId) query = query.eq('unidade_id', filters.unidadeId);
    if (filters?.profissionalId) query = query.eq('profissional_id', filters.profissionalId);
    const { data } = await query.order('hora', { ascending: true });
    return data || [];
  },

  async getByDateRange(from: string, to: string, filters?: { unidadeId?: string; profissionalId?: string }) {
    let query = supabase.from('agendamentos').select('*').gte('data', from).lte('data', to);
    if (filters?.unidadeId) query = query.eq('unidade_id', filters.unidadeId);
    if (filters?.profissionalId) query = query.eq('profissional_id', filters.profissionalId);
    const { data } = await query.order('data', { ascending: false });
    return data || [];
  },

  async getAll(limit = 1000) {
    const all: any[] = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const { data } = await supabase.from('agendamentos').select('*').order('data', { ascending: false }).range(offset, offset + limit - 1);
      if (data && data.length > 0) {
        all.push(...data);
        offset += data.length;
        hasMore = data.length === limit;
      } else {
        hasMore = false;
      }
    }
    return all;
  },
};
