-- Record the actual actor's login alongside the existing ID and name in
-- treatment session action logs. Keep the RPC behavior and permissions intact.
BEGIN;

CREATE OR REPLACE FUNCTION public.schedule_treatment_session_checked(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment jsonb, p_check_patient_conflict boolean, p_manual_capacity boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  s public.treatment_sessions%ROWTYPE;
  c public.treatment_cycles%ROWTYPE;
  actor jsonb;
  result jsonb;
  reason_value text;
BEGIN
  SELECT * INTO s FROM public.treatment_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sessão não encontrada.' USING ERRCODE = '23503'; END IF;
  SELECT * INTO c FROM public.treatment_cycles WHERE id = p_cycle_id FOR UPDATE;
  actor := public.assert_treatment_write_scope(c.professional_id, c.unit_id, false);
  IF s.cycle_id IS DISTINCT FROM c.id OR s.scheduled_date IS DISTINCT FROM p_expected_session_date THEN
    RAISE EXCEPTION 'A sessão mudou. Atualize o ciclo.' USING ERRCODE = '40001';
  END IF;

  reason_value := coalesce(nullif(btrim(p_reason), ''), 'Encaixe autorizado pelo profissional / Continuidade do cuidado multiprofissional');
  PERFORM set_config('app.treatment_change_reason', reason_value, true);
  PERFORM set_config('app.treatment_manual_capacity_reason', reason_value, true);
  IF p_manual_capacity THEN
    result := public.schedule_treatment_session_manual_capacity(
      p_session_id, p_cycle_id, p_expected_session_date, p_appointment, p_check_patient_conflict
    );
  ELSE
    result := public.schedule_treatment_session_batch(
      p_session_id, p_cycle_id, p_expected_session_date, p_appointment, p_check_patient_conflict
    );
  END IF;

  IF result->>'status' = 'agendado' THEN
    INSERT INTO public.action_logs(user_id, user_nome, role, unidade_id, acao, entidade, entidade_id,
      modulo, paciente_id, profissional_id, detalhes)
    VALUES(actor->>'id', actor->>'nome', actor->>'role', c.unit_id, 'agendar_sessao',
      'treatment_session', s.id::text, 'tratamentos', c.patient_id, c.professional_id,
      jsonb_build_object('motivo_alteracao', reason_value, 'usuario_autor', actor->>'usuario',
        'ciclo', c.id, 'sessao', s.id,
        'valor_anterior', to_jsonb(s), 'valor_novo', result->'session'));
  END IF;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reschedule_treatment_session_checked(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text, p_new_date date, p_new_time text, p_check_patient_conflict boolean, p_manual_capacity boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  result jsonb;
  c public.treatment_cycles%ROWTYPE;
  actor jsonb;
  reason_value text;
BEGIN
  SELECT * INTO c FROM public.treatment_cycles WHERE id = p_cycle_id;
  actor := public.assert_treatment_write_scope(c.professional_id, c.unit_id, false);
  reason_value := coalesce(nullif(btrim(p_reason), ''), 'Encaixe autorizado pelo profissional / Continuidade do cuidado multiprofissional');
  PERFORM set_config('app.treatment_change_reason', reason_value, true);
  PERFORM set_config('app.treatment_manual_capacity_reason', reason_value, true);

  IF p_manual_capacity THEN
    result := public.reschedule_treatment_session_manual_capacity(
      p_session_id, p_cycle_id, p_expected_session_date, p_expected_appointment_id,
      p_new_date, p_new_time, p_check_patient_conflict
    );
  ELSE
    result := public.reschedule_treatment_session(
      p_session_id, p_cycle_id, p_expected_session_date, p_expected_appointment_id,
      p_new_date, p_new_time, p_check_patient_conflict
    );
  END IF;

  IF result->>'status' = 'remarcado' THEN
    INSERT INTO public.action_logs(user_id, user_nome, role, unidade_id, acao, entidade, entidade_id,
      modulo, paciente_id, profissional_id, detalhes)
    VALUES(actor->>'id', actor->>'nome', actor->>'role', c.unit_id, 'remarcar_sessao',
      'treatment_session', p_session_id::text, 'tratamentos', c.patient_id, c.professional_id,
      jsonb_build_object('motivo_alteracao', reason_value, 'usuario_autor', actor->>'usuario',
        'data_anterior', p_expected_session_date, 'data_nova', p_new_date));
  END IF;
  RETURN result;
END;
$function$;

COMMIT;
