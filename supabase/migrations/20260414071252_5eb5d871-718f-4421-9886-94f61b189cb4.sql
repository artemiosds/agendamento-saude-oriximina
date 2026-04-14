
-- Fix soap_custom_options policies: change from public to authenticated role
DROP POLICY IF EXISTS "Staff delete own soap options" ON public.soap_custom_options;
DROP POLICY IF EXISTS "Staff insert own soap options" ON public.soap_custom_options;
DROP POLICY IF EXISTS "Staff read own soap options" ON public.soap_custom_options;
DROP POLICY IF EXISTS "Staff update own soap options" ON public.soap_custom_options;

CREATE POLICY "Staff delete own soap options" ON public.soap_custom_options
  FOR DELETE TO authenticated USING (is_staff_member());

CREATE POLICY "Staff insert own soap options" ON public.soap_custom_options
  FOR INSERT TO authenticated WITH CHECK (is_staff_member());

CREATE POLICY "Staff read own soap options" ON public.soap_custom_options
  FOR SELECT TO authenticated USING (is_staff_member());

CREATE POLICY "Staff update own soap options" ON public.soap_custom_options
  FOR UPDATE TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());

-- Harden external professional INSERT on agendamentos
DROP POLICY IF EXISTS "External insert agendamentos" ON public.agendamentos;

CREATE POLICY "External insert agendamentos" ON public.agendamentos
  FOR INSERT TO authenticated
  WITH CHECK (
    is_external_professional()
    AND criado_por IN (
      SELECT id::text FROM profissionais_externos
      WHERE auth_user_id = auth.uid()
    )
  );

-- Restrict notification_logs read to admin roles only
DROP POLICY IF EXISTS "Staff read notification_logs" ON public.notification_logs;

CREATE POLICY "Admin read notification_logs" ON public.notification_logs
  FOR SELECT TO authenticated
  USING (
    has_staff_role('master') OR has_staff_role('coordenador') OR has_staff_role('gestao')
  );
