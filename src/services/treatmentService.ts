import { supabase } from '@/integrations/supabase/client';

async function fetchAllRows<T>(
  table: string,
  build?: (query: any) => any,
  orderBy?: { column: string; ascending?: boolean },
): Promise<T[]> {
  const pageSize = 1000;
  let from = 0;
  const allRows: T[] = [];

  while (true) {
    let query = (supabase as any).from(table).select('*');
    if (build) query = build(query);
    if (orderBy) query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
    query = query.range(from, from + pageSize - 1);

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;

    allRows.push(...data);

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}

export const treatmentService = {
  async getCycles(filters?: { professionalId?: string; unitId?: string; status?: string }) {
    let query = (supabase as any).from('treatment_cycles').select('*').order('created_at', { ascending: false });
    if (filters?.professionalId) query = query.eq('professional_id', filters.professionalId);
    if (filters?.unitId) query = query.eq('unit_id', filters.unitId);
    if (filters?.status) query = query.eq('status', filters.status);
    const { data } = await query;
    return data || [];
  },

  async getSessions(cycleId?: string) {
    return fetchAllRows('treatment_sessions', (query) => {
      if (cycleId) return query.eq('cycle_id', cycleId);
      return query;
    }, { column: 'session_number', ascending: true });
  },

  async getExtensions(cycleId?: string) {
    let query = (supabase as any).from('treatment_extensions').select('*').order('changed_at', { ascending: false });
    if (cycleId) query = query.eq('cycle_id', cycleId);
    const { data } = await query;
    return data || [];
  },
};
