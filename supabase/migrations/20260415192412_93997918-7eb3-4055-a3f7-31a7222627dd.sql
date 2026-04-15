
-- Create document_templates table
CREATE TABLE public.document_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'Atestado Médico',
  conteudo TEXT NOT NULL DEFAULT '',
  ativo BOOLEAN NOT NULL DEFAULT true,
  perfis_permitidos TEXT[] NOT NULL DEFAULT ARRAY['master', 'profissional'],
  tipo_modelo TEXT NOT NULL DEFAULT 'UNIDADE',
  unidade_id TEXT DEFAULT '',
  criado_por TEXT NOT NULL DEFAULT '',
  criado_por_nome TEXT NOT NULL DEFAULT '',
  versoes JSONB NOT NULL DEFAULT '[]'::jsonb,
  blocos_clinicos JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

-- Staff can read: global templates + own unit + own templates
CREATE POLICY "Staff read document_templates"
ON public.document_templates
FOR SELECT
TO authenticated
USING (
  is_staff_member() AND (
    tipo_modelo = 'GLOBAL'
    OR unidade_id = ''
    OR unidade_id IN (
      SELECT COALESCE(f.unidade_id, '') FROM public.funcionarios f WHERE f.auth_user_id = auth.uid() AND f.ativo = true
    )
    OR criado_por IN (
      SELECT f.id::text FROM public.funcionarios f WHERE f.auth_user_id = auth.uid() AND f.ativo = true
    )
  )
);

-- Master can insert/update/delete for their unit
CREATE POLICY "Master manage document_templates"
ON public.document_templates
FOR ALL
TO authenticated
USING (
  has_staff_role('master') AND (
    unidade_id = '' OR unidade_id IN (
      SELECT COALESCE(f.unidade_id, '') FROM public.funcionarios f WHERE f.auth_user_id = auth.uid() AND f.ativo = true
    )
  )
)
WITH CHECK (
  has_staff_role('master') AND (
    unidade_id = '' OR unidade_id IN (
      SELECT COALESCE(f.unidade_id, '') FROM public.funcionarios f WHERE f.auth_user_id = auth.uid() AND f.ativo = true
    )
  )
);

-- Professionals can manage their own templates
CREATE POLICY "Professional manage own document_templates"
ON public.document_templates
FOR ALL
TO authenticated
USING (
  is_staff_member() AND criado_por IN (
    SELECT f.id::text FROM public.funcionarios f WHERE f.auth_user_id = auth.uid() AND f.ativo = true
  )
)
WITH CHECK (
  is_staff_member() AND criado_por IN (
    SELECT f.id::text FROM public.funcionarios f WHERE f.auth_user_id = auth.uid() AND f.ativo = true
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_document_templates_updated_at
BEFORE UPDATE ON public.document_templates
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_now();

-- Index for performance
CREATE INDEX idx_document_templates_unidade ON public.document_templates(unidade_id);
CREATE INDEX idx_document_templates_tipo_modelo ON public.document_templates(tipo_modelo);
CREATE INDEX idx_document_templates_criado_por ON public.document_templates(criado_por);
