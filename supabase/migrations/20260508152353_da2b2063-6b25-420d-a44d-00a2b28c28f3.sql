-- Re-create policies for prontuario_procedimentos to be more robust
DROP POLICY IF EXISTS "Profissionais can delete procedures from own prontuarios" ON public.prontuario_procedimentos;
DROP POLICY IF EXISTS "Profissionais can insert procedures to own prontuarios" ON public.prontuario_procedimentos;
DROP POLICY IF EXISTS "Profissionais can update procedures of own prontuarios" ON public.prontuario_procedimentos;

CREATE POLICY "Profissionais can delete procedures from own prontuarios"
ON public.prontuario_procedimentos
FOR DELETE
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
USING (
  EXISTS (
    SELECT 1 FROM public.prontuarios p
    WHERE p.id = prontuario_procedimentos.prontuario_id
    AND p.profissional_id IN (
      SELECT id::text FROM public.funcionarios f WHERE f.auth_user_id = auth.uid()
    )
  )
);
