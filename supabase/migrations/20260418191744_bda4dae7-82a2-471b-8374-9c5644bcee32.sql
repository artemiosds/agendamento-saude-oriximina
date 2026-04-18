CREATE TABLE IF NOT EXISTS public.procedimento_profissionais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procedimento_codigo text NOT NULL REFERENCES public.sigtap_procedimentos(codigo) ON DELETE CASCADE,
  profissional_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (procedimento_codigo, profissional_id)
);

CREATE INDEX IF NOT EXISTS idx_procprof_codigo ON public.procedimento_profissionais(procedimento_codigo);
CREATE INDEX IF NOT EXISTS idx_procprof_profissional ON public.procedimento_profissionais(profissional_id);

ALTER TABLE public.procedimento_profissionais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read procedimento_profissionais"
ON public.procedimento_profissionais FOR SELECT TO authenticated
USING (public.is_staff_member());

CREATE POLICY "Staff manage procedimento_profissionais"
ON public.procedimento_profissionais FOR ALL TO authenticated
USING (public.is_staff_member())
WITH CHECK (public.is_staff_member());