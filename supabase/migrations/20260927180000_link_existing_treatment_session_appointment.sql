-- Link an existing Agenda entry to a pending treatment session atomically.
-- Prepared for review only. Do not apply to a database in this phase.
BEGIN;

CREATE FUNCTION public.link_existing_treatment_session_appointment(
  p_session_id uuid,
  p_cycle_id uuid,
  p_expected_session_date date,
  p_appointment_id text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_staff record;
  v_role text;
  v_permission boolean;
  v_session record;
  v_cycle record;
  v_appointment public.agendamentos%ROWTYPE;
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT f.id, f.role, f.usuario, f.unidade_id
    INTO v_staff
    FROM public.funcionarios f
   WHERE f.auth_user_id = auth.uid() AND f.ativo IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionário ativo não encontrado' USING ERRCODE = '42501';
  END IF;

  v_role := lower(trim(v_staff.role));
  v_role := CASE v_role
    WHEN 'gestão' THEN 'gestao' WHEN 'gestor' THEN 'gestao'
    WHEN 'coordenacao' THEN 'gestao' WHEN 'coordenador' THEN 'gestao'
    WHEN 'recepção' THEN 'recepcao' WHEN 'tecnico' THEN 'triagem'
    WHEN 'tecnico_enfermagem' THEN 'enfermagem' ELSE v_role END;
  IF nullif(v_role, '') IS NULL THEN
    RAISE EXCEPTION 'Perfil não identificado' USING ERRCODE = '42501';
  END IF;
  IF v_role <> 'master' THEN
    SELECT chosen.can_execute INTO v_permission FROM (
      SELECT pu.can_execute, 1 AS rank FROM public.permissoes_usuario pu
       WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento'
         AND pu.unidade_id = coalesce(v_staff.unidade_id, '') AND coalesce(v_staff.unidade_id, '') <> ''
      UNION ALL SELECT pu.can_execute, 2 FROM public.permissoes_usuario pu
       WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento' AND pu.unidade_id = ''
      UNION ALL SELECT p.can_execute, 3 FROM public.permissoes p
       WHERE p.perfil IN (v_role, lower(trim(v_staff.role))) AND p.modulo = 'tratamento'
         AND p.unidade_id = coalesce(v_staff.unidade_id, '') AND coalesce(v_staff.unidade_id, '') <> ''
      UNION ALL SELECT p.can_execute, 4 FROM public.permissoes p
       WHERE p.perfil IN (v_role, lower(trim(v_staff.role))) AND p.modulo = 'tratamento' AND p.unidade_id = ''
    ) chosen ORDER BY chosen.rank LIMIT 1;
    IF v_permission IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Sem permissão para agendar sessões de tratamento' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT s.* INTO v_session
    FROM public.treatment_sessions s
   WHERE s.id = p_session_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'nao_encontrado', 'reason', 'sessao');
  END IF;

  SELECT c.* INTO v_cycle
    FROM public.treatment_cycles c
   WHERE c.id = p_cycle_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'ciclo_ausente');
  END IF;
  IF v_session.cycle_id IS DISTINCT FROM p_cycle_id
     OR v_session.patient_id IS DISTINCT FROM v_cycle.patient_id
     OR v_session.professional_id IS DISTINCT FROM v_cycle.professional_id
     OR v_cycle.status <> 'em_andamento' THEN
    RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'ciclo_sessao');
  END IF;

  IF v_staff.usuario IS DISTINCT FROM 'admin.sms' AND
     (nullif(v_staff.unidade_id, '') IS NULL AND v_role <> 'master'
       OR nullif(v_staff.unidade_id, '') IS NOT NULL AND v_cycle.unit_id <> v_staff.unidade_id) THEN
    RAISE EXCEPTION 'Fora do escopo de unidade' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'profissional' AND v_cycle.professional_id <> v_staff.id::text THEN
    RAISE EXCEPTION 'Fora do escopo profissional' USING ERRCODE = '42501';
  END IF;
  IF p_appointment_id IS NULL OR p_expected_session_date IS NULL THEN
    RETURN jsonb_build_object('status', 'payload_invalido', 'reason', 'vinculo');
  END IF;

  SELECT a.* INTO v_appointment
    FROM public.agendamentos a
   WHERE a.id = p_appointment_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'agendamento_ausente');
  END IF;
  IF v_appointment.paciente_id IS DISTINCT FROM v_session.patient_id
     OR v_appointment.profissional_id IS DISTINCT FROM v_session.professional_id
     OR v_appointment.unidade_id IS DISTINCT FROM v_cycle.unit_id
     OR v_appointment.data IS DISTINCT FROM p_expected_session_date
     OR v_appointment.status IN ('cancelado', 'falta', 'remarcado') THEN
    RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'agendamento_divergente');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.treatment_sessions other_session
     WHERE other_session.appointment_id = p_appointment_id
       AND other_session.id <> p_session_id
  ) THEN
    RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'agendamento_ja_vinculado');
  END IF;

  -- Idempotent retry: report the existing valid link without writing again.
  IF v_session.status = 'agendada' AND v_session.appointment_id = p_appointment_id
     AND v_session.scheduled_date = p_expected_session_date THEN
    RETURN jsonb_build_object('status', 'ja_agendado', 'session', to_jsonb(v_session), 'appointment', to_jsonb(v_appointment));
  END IF;
  IF v_session.status <> 'pendente_agendamento' OR v_session.appointment_id IS NOT NULL
     OR v_session.scheduled_date IS DISTINCT FROM p_expected_session_date THEN
    RETURN jsonb_build_object('status', 'estado_protegido', 'reason', 'sessao_alterada');
  END IF;

  UPDATE public.treatment_sessions s
     SET appointment_id = p_appointment_id, status = 'agendada'
   WHERE s.id = p_session_id AND s.cycle_id = p_cycle_id
     AND s.status = 'pendente_agendamento' AND s.appointment_id IS NULL
     AND s.scheduled_date = p_expected_session_date;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Sessão alterada durante o vínculo' USING ERRCODE = '40001';
  END IF;

  SELECT s.* INTO v_session FROM public.treatment_sessions s WHERE s.id = p_session_id;
  RETURN jsonb_build_object('status', 'ja_agendado', 'session', to_jsonb(v_session), 'appointment', to_jsonb(v_appointment));
END;
$function$;

REVOKE ALL ON FUNCTION public.link_existing_treatment_session_appointment(uuid, uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_existing_treatment_session_appointment(uuid, uuid, date, text) TO authenticated;

COMMIT;
