-- 1. Garantir que o profissional possa inserir procedimentos no prontuário
CREATE POLICY "Profissionais can insert procedures to own prontuarios"
ON public.prontuario_procedimentos
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.prontuarios p
    WHERE p.id = prontuario_id
    AND (p.profissional_id::text IN (SELECT f.id::text FROM funcionarios f WHERE f.auth_user_id = auth.uid()))
  )
);

-- 2. Garantir que o profissional possa deletar procedimentos do seu prontuário (necessário para o fluxo de 'delete and re-insert')
CREATE POLICY "Profissionais can delete procedures from own prontuarios"
ON public.prontuario_procedimentos
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.prontuarios p
    WHERE p.id = prontuario_id
    AND (p.profissional_id::text IN (SELECT f.id::text FROM funcionarios f WHERE f.auth_user_id = auth.uid()))
  )
);

-- 3. Garantir que o profissional possa atualizar procedimentos do seu prontuário
CREATE POLICY "Profissionais can update procedures of own prontuarios"
ON public.prontuario_procedimentos
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.prontuarios p
    WHERE p.id = prontuario_id
    AND (p.profissional_id::text IN (SELECT f.id::text FROM funcionarios f WHERE f.auth_user_id = auth.uid()))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.prontuarios p
    WHERE p.id = prontuario_id
    AND (p.profissional_id::text IN (SELECT f.id::text FROM funcionarios f WHERE f.auth_user_id = auth.uid()))
  )
);

-- 4. Permitir que o paciente veja os procedimentos do seu prontuário
CREATE POLICY "Patients can view own prontuario procedures"
ON public.prontuario_procedimentos
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.prontuarios p
    WHERE p.id = prontuario_id
    AND p.paciente_id::text IN (SELECT pac.id::text FROM pacientes pac WHERE pac.auth_user_id = auth.uid())
  )
);
