import { supabase } from '@/integrations/supabase/client';

export const patientService = {
  async getAll(limit = 1000) {
    const all: any[] = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const { data } = await supabase.from('pacientes').select('*').range(offset, offset + limit - 1);
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

  async getById(id: string) {
    const { data } = await supabase.from('pacientes').select('*').eq('id', id).single();
    return data;
  },

  async search(query: string) {
    const { data } = await supabase.from('pacientes').select('*')
      .or(`nome.ilike.%${query}%,cpf.ilike.%${query}%,cns.ilike.%${query}%`)
      .limit(50);
    return data || [];
  },
};
