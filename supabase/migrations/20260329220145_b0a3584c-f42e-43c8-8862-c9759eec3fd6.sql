
-- 1. Fix google_calendar_tokens: restrict SELECT to own tokens only
DROP POLICY IF EXISTS "Anyone can read tokens" ON public.google_calendar_tokens;
CREATE POLICY "Users read own tokens" ON public.google_calendar_tokens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Fix google_calendar_tokens: restrict ALL to own tokens only
DROP POLICY IF EXISTS "Service role manages tokens" ON public.google_calendar_tokens;
CREATE POLICY "Users manage own tokens" ON public.google_calendar_tokens
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2. Fix notification_logs: restrict INSERT to authenticated only
DROP POLICY IF EXISTS "Anyone insert notification_logs" ON public.notification_logs;
CREATE POLICY "Auth users insert notification_logs" ON public.notification_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 3. Fix pacientes: remove anon SELECT (patient data should not be publicly readable)
DROP POLICY IF EXISTS "Anyone can read pacientes" ON public.pacientes;
CREATE POLICY "Auth users read pacientes" ON public.pacientes
  FOR SELECT TO authenticated
  USING (true);

-- Remove anon INSERT on pacientes (use edge function for online scheduling instead)
DROP POLICY IF EXISTS "Anon insert pacientes" ON public.pacientes;

-- 4. Fix funcionarios: remove anon SELECT (staff data should not be publicly readable)
DROP POLICY IF EXISTS "Anyone can read funcionarios" ON public.funcionarios;
CREATE POLICY "Auth users read funcionarios" ON public.funcionarios
  FOR SELECT TO authenticated
  USING (true);

-- 5. Fix agendamentos: remove anon SELECT and INSERT
DROP POLICY IF EXISTS "Anyone can read agendamentos" ON public.agendamentos;
CREATE POLICY "Auth users read agendamentos" ON public.agendamentos
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Anyone insert agendamentos" ON public.agendamentos;
CREATE POLICY "Auth users insert agendamentos" ON public.agendamentos
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 6. Add storage policies for the sms bucket
CREATE POLICY "Auth users read sms files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'sms');

CREATE POLICY "Auth users upload sms files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sms');

CREATE POLICY "Auth users update sms files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'sms')
  WITH CHECK (bucket_id = 'sms');

CREATE POLICY "Auth users delete sms files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'sms');
