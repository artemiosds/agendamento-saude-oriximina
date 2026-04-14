
-- Table for external professionals (schedulers)
CREATE TABLE public.profissionais_externos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  unidade_id TEXT NOT NULL DEFAULT '',
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  criado_por TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profissionais_externos ENABLE ROW LEVEL SECURITY;

-- Staff can manage external professionals
CREATE POLICY "Staff manage profissionais_externos"
ON public.profissionais_externos FOR ALL
TO authenticated
USING (is_staff_member())
WITH CHECK (is_staff_member());

-- External professionals can read own record
CREATE POLICY "External read own record"
ON public.profissionais_externos FOR SELECT
TO authenticated
USING (auth_user_id = auth.uid());

-- Table for quotas
CREATE TABLE public.quotas_externas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profissional_externo_id UUID NOT NULL REFERENCES public.profissionais_externos(id) ON DELETE CASCADE,
  profissional_interno_id UUID NOT NULL,
  unidade_id TEXT NOT NULL DEFAULT '',
  vagas_total INTEGER NOT NULL DEFAULT 0,
  vagas_usadas INTEGER NOT NULL DEFAULT 0,
  periodo_inicio DATE NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::date,
  periodo_fim DATE NOT NULL DEFAULT (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.quotas_externas ENABLE ROW LEVEL SECURITY;

-- Staff can manage quotas
CREATE POLICY "Staff manage quotas_externas"
ON public.quotas_externas FOR ALL
TO authenticated
USING (is_staff_member())
WITH CHECK (is_staff_member());

-- External professionals can read their own quotas
CREATE POLICY "External read own quotas"
ON public.quotas_externas FOR SELECT
TO authenticated
USING (profissional_externo_id IN (
  SELECT id FROM public.profissionais_externos WHERE auth_user_id = auth.uid()
));

-- Helper function to check if user is an external professional
CREATE OR REPLACE FUNCTION public.is_external_professional()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profissionais_externos
    WHERE auth_user_id = auth.uid()
    AND ativo = true
  )
$$;

-- Allow external professionals to read pacientes
CREATE POLICY "External read pacientes"
ON public.pacientes FOR SELECT
TO authenticated
USING (is_external_professional());

-- Allow external professionals to insert pacientes
CREATE POLICY "External insert pacientes"
ON public.pacientes FOR INSERT
TO authenticated
WITH CHECK (is_external_professional());

-- Allow external professionals to update pacientes
CREATE POLICY "External update pacientes"
ON public.pacientes FOR UPDATE
TO authenticated
USING (is_external_professional())
WITH CHECK (is_external_professional());

-- Allow external professionals to read agendamentos they created
CREATE POLICY "External read own agendamentos"
ON public.agendamentos FOR SELECT
TO authenticated
USING (
  is_external_professional() AND
  criado_por IN (SELECT id::text FROM public.profissionais_externos WHERE auth_user_id = auth.uid())
);

-- Allow external professionals to insert agendamentos
CREATE POLICY "External insert agendamentos"
ON public.agendamentos FOR INSERT
TO authenticated
WITH CHECK (is_external_professional());

-- Allow external professionals to update (cancel) their own agendamentos
CREATE POLICY "External cancel own agendamentos"
ON public.agendamentos FOR UPDATE
TO authenticated
USING (
  is_external_professional() AND
  criado_por IN (SELECT id::text FROM public.profissionais_externos WHERE auth_user_id = auth.uid())
)
WITH CHECK (
  is_external_professional() AND
  criado_por IN (SELECT id::text FROM public.profissionais_externos WHERE auth_user_id = auth.uid())
);

-- Allow external professionals to read disponibilidades (for scheduling)
CREATE POLICY "External read disponibilidades"
ON public.disponibilidades FOR SELECT
TO authenticated
USING (is_external_professional());

-- Allow external professionals to read bloqueios (for scheduling)
CREATE POLICY "External read bloqueios"
ON public.bloqueios FOR SELECT
TO authenticated
USING (is_external_professional());

-- Allow external professionals to read funcionarios (to see internal professionals)
CREATE POLICY "External read funcionarios"
ON public.funcionarios FOR SELECT
TO authenticated
USING (is_external_professional());

-- Trigger for updated_at
CREATE TRIGGER update_profissionais_externos_updated_at
BEFORE UPDATE ON public.profissionais_externos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

CREATE TRIGGER update_quotas_externas_updated_at
BEFORE UPDATE ON public.quotas_externas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

-- Add agendado_por column to agendamentos to track external scheduler
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS agendado_por_externo TEXT DEFAULT '';
