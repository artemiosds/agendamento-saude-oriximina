-- Grant explicit permissions to Professionals for their own prontuarios
DROP POLICY IF EXISTS "Profissionais manage own prontuarios" ON public.prontuarios;
CREATE POLICY "Profissionais manage own prontuarios"
ON public.prontuarios
FOR ALL
TO authenticated
USING (
  profissional_id IN (
    SELECT id::text FROM public.funcionarios WHERE auth_user_id = auth.uid()
  )
)
WITH CHECK (
  profissional_id IN (
    SELECT id::text FROM public.funcionarios WHERE auth_user_id = auth.uid()
  )
);

-- Ensure policies for prontuario_procedimentos are also explicit
DROP POLICY IF EXISTS "Profissionais can delete procedures from own prontuarios" ON public.prontuario_procedimentos;
DROP POLICY IF EXISTS "Profissionais can insert procedures to own prontuarios" ON public.prontuario_procedimentos;
DROP POLICY IF EXISTS "Profissionais can update procedures of own prontuarios" ON public.prontuario_procedimentos;

CREATE POLICY "Profissionais can delete procedures from own prontuarios"
ON public.prontuario_procedimentos
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.prontuarios p
    WHERE p.id = prontuario_procedimentos.prontuario_id
    AND p.profissional_id IN (
      SELECT id::text FROM public.funcionarios f WHERE f.auth_user_id = auth.uid()
    )
  )
);

CREATE POLICY "Profissionais can insert procedures to own prontuarios"
ON public.prontuario_procedimentos
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.prontuarios p
    WHERE p.id = prontuario_procedimentos.prontuario_id
    AND p.profissional_id IN (
      SELECT id::text FROM public.funcionarios f WHERE f.auth_user_id = auth.uid()
    )
  )
);

CREATE POLICY "Profissionais can update procedures of own prontuarios"
ON public.prontuario_procedimentos
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.prontuarios p
    WHERE p.id = prontuario_procedimentos.prontuario_id
    AND p.profissional_id IN (
      SELECT id::text FROM public.funcionarios f WHERE f.auth_user_id = auth.uid()
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.prontuarios p
    WHERE p.id = prontuario_procedimentos.prontuario_id
    AND p.profissional_id IN (
      SELECT id::text FROM public.funcionarios f WHERE f.auth_user_id = auth.uid()
    )
  )
);
