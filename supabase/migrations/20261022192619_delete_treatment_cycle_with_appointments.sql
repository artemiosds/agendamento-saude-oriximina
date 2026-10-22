-- Remove an unused treatment plan and its future appointments in one transaction.
-- Clinical history, completed sessions and appointments outside this cycle are protected.
BEGIN;

CREATE FUNCTION public.delete_treatment_cycle_with_appointments(p_cycle_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_cycle public.treatment_cycles%ROWTYPE;
  v_session public.treatment_sessions%ROWTYPE;
  v_appointment public.agendamentos%ROWTYPE;
  v_actor jsonb;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_appointment_ids text[] := ARRAY[]::text[];
  v_sessions integer;
  v_removed_appointments integer;
  v_removed_cycles integer;
BEGIN
  IF nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Informe a justificativa para excluir o ciclo.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_cycle FROM public.treatment_cycles WHERE id = p_cycle_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ciclo não encontrado. Atualize a Gestão de Tratamentos.' USING ERRCODE = '23503';
  END IF;
  v_actor := public.assert_treatment_write_scope(v_cycle.professional_id, v_cycle.unit_id, true);
  IF v_cycle.status NOT IN ('em_andamento', 'ativo', 'aguardando_vaga', 'em_fila')
     OR v_cycle.sessions_done > 0 OR v_cycle.pts_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.patient_discharges WHERE cycle_id = p_cycle_id)
     OR EXISTS (SELECT 1 FROM public.treatment_extensions WHERE cycle_id = p_cycle_id) THEN
    RAISE EXCEPTION 'Ciclo com evolução, PTS, extensão ou alta: preserve o histórico e faça a revisão clínica.' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_sessions FROM public.treatment_sessions WHERE cycle_id = p_cycle_id;
  FOR v_session IN SELECT * FROM public.treatment_sessions WHERE cycle_id = p_cycle_id ORDER BY id FOR UPDATE LOOP
    IF v_session.status NOT IN ('pendente_agendamento', 'agendada')
       OR (v_session.scheduled_date IS NOT NULL AND v_session.scheduled_date < v_today) THEN
      RAISE EXCEPTION 'O ciclo possui sessão passada ou com histórico clínico. Nenhum dado foi excluído.' USING ERRCODE = '23514';
    END IF;

    IF v_session.appointment_id IS NOT NULL THEN
      SELECT * INTO v_appointment FROM public.agendamentos WHERE id = v_session.appointment_id FOR UPDATE;
      IF NOT FOUND OR v_appointment.paciente_id IS DISTINCT FROM v_cycle.patient_id
         OR v_appointment.profissional_id IS DISTINCT FROM v_cycle.professional_id
         OR v_appointment.unidade_id IS DISTINCT FROM v_cycle.unit_id
         OR v_appointment.data IS DISTINCT FROM v_session.scheduled_date
         OR v_appointment.data < v_today
         OR v_appointment.status NOT IN ('pendente', 'confirmado', 'confirmada', 'agendado') THEN
        RAISE EXCEPTION 'Agendamento da sessão divergente ou já em atendimento. Nenhum dado foi excluído.' USING ERRCODE = '23514';
      END IF;
      IF EXISTS (SELECT 1 FROM public.treatment_sessions other
                 WHERE other.appointment_id = v_session.appointment_id AND other.id <> v_session.id)
         OR EXISTS (SELECT 1 FROM public.atendimentos WHERE agendamento_id = v_session.appointment_id)
         OR EXISTS (SELECT 1 FROM public.prontuarios WHERE agendamento_id = v_session.appointment_id)
         OR EXISTS (SELECT 1 FROM public.triage_records WHERE agendamento_id = v_session.appointment_id)
         OR EXISTS (SELECT 1 FROM public.fila_espera WHERE id = v_session.appointment_id) THEN
        RAISE EXCEPTION 'O agendamento possui outro vínculo ou registro de atendimento. Nenhum dado foi excluído.' USING ERRCODE = '23514';
      END IF;
      v_appointment_ids := array_append(v_appointment_ids, v_session.appointment_id);
    END IF;
  END LOOP;

  DELETE FROM public.agendamentos WHERE id = ANY(v_appointment_ids);
  GET DIAGNOSTICS v_removed_appointments = ROW_COUNT;
  IF v_removed_appointments <> cardinality(v_appointment_ids) THEN
    RAISE EXCEPTION 'Não foi possível excluir todos os agendamentos vinculados. Nenhum dado foi excluído.' USING ERRCODE = '23514';
  END IF;

  -- Existing foreign keys remove only the sessions of this cycle.
  DELETE FROM public.treatment_cycles WHERE id = p_cycle_id;
  GET DIAGNOSTICS v_removed_cycles = ROW_COUNT;
  IF v_removed_cycles <> 1 THEN
    RAISE EXCEPTION 'Não foi possível excluir o ciclo. Nenhum dado foi excluído.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.action_logs
    (user_id, user_nome, role, unidade_id, acao, entidade, entidade_id, modulo, paciente_id, profissional_id, detalhes)
  VALUES
    (v_actor->>'id', v_actor->>'nome', v_actor->>'role', v_cycle.unit_id,
     'excluir', 'treatment_cycle', p_cycle_id::text, 'tratamentos', v_cycle.patient_id,
     v_cycle.professional_id,
     jsonb_build_object('motivo_alteracao', btrim(p_reason), 'sessoes_excluidas', v_sessions,
                        'agendamentos_excluidos', v_removed_appointments,
                        'agendamentos_ids', to_jsonb(v_appointment_ids),
                        'paciente', v_cycle.patient_id, 'tipo', v_cycle.treatment_type));

  RETURN jsonb_build_object('sessions_removed', v_sessions, 'appointments_removed', v_removed_appointments);
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_treatment_cycle_with_appointments(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_treatment_cycle_with_appointments(uuid, text) TO authenticated;
COMMIT;
