
-- Allow auth users to delete atendimentos
CREATE POLICY "Auth users delete atendimentos"
ON public.atendimentos
FOR DELETE
TO authenticated
USING (true);

-- Allow auth users to delete prontuarios
CREATE POLICY "Auth users delete prontuarios"
ON public.prontuarios
FOR DELETE
TO authenticated
USING (true);
