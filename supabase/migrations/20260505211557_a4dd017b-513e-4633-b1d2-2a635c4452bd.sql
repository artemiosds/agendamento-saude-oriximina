-- Create storage bucket for patient documents if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('patient-documents', 'patient-documents', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO NOTHING;

-- Create table for patient documents
CREATE TABLE IF NOT EXISTS public.patient_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id TEXT NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
    unidade_id TEXT,
    nome_arquivo TEXT NOT NULL,
    nome_original TEXT,
    tipo_documento TEXT, -- RG, CPF, Laudo, Exame, etc.
    mime_type TEXT,
    tamanho_bytes BIGINT,
    storage_bucket TEXT DEFAULT 'patient-documents',
    storage_path TEXT NOT NULL,
    url_publica TEXT,
    origem TEXT DEFAULT 'anexado', -- anexado, gerado, etc.
    descricao TEXT,
    ativo BOOLEAN DEFAULT TRUE,
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.patient_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies for patient_documents
CREATE POLICY "Users can view patient documents of their unit"
ON public.patient_documents FOR SELECT
USING (
    ativo = true AND (
        auth.jwt() ->> 'role' = 'master' OR
        EXISTS (
            SELECT 1 FROM public.pacientes p
            WHERE p.id = patient_documents.paciente_id
            AND (p.unidade_id = (SELECT unidade_id FROM public.funcionarios WHERE auth_user_id = auth.uid()) OR p.unidade_id IS NULL)
        )
    )
);

CREATE POLICY "Users can insert patient documents"
ON public.patient_documents FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update their own unit patient documents"
ON public.patient_documents FOR UPDATE
USING (true);

-- Storage RLS Policies
CREATE POLICY "Allow authenticated users to upload patient documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'patient-documents');

CREATE POLICY "Allow authenticated users to view patient documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'patient-documents');

CREATE POLICY "Allow authenticated users to delete patient documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'patient-documents');

-- Indices
CREATE INDEX IF NOT EXISTS idx_patient_documents_paciente_id ON public.patient_documents(paciente_id);
CREATE INDEX IF NOT EXISTS idx_patient_documents_unidade_id ON public.patient_documents(unidade_id);
CREATE INDEX IF NOT EXISTS idx_patient_documents_created_at ON public.patient_documents(created_at);
CREATE INDEX IF NOT EXISTS idx_patient_documents_ativo ON public.patient_documents(ativo);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_patient_documents_updated_at
BEFORE UPDATE ON public.patient_documents
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();
