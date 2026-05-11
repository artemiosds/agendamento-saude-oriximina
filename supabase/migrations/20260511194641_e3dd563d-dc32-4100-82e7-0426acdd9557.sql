-- Create patient_procedures table with patient_id as TEXT to match patients.id
CREATE TABLE IF NOT EXISTS public.patient_procedures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id TEXT NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
    sigtap_codigo TEXT,
    procedimento_nome TEXT,
    cid TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.patient_procedures ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view all patient procedures" ON public.patient_procedures FOR SELECT USING (true);
CREATE POLICY "Users can insert patient procedures" ON public.patient_procedures FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update patient procedures" ON public.patient_procedures FOR UPDATE USING (true);
CREATE POLICY "Users can delete patient procedures" ON public.patient_procedures FOR DELETE USING (true);

-- Create trigger for updated_at (if not exists from previous attempt)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_patient_procedures_updated_at ON public.patient_procedures;
CREATE TRIGGER update_patient_procedures_updated_at
    BEFORE UPDATE ON public.patient_procedures
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
