
-- 1. Restrict permissoes SELECT to staff only
ALTER POLICY "Auth users read permissoes" ON permissoes
USING (is_staff_member());

-- 2. Drop anon read on bloqueios (SECURITY DEFINER functions like is_date_blocked bypass RLS)
DROP POLICY "Anon read bloqueios" ON bloqueios;

-- 3. Restrict patient UPDATE on agendamentos to only allow cancellation
DROP POLICY "Pacientes update own agendamentos" ON agendamentos;

CREATE POLICY "Pacientes cancel own agendamentos" ON agendamentos
FOR UPDATE TO authenticated
USING (
  paciente_id IN (
    SELECT id FROM pacientes WHERE auth_user_id = auth.uid()
  )
)
WITH CHECK (
  paciente_id IN (
    SELECT id FROM pacientes WHERE auth_user_id = auth.uid()
  )
  AND status = 'cancelado'
);
