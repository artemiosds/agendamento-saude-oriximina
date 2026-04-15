import { supabase } from '@/integrations/supabase/client';

export interface PatientRegulation {
  id: string;
  patient_id: string;
  cns: string;
  cpf: string;
  name: string;
  mother_name: string;
  priority_level: string;
  referral_source: string;
  cid_code: string;
  requires_specialty: string;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface PatientEvaluation {
  id: string;
  patient_id: string;
  regulation_id: string;
  professional_id: string;
  unit_id: string;
  evaluation_date: string;
  clinical_notes: string;
  defined_procedures: string[];
  sessions_planned: number;
  frequency: string;
  status: string;
  rejection_reason: string;
  created_at: string;
  updated_at: string;
}

export const regulationService = {
  async getAll(filters?: { status?: string; specialty?: string }) {
    let query = (supabase as any).from('patient_regulation').select('*').order('created_at', { ascending: true });
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.specialty) query = query.eq('requires_specialty', filters.specialty);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as PatientRegulation[];
  },

  async create(reg: Omit<PatientRegulation, 'id' | 'created_at' | 'updated_at'>) {
    const { data, error } = await (supabase as any).from('patient_regulation').insert(reg).select().single();
    if (error) throw error;
    return data as PatientRegulation;
  },

  async update(id: string, updates: Partial<PatientRegulation>) {
    const { data, error } = await (supabase as any).from('patient_regulation').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return data as PatientRegulation;
  },

  async getEvaluations(filters?: { patientId?: string; regulationId?: string; status?: string; unitId?: string }) {
    let query = (supabase as any).from('patient_evaluations').select('*').order('created_at', { ascending: false });
    if (filters?.patientId) query = query.eq('patient_id', filters.patientId);
    if (filters?.regulationId) query = query.eq('regulation_id', filters.regulationId);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.unitId) query = query.eq('unit_id', filters.unitId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as PatientEvaluation[];
  },

  async createEvaluation(ev: Omit<PatientEvaluation, 'id' | 'created_at' | 'updated_at'>) {
    const { data, error } = await (supabase as any).from('patient_evaluations').insert(ev).select().single();
    if (error) throw error;
    return data as PatientEvaluation;
  },

  async updateEvaluation(id: string, updates: Partial<PatientEvaluation>) {
    const { data, error } = await (supabase as any).from('patient_evaluations').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return data as PatientEvaluation;
  },

  async checkActiveRegulation(patientId: string): Promise<PatientRegulation | null> {
    const { data } = await (supabase as any).from('patient_regulation').select('*')
      .eq('patient_id', patientId)
      .in('status', ['waiting', 'scheduled_evaluation', 'evaluated', 'in_treatment'])
      .limit(1);
    return data?.[0] || null;
  },
};
