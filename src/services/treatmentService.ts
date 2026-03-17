import { supabase } from '@/integrations/supabase/client';

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
    let query = (supabase as any).from('treatment_sessions').select('*').order('session_number', { ascending: true });
    if (cycleId) query = query.eq('cycle_id', cycleId);
    const { data } = await query;
    return data || [];
  },

  async getExtensions(cycleId?: string) {
    let query = (supabase as any).from('treatment_extensions').select('*').order('changed_at', { ascending: false });
    if (cycleId) query = query.eq('cycle_id', cycleId);
    const { data } = await query;
    return data || [];
  },
};
