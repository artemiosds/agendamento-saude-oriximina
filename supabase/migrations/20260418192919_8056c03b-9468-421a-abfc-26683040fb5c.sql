
ALTER TABLE public.sigtap_procedimentos
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'SIGTAP',
  ADD COLUMN IF NOT EXISTS descricao text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS valor numeric(10,2),
  ADD COLUMN IF NOT EXISTS criado_por text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_sigtap_proc_origem ON public.sigtap_procedimentos(origem);
CREATE INDEX IF NOT EXISTS idx_sigtap_proc_especialidade ON public.sigtap_procedimentos(especialidade);

-- Garantir RLS habilitado
ALTER TABLE public.sigtap_procedimentos ENABLE ROW LEVEL SECURITY;

-- Limpar policies antigas para reescrever de forma consistente
DROP POLICY IF EXISTS "Staff read sigtap_procedimentos" ON public.sigtap_procedimentos;
DROP POLICY IF EXISTS "Staff manage sigtap_procedimentos" ON public.sigtap_procedimentos;
DROP POLICY IF EXISTS "Master manage sigtap_procedimentos" ON public.sigtap_procedimentos;
DROP POLICY IF EXISTS "Master insert custom procedimentos" ON public.sigtap_procedimentos;
DROP POLICY IF EXISTS "Master update custom procedimentos" ON public.sigtap_procedimentos;
DROP POLICY IF EXISTS "Master delete custom procedimentos" ON public.sigtap_procedimentos;
DROP POLICY IF EXISTS "Staff insert sigtap import" ON public.sigtap_procedimentos;
DROP POLICY IF EXISTS "Staff update sigtap import" ON public.sigtap_procedimentos;

-- Leitura: todo staff
CREATE POLICY "Staff read sigtap_procedimentos"
ON public.sigtap_procedimentos FOR SELECT TO authenticated
USING (public.is_staff_member());

-- Insert: Master para personalizados; staff para sync SIGTAP (mantém compat)
CREATE POLICY "Master or sync insert procedimentos"
ON public.sigtap_procedimentos FOR INSERT TO authenticated
WITH CHECK (
  public.has_staff_role('master')
  OR (origem = 'SIGTAP' AND public.is_staff_member())
);

-- Update: Master livre; sync SIGTAP pode atualizar registros SIGTAP
CREATE POLICY "Master or sync update procedimentos"
ON public.sigtap_procedimentos FOR UPDATE TO authenticated
USING (
  public.has_staff_role('master')
  OR (origem = 'SIGTAP' AND public.is_staff_member())
)
WITH CHECK (
  public.has_staff_role('master')
  OR (origem = 'SIGTAP' AND public.is_staff_member())
);

-- Delete: apenas Master, e somente personalizados
CREATE POLICY "Master delete custom procedimentos"
ON public.sigtap_procedimentos FOR DELETE TO authenticated
USING (public.has_staff_role('master') AND origem = 'PERSONALIZADO');
