
-- =====================================================
-- 1. PRONTUARIOS - Replace permissive policies with staff-only
-- =====================================================
DROP POLICY IF EXISTS "Auth users delete prontuarios" ON public.prontuarios;
DROP POLICY IF EXISTS "Auth users insert prontuarios" ON public.prontuarios;
DROP POLICY IF EXISTS "Auth users read prontuarios" ON public.prontuarios;
DROP POLICY IF EXISTS "Auth users update prontuarios" ON public.prontuarios;
-- Keep: "Pacientes read own prontuarios" (already scoped)

CREATE POLICY "Staff read prontuarios" ON public.prontuarios
  FOR SELECT TO authenticated USING (is_staff_member());
CREATE POLICY "Staff insert prontuarios" ON public.prontuarios
  FOR INSERT TO authenticated WITH CHECK (is_staff_member());
CREATE POLICY "Staff update prontuarios" ON public.prontuarios
  FOR UPDATE TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());
CREATE POLICY "Staff delete prontuarios" ON public.prontuarios
  FOR DELETE TO authenticated USING (is_staff_member());

-- =====================================================
-- 2. ATENDIMENTOS - Staff only (no patient self-access needed)
-- =====================================================
DROP POLICY IF EXISTS "Auth users delete atendimentos" ON public.atendimentos;
DROP POLICY IF EXISTS "Auth users insert atendimentos" ON public.atendimentos;
DROP POLICY IF EXISTS "Auth users read atendimentos" ON public.atendimentos;
DROP POLICY IF EXISTS "Auth users update atendimentos" ON public.atendimentos;

CREATE POLICY "Staff read atendimentos" ON public.atendimentos
  FOR SELECT TO authenticated USING (is_staff_member());
CREATE POLICY "Staff insert atendimentos" ON public.atendimentos
  FOR INSERT TO authenticated WITH CHECK (is_staff_member());
CREATE POLICY "Staff update atendimentos" ON public.atendimentos
  FOR UPDATE TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());
CREATE POLICY "Staff delete atendimentos" ON public.atendimentos
  FOR DELETE TO authenticated USING (is_staff_member());

-- =====================================================
-- 3. PACIENTES - Staff + patient self-access
-- =====================================================
DROP POLICY IF EXISTS "Auth users delete pacientes" ON public.pacientes;
DROP POLICY IF EXISTS "Auth users insert pacientes" ON public.pacientes;
DROP POLICY IF EXISTS "Auth users read pacientes" ON public.pacientes;
DROP POLICY IF EXISTS "Auth users update pacientes" ON public.pacientes;
-- Keep: "Pacientes read own data"

CREATE POLICY "Staff read pacientes" ON public.pacientes
  FOR SELECT TO authenticated USING (is_staff_member());
CREATE POLICY "Staff insert pacientes" ON public.pacientes
  FOR INSERT TO authenticated WITH CHECK (is_staff_member());
CREATE POLICY "Staff update pacientes" ON public.pacientes
  FOR UPDATE TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());
CREATE POLICY "Staff delete pacientes" ON public.pacientes
  FOR DELETE TO authenticated USING (is_staff_member());

-- =====================================================
-- 4. AGENDAMENTOS - Staff + patient self-access
-- =====================================================
DROP POLICY IF EXISTS "Auth users delete agendamentos" ON public.agendamentos;
DROP POLICY IF EXISTS "Auth users insert agendamentos" ON public.agendamentos;
DROP POLICY IF EXISTS "Auth users read agendamentos" ON public.agendamentos;
DROP POLICY IF EXISTS "Auth users update agendamentos" ON public.agendamentos;
-- Keep: "Pacientes read own agendamentos" and "Pacientes update own agendamentos"

CREATE POLICY "Staff read agendamentos" ON public.agendamentos
  FOR SELECT TO authenticated USING (is_staff_member());
CREATE POLICY "Staff insert agendamentos" ON public.agendamentos
  FOR INSERT TO authenticated WITH CHECK (is_staff_member());
CREATE POLICY "Staff update agendamentos" ON public.agendamentos
  FOR UPDATE TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());
CREATE POLICY "Staff delete agendamentos" ON public.agendamentos
  FOR DELETE TO authenticated USING (is_staff_member());

-- =====================================================
-- 5. FILA_ESPERA - Staff + patient self-access
-- =====================================================
DROP POLICY IF EXISTS "Auth users delete fila" ON public.fila_espera;
DROP POLICY IF EXISTS "Auth users insert fila" ON public.fila_espera;
DROP POLICY IF EXISTS "Auth users read fila" ON public.fila_espera;
DROP POLICY IF EXISTS "Auth users update fila" ON public.fila_espera;
-- Keep: "Pacientes read own fila"

CREATE POLICY "Staff read fila" ON public.fila_espera
  FOR SELECT TO authenticated USING (is_staff_member());
CREATE POLICY "Staff insert fila" ON public.fila_espera
  FOR INSERT TO authenticated WITH CHECK (is_staff_member());
CREATE POLICY "Staff update fila" ON public.fila_espera
  FOR UPDATE TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());
