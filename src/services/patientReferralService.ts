import { supabase } from "@/integrations/supabase/client";

export interface PatientReferral {
  id: string;
  patient_id: string;
  unidade_id?: string;
  professional_id?: string;
  especialidade_destino: string;
  ubs_origem?: string;
  profissional_solicitante?: string;
  tipo_encaminhamento?: string;
  cid?: string;
  diagnostico_resumido?: string;
  justificativa?: string;
  data_encaminhamento?: string;
  status: string;
  created_at: string;
  updated_at: string;
  attachments?: ReferralAttachment[];
}

export interface ReferralAttachment {
  id: string;
  referral_id: string;
  file_path: string;
  file_name: string;
  file_type?: string;
  file_size?: number;
  created_at: string;
}

export async function getPatientReferrals(patientId: string): Promise<PatientReferral[]> {
  const { data, error } = await supabase
    .from('patient_referrals')
    .select('*, attachments:referral_attachments(*)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching patient referrals:', error);
    throw error;
  }

  return data as PatientReferral[];
}

export async function createPatientReferral(referral: Omit<PatientReferral, 'id' | 'created_at' | 'updated_at' | 'attachments'>): Promise<PatientReferral> {
  const { data, error } = await supabase
    .from('patient_referrals')
    .insert(referral)
    .select()
    .single();

  if (error) {
    console.error('Error creating patient referral:', error);
    throw error;
  }

  // Update main patient record for compatibility
  await supabase
    .from('pacientes')
    .update({
      especialidade_destino: referral.especialidade_destino,
      ubs_origem: referral.ubs_origem,
      profissional_solicitante: referral.profissional_solicitante,
      tipo_encaminhamento: referral.tipo_encaminhamento,
      cid: referral.cid,
      diagnostico_resumido: referral.diagnostico_resumido,
      justificativa: referral.justificativa,
      data_encaminhamento: referral.data_encaminhamento
    })
    .eq('id', referral.patient_id);

  return data as PatientReferral;
}

export async function updatePatientReferral(id: string, updates: Partial<PatientReferral>): Promise<PatientReferral> {
  const { attachments: _ignored, ...dbUpdates } = updates as any;
  const { data, error } = await supabase
    .from('patient_referrals')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating patient referral:', error);
    throw error;
  }

  // If status is active, update patient record
  if (data.status === 'ativo' && data.patient_id) {
    await supabase
      .from('pacientes')
      .update({
        especialidade_destino: data.especialidade_destino,
        ubs_origem: data.ubs_origem,
        profissional_solicitante: data.profissional_solicitante,
        tipo_encaminhamento: data.tipo_encaminhamento,
        cid: data.cid,
        diagnostico_resumido: data.diagnostico_resumido,
        justificativa: data.justificativa,
        data_encaminhamento: data.data_encaminhamento
      })
      .eq('id', data.patient_id);
  }

  return data as PatientReferral;
}

export async function deletePatientReferral(id: string): Promise<void> {
  const { error } = await supabase
    .from('patient_referrals')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting patient referral:', error);
    throw error;
  }
}

export async function uploadReferralAttachment(referralId: string, file: File): Promise<ReferralAttachment> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}.${fileExt}`;
  const filePath = `${referralId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('referral-attachments')
    .upload(filePath, file);

  if (uploadError) {
    console.error('Error uploading file:', uploadError);
    throw uploadError;
  }

  const { data, error: dbError } = await supabase
    .from('referral_attachments')
    .insert({
      referral_id: referralId,
      file_path: filePath,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
    })
    .select()
    .single();

  if (dbError) {
    console.error('Error saving attachment info:', dbError);
    throw dbError;
  }

  return data as ReferralAttachment;
}

export async function deleteReferralAttachment(attachment: ReferralAttachment): Promise<void> {
  const { error: storageError } = await supabase.storage
    .from('referral-attachments')
    .remove([attachment.file_path]);

  if (storageError) {
    console.error('Error deleting file from storage:', storageError);
    throw storageError;
  }

  const { error: dbError } = await supabase
    .from('referral_attachments')
    .delete()
    .eq('id', attachment.id);

  if (dbError) {
    console.error('Error deleting attachment from DB:', dbError);
    throw dbError;
  }
}

export async function getReferralFileUrl(filePath: string): Promise<string> {
  const { data } = await supabase.storage
    .from('referral-attachments')
    .createSignedUrl(filePath, 60);

  if (!data?.signedUrl) {
    throw new Error('Could not generate signed URL');
  }

  return data.signedUrl;
}
