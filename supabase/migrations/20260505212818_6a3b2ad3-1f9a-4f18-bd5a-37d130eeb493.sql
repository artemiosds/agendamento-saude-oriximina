-- Create table for patient referrals (history)
CREATE TABLE IF NOT EXISTS public.patient_referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  unidade_id TEXT, -- Removing reference for now to avoid type mismatch, can be updated later
  professional_id UUID REFERENCES auth.users(id),
  
  especialidade_destino TEXT NOT NULL,
  ubs_origem TEXT,
  profissional_solicitante TEXT,
  tipo_encaminhamento TEXT,
  cid TEXT,
  diagnostico_resumido TEXT,
  justificativa TEXT,
  data_encaminhamento DATE DEFAULT CURRENT_DATE,
  
  status TEXT DEFAULT 'ativo', -- 'ativo', 'cancelado', 'concluido'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create table for referral attachments
CREATE TABLE IF NOT EXISTS public.referral_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referral_id UUID NOT NULL REFERENCES public.patient_referrals(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.patient_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_attachments ENABLE ROW LEVEL SECURITY;

-- Create policies for patient_referrals
CREATE POLICY "Referrals are viewable by authenticated users"
ON public.patient_referrals FOR SELECT USING (true);

CREATE POLICY "Referrals can be inserted by authenticated users"
ON public.patient_referrals FOR INSERT WITH CHECK (true);

CREATE POLICY "Referrals can be updated by authenticated users"
ON public.patient_referrals FOR UPDATE USING (true);

CREATE POLICY "Referrals can be deleted by authenticated users"
ON public.patient_referrals FOR DELETE USING (true);

-- Create policies for referral_attachments
CREATE POLICY "Referral attachments are viewable by authenticated users"
ON public.referral_attachments FOR SELECT USING (true);

CREATE POLICY "Referral attachments can be inserted by authenticated users"
ON public.referral_attachments FOR INSERT WITH CHECK (true);

CREATE POLICY "Referral attachments can be deleted by authenticated users"
ON public.referral_attachments FOR DELETE USING (true);

-- Create storage bucket for referral attachments
INSERT INTO storage.buckets (id, name, public) 
VALUES ('referral-attachments', 'referral-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Referral attachments are accessible by authenticated users"
ON storage.objects FOR SELECT USING (bucket_id = 'referral-attachments');

CREATE POLICY "Referral attachments can be uploaded by authenticated users"
ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'referral-attachments');

CREATE POLICY "Referral attachments can be deleted by authenticated users"
ON storage.objects FOR DELETE USING (bucket_id = 'referral-attachments');

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop trigger if exists to avoid errors on retry
DROP TRIGGER IF EXISTS update_patient_referrals_updated_at ON public.patient_referrals;

CREATE TRIGGER update_patient_referrals_updated_at
    BEFORE UPDATE ON public.patient_referrals
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