CREATE POLICY "Staff delete fila" ON public.fila_espera
  FOR DELETE TO authenticated USING (is_staff_member());

-- =====================================================
-- 6. EPISODIOS_CLINICOS - Staff only
-- =====================================================
DROP POLICY IF EXISTS "Auth users manage episodios" ON public.episodios_clinicos;
DROP POLICY IF EXISTS "Auth users read episodios" ON public.episodios_clinicos;

CREATE POLICY "Staff read episodios" ON public.episodios_clinicos
  FOR SELECT TO authenticated USING (is_staff_member());
CREATE POLICY "Staff manage episodios" ON public.episodios_clinicos
  FOR ALL TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());

-- =====================================================
-- 7. TRIAGE_RECORDS - Staff only
-- =====================================================
DROP POLICY IF EXISTS "Auth users insert triage_records" ON public.triage_records;
DROP POLICY IF EXISTS "Auth users read triage_records" ON public.triage_records;
DROP POLICY IF EXISTS "Auth users update triage_records" ON public.triage_records;

CREATE POLICY "Staff read triage_records" ON public.triage_records
  FOR SELECT TO authenticated USING (is_staff_member());
CREATE POLICY "Staff insert triage_records" ON public.triage_records
  FOR INSERT TO authenticated WITH CHECK (is_staff_member());
CREATE POLICY "Staff update triage_records" ON public.triage_records
  FOR UPDATE TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());

-- =====================================================
-- 8. TRIAGE_SETTINGS - Staff only
-- =====================================================
DROP POLICY IF EXISTS "Auth users manage triage_settings" ON public.triage_settings;
DROP POLICY IF EXISTS "Auth users read triage_settings" ON public.triage_settings;

CREATE POLICY "Staff read triage_settings" ON public.triage_settings
  FOR SELECT TO authenticated USING (is_staff_member());
CREATE POLICY "Staff manage triage_settings" ON public.triage_settings
  FOR ALL TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());

-- =====================================================
-- 9. NURSING_EVALUATIONS - Staff only
-- =====================================================
DROP POLICY IF EXISTS "Auth users manage nursing_evaluations" ON public.nursing_evaluations;
DROP POLICY IF EXISTS "Auth users read nursing_evaluations" ON public.nursing_evaluations;

CREATE POLICY "Staff read nursing_evaluations" ON public.nursing_evaluations
  FOR SELECT TO authenticated USING (is_staff_member());
CREATE POLICY "Staff manage nursing_evaluations" ON public.nursing_evaluations
  FOR ALL TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());

-- =====================================================
-- 10. MULTIPROFESSIONAL_EVALUATIONS - Staff only
-- =====================================================
DROP POLICY IF EXISTS "Auth users manage multiprofessional_evaluations" ON public.multiprofessional_evaluations;
DROP POLICY IF EXISTS "Auth users read multiprofessional_evaluations" ON public.multiprofessional_evaluations;

CREATE POLICY "Staff read multiprofessional_evaluations" ON public.multiprofessional_evaluations
  FOR SELECT TO authenticated USING (is_staff_member());
CREATE POLICY "Staff manage multiprofessional_evaluations" ON public.multiprofessional_evaluations
  FOR ALL TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());

-- =====================================================
-- 11. TREATMENT_CYCLES - Staff only
-- =====================================================
DROP POLICY IF EXISTS "Auth users manage treatment_cycles" ON public.treatment_cycles;
DROP POLICY IF EXISTS "Auth users read treatment_cycles" ON public.treatment_cycles;

CREATE POLICY "Staff read treatment_cycles" ON public.treatment_cycles
  FOR SELECT TO authenticated USING (is_staff_member());
CREATE POLICY "Staff manage treatment_cycles" ON public.treatment_cycles
  FOR ALL TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());

-- =====================================================
-- 12. TREATMENT_SESSIONS - Staff only
-- =====================================================
DROP POLICY IF EXISTS "Auth users manage treatment_sessions" ON public.treatment_sessions;
DROP POLICY IF EXISTS "Auth users read treatment_sessions" ON public.treatment_sessions;

CREATE POLICY "Staff read treatment_sessions" ON public.treatment_sessions
  FOR SELECT TO authenticated USING (is_staff_member());
CREATE POLICY "Staff manage treatment_sessions" ON public.treatment_sessions
  FOR ALL TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());

-- =====================================================
-- 13. TREATMENT_EXTENSIONS - Staff only
-- =====================================================
DROP POLICY IF EXISTS "Auth users manage treatment_extensions" ON public.treatment_extensions;
DROP POLICY IF EXISTS "Auth users read treatment_extensions" ON public.treatment_extensions;

CREATE POLICY "Staff read treatment_extensions" ON public.treatment_extensions
  FOR SELECT TO authenticated USING (is_staff_member());
CREATE POLICY "Staff manage treatment_extensions" ON public.treatment_extensions
  FOR ALL TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());

