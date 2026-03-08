
-- Add auth_user_id column to pacientes table for patient portal login
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- RLS policy: allow pacientes to read their own data
CREATE POLICY "Pacientes read own data"
ON public.pacientes
FOR SELECT
TO authenticated
USING (auth_user_id = auth.uid());

-- Allow pacientes to read their own agendamentos
CREATE POLICY "Pacientes read own agendamentos"
ON public.agendamentos
FOR SELECT
TO authenticated
USING (
  paciente_id IN (
    SELECT id FROM public.pacientes WHERE auth_user_id = auth.uid()
  )
);

-- Allow pacientes to update their own agendamentos (for cancel/remarcar)
CREATE POLICY "Pacientes update own agendamentos"
ON public.agendamentos
FOR UPDATE
TO authenticated
USING (
  paciente_id IN (
    SELECT id FROM public.pacientes WHERE auth_user_id = auth.uid()
  )
)
WITH CHECK (
  paciente_id IN (
    SELECT id FROM public.pacientes WHERE auth_user_id = auth.uid()
  )
);

-- Allow pacientes to read fila_espera entries for their own records
CREATE POLICY "Pacientes read own fila"
ON public.fila_espera
FOR SELECT
TO authenticated
USING (
  paciente_id IN (
    SELECT id FROM public.pacientes WHERE auth_user_id = auth.uid()
  )
);

-- Allow pacientes to read their own prontuarios
CREATE POLICY "Pacientes read own prontuarios"
ON public.prontuarios
FOR SELECT
TO authenticated
USING (
  paciente_id IN (
    SELECT id FROM public.pacientes WHERE auth_user_id = auth.uid()
  )
);