-- =====================================================
-- 14. PATIENT_DISCHARGES - Staff only
-- =====================================================
DROP POLICY IF EXISTS "Auth users manage patient_discharges" ON public.patient_discharges;
DROP POLICY IF EXISTS "Auth users read patient_discharges" ON public.patient_discharges;

CREATE POLICY "Staff read patient_discharges" ON public.patient_discharges
  FOR SELECT TO authenticated USING (is_staff_member());
CREATE POLICY "Staff manage patient_discharges" ON public.patient_discharges
  FOR ALL TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());

-- =====================================================
-- 15. PATIENT_EVALUATIONS - Staff only
-- =====================================================
DROP POLICY IF EXISTS "Auth users manage patient_evaluations" ON public.patient_evaluations;
DROP POLICY IF EXISTS "Auth users read patient_evaluations" ON public.patient_evaluations;

CREATE POLICY "Staff read patient_evaluations" ON public.patient_evaluations
  FOR SELECT TO authenticated USING (is_staff_member());
CREATE POLICY "Staff manage patient_evaluations" ON public.patient_evaluations
  FOR ALL TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());

-- =====================================================
-- 16. PATIENT_REGULATION - Staff only
-- =====================================================
DROP POLICY IF EXISTS "Auth users manage patient_regulation" ON public.patient_regulation;
DROP POLICY IF EXISTS "Auth users read patient_regulation" ON public.patient_regulation;

CREATE POLICY "Staff read patient_regulation" ON public.patient_regulation
  FOR SELECT TO authenticated USING (is_staff_member());
CREATE POLICY "Staff manage patient_regulation" ON public.patient_regulation
  FOR ALL TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());

-- =====================================================
-- 17. PTS - Staff only
-- =====================================================
DROP POLICY IF EXISTS "Auth users manage pts" ON public.pts;
DROP POLICY IF EXISTS "Auth users read pts" ON public.pts;

CREATE POLICY "Staff read pts" ON public.pts
  FOR SELECT TO authenticated USING (is_staff_member());
CREATE POLICY "Staff manage pts" ON public.pts
  FOR ALL TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());

-- =====================================================
-- 18. PRONTUARIO_PROCEDIMENTOS - Staff only
-- =====================================================
DROP POLICY IF EXISTS "Auth users manage prontuario_procedimentos" ON public.prontuario_procedimentos;
DROP POLICY IF EXISTS "Auth users read prontuario_procedimentos" ON public.prontuario_procedimentos;

CREATE POLICY "Staff read prontuario_procedimentos" ON public.prontuario_procedimentos
  FOR SELECT TO authenticated USING (is_staff_member());
CREATE POLICY "Staff manage prontuario_procedimentos" ON public.prontuario_procedimentos
  FOR ALL TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());

-- =====================================================
-- 19. PROCEDIMENTOS - Keep anon read, staff-only write
-- =====================================================
DROP POLICY IF EXISTS "Auth users manage procedimentos" ON public.procedimentos;
-- Keep: "Anyone can read procedimentos"

CREATE POLICY "Staff manage procedimentos" ON public.procedimentos
  FOR ALL TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());

-- =====================================================
-- 20. ACTION_LOGS - Master only read, staff insert
-- =====================================================
DROP POLICY IF EXISTS "Auth users read action logs" ON public.action_logs;
DROP POLICY IF EXISTS "Auth users insert action logs" ON public.action_logs;

CREATE POLICY "Master read action logs" ON public.action_logs
  FOR SELECT TO authenticated USING (has_staff_role('master'::text) OR has_staff_role('coordenador'::text) OR has_staff_role('gestao'::text));
CREATE POLICY "Staff insert action logs" ON public.action_logs
  FOR INSERT TO authenticated WITH CHECK (is_staff_member());

-- =====================================================
-- 21. NOTIFICATION_LOGS - Staff only read, staff insert
-- =====================================================
DROP POLICY IF EXISTS "Auth users read notification_logs" ON public.notification_logs;
DROP POLICY IF EXISTS "Auth users insert notification_logs" ON public.notification_logs;

CREATE POLICY "Staff read notification_logs" ON public.notification_logs
  FOR SELECT TO authenticated USING (is_staff_member());
CREATE POLICY "Staff insert notification_logs" ON public.notification_logs
  FOR INSERT TO authenticated WITH CHECK (is_staff_member());

-- =====================================================
-- 22. STORAGE - SMS bucket staff only
-- =====================================================
DROP POLICY IF EXISTS "Auth users read sms files" ON storage.objects;
DROP POLICY IF EXISTS "Auth users update sms files" ON storage.objects;
DROP POLICY IF EXISTS "Auth users delete sms files" ON storage.objects;
DROP POLICY IF EXISTS "Auth users upload sms files" ON storage.objects;

CREATE POLICY "Staff read sms files" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'sms' AND is_staff_member());
CREATE POLICY "Staff upload sms files" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'sms' AND is_staff_member());
CREATE POLICY "Staff update sms files" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'sms' AND is_staff_member()) WITH CHECK (bucket_id = 'sms' AND is_staff_member());
CREATE POLICY "Staff delete sms files" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'sms' AND is_staff_member());
