CREATE OR REPLACE FUNCTION public.save_treatment_cycle_plan(p_cycle jsonb, p_dates date[], p_reason text, p_expected_total integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE c public.treatment_cycles%ROWTYPE; previous public.treatment_cycles%ROWTYPE;
 actor jsonb; planned integer; actual integer; added integer;
BEGIN
  IF jsonb_typeof(p_cycle) <> 'object' OR p_cycle IS NULL THEN RAISE EXCEPTION 'Plano inválido' USING ERRCODE = '23514'; END IF;
  planned := (p_cycle->>'total_sessions')::integer;
  added := coalesce(cardinality(p_dates), 0);
  IF planned IS NULL OR planned NOT BETWEEN 1 AND 400 OR added < 1 OR p_expected_total IS NULL OR p_expected_total < 0 THEN
    RAISE EXCEPTION 'Quantidade de sessões inválida' USING ERRCODE = '23514';
  END IF;
  IF added + p_expected_total <> planned THEN
    RAISE EXCEPTION 'Geração incompleta: % sessões previstas, mas % datas informadas.', planned, added + p_expected_total USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_dates) d WHERE d IS NULL) OR (SELECT count(DISTINCT d) FROM unnest(p_dates) d) <> added THEN
    RAISE EXCEPTION 'Data repetida na lista de novas sessões.' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO previous FROM public.treatment_cycles WHERE id = (p_cycle->>'id')::uuid FOR UPDATE;
  IF FOUND THEN
    actor := public.assert_treatment_write_scope(previous.professional_id, previous.unit_id, true);
    IF nullif(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Informe a justificativa da extensão.' USING ERRCODE = '23514'; END IF;
    IF previous.total_sessions <> p_expected_total THEN
      RAISE EXCEPTION 'O ciclo mudou. Recarregue antes de estender.' USING ERRCODE = '40001';
    END IF;
    IF previous.status NOT IN ('em_andamento', 'ativo', 'concluido') THEN RAISE EXCEPTION 'Este ciclo não permite extensão.' USING ERRCODE = '23514'; END IF;
    -- Pendências antigas do ciclo não bloqueiam a extensão; só a nova data não pode repetir sessão ativa.
    IF EXISTS (SELECT 1 FROM public.treatment_sessions s WHERE s.cycle_id = previous.id AND s.status NOT IN ('cancelada','remarcada') AND s.scheduled_date = ANY(p_dates)) THEN
      RAISE EXCEPTION 'Já existe sessão ativa deste ciclo na data informada. Escolha outra data.' USING ERRCODE = '23514';
    END IF;
    UPDATE public.treatment_cycles SET total_sessions = planned,
      end_date_predicted = greatest(previous.end_date_predicted, (SELECT max(d) FROM unnest(p_dates) d)), status = 'em_andamento', updated_at = now()
      WHERE id = previous.id RETURNING * INTO c;
    INSERT INTO public.treatment_extensions(cycle_id, previous_sessions, new_sessions, previous_end_date, new_end_date, reason, changed_by)
      VALUES(c.id, previous.total_sessions, planned, previous.end_date_predicted, c.end_date_predicted, btrim(p_reason), actor->>'id');
  ELSE
    IF p_expected_total <> 0 OR p_reason IS NOT NULL THEN RAISE EXCEPTION 'Ciclo não encontrado para extensão.' USING ERRCODE = '23503'; END IF;
    actor := public.assert_treatment_write_scope(p_cycle->>'professional_id', p_cycle->>'unit_id', true);
    IF NOT EXISTS (SELECT 1 FROM public.pacientes WHERE id = p_cycle->>'patient_id') THEN RAISE EXCEPTION 'Paciente não encontrado.' USING ERRCODE = '23503'; END IF;
    IF nullif(p_cycle->>'pts_id','') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.pts p WHERE p.id = (p_cycle->>'pts_id')::uuid AND p.patient_id = p_cycle->>'patient_id' AND p.unit_id = p_cycle->>'unit_id') THEN
      RAISE EXCEPTION 'PTS divergente do paciente ou unidade.' USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.treatment_cycles(id, patient_id, professional_id, unit_id, specialty, treatment_type, start_date, end_date_predicted, total_sessions, sessions_done, frequency, status, clinical_notes, created_by, pts_id)
      VALUES((p_cycle->>'id')::uuid, p_cycle->>'patient_id', p_cycle->>'professional_id', p_cycle->>'unit_id', coalesce(p_cycle->>'specialty',''), p_cycle->>'treatment_type', (p_cycle->>'start_date')::date,
        (SELECT max(d) FROM unnest(p_dates) d), planned, 0, p_cycle->>'frequency', 'em_andamento', coalesce(p_cycle->>'clinical_notes',''), actor->>'id', nullif(p_cycle->>'pts_id','')::uuid) RETURNING * INTO c;
  END IF;
  INSERT INTO public.treatment_sessions(cycle_id, patient_id, professional_id, session_number, total_sessions, scheduled_date, status)
    SELECT c.id, c.patient_id, c.professional_id, p_expected_total + ord::integer, planned, d, 'pendente_agendamento' FROM unnest(p_dates) WITH ORDINALITY AS dates(d, ord);
  IF p_expected_total = 0 THEN PERFORM public.assert_treatment_cycle_integrity(c.id); END IF;
  SELECT count(*) INTO actual FROM public.treatment_sessions WHERE cycle_id = c.id;
  INSERT INTO public.action_logs(user_id, user_nome, role, unidade_id, acao, entidade, entidade_id, modulo, paciente_id, profissional_id, detalhes)
    VALUES(actor->>'id', actor->>'nome', actor->>'role', c.unit_id, CASE WHEN p_expected_total = 0 THEN 'criar_ciclo_integridade' ELSE 'extensao_tratamento' END,
      'treatment_cycle', c.id::text, 'tratamentos', c.patient_id, c.professional_id,
      jsonb_build_object('motivo_alteracao', coalesce(p_reason, 'Criação explícita do plano de sessões'), 'total_anterior', p_expected_total, 'total_previsto', planned, 'total_registrado', actual, 'sessoes_adicionadas', added));
  RETURN jsonb_build_object('cycle', to_jsonb(c), 'registered_sessions', actual, 'added_sessions', added);
END $$;

-- Exclusão: remove o ciclo e as sessões não realizadas. Só recusa quando há sessão já realizada (atendimento prestado).
-- Agendamentos futuros e intocados são removidos; os demais ficam na Agenda, apenas desvinculados.
CREATE OR REPLACE FUNCTION public.delete_treatment_cycle_with_appointments(p_cycle_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  v_cycle public.treatment_cycles%ROWTYPE;
  v_session public.treatment_sessions%ROWTYPE;
  v_appointment public.agendamentos%ROWTYPE;
  v_actor jsonb;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_appointment_ids text[] := ARRAY[]::text[];
  v_kept_ids text[] := ARRAY[]::text[];
  v_sessions integer;
  v_removed_appointments integer := 0;
BEGIN
  IF nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Informe a justificativa para excluir o ciclo.' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_cycle FROM public.treatment_cycles WHERE id = p_cycle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado. Atualize a Gestão de Tratamentos.' USING ERRCODE = '23503'; END IF;
  v_actor := public.assert_treatment_write_scope(v_cycle.professional_id, v_cycle.unit_id, true);
  IF EXISTS (SELECT 1 FROM public.treatment_sessions WHERE cycle_id = p_cycle_id AND status IN ('realizada','concluida','presente','compareceu')) THEN
    RAISE EXCEPTION 'Este ciclo já tem sessão realizada (atendimento prestado). Para preservar o prontuário, use "Dar Alta".' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_sessions FROM public.treatment_sessions WHERE cycle_id = p_cycle_id;
  FOR v_session IN SELECT * FROM public.treatment_sessions WHERE cycle_id = p_cycle_id AND appointment_id IS NOT NULL ORDER BY id FOR UPDATE LOOP
    SELECT * INTO v_appointment FROM public.agendamentos WHERE id = v_session.appointment_id FOR UPDATE;
    IF FOUND AND v_appointment.data >= v_today
       AND v_appointment.status IN ('pendente', 'confirmado', 'confirmada', 'agendado')
       AND NOT EXISTS (SELECT 1 FROM public.treatment_sessions o WHERE o.appointment_id = v_session.appointment_id AND o.cycle_id <> p_cycle_id)
       AND NOT EXISTS (SELECT 1 FROM public.atendimentos WHERE agendamento_id = v_session.appointment_id)
       AND NOT EXISTS (SELECT 1 FROM public.prontuarios WHERE agendamento_id = v_session.appointment_id)
       AND NOT EXISTS (SELECT 1 FROM public.triage_records WHERE agendamento_id = v_session.appointment_id)
       AND NOT EXISTS (SELECT 1 FROM public.fila_espera WHERE id = v_session.appointment_id) THEN
      v_appointment_ids := array_append(v_appointment_ids, v_session.appointment_id);
    ELSE
      v_kept_ids := array_append(v_kept_ids, v_session.appointment_id);
    END IF;
  END LOOP;

  IF cardinality(v_appointment_ids) > 0 THEN
    DELETE FROM public.agendamentos WHERE id = ANY(v_appointment_ids);
    GET DIAGNOSTICS v_removed_appointments = ROW_COUNT;
  END IF;
  DELETE FROM public.patient_discharges WHERE cycle_id = p_cycle_id;
  DELETE FROM public.treatment_extensions WHERE cycle_id = p_cycle_id;
  DELETE FROM public.treatment_cycles WHERE id = p_cycle_id;

  INSERT INTO public.action_logs
    (user_id, user_nome, role, unidade_id, acao, entidade, entidade_id, modulo, paciente_id, profissional_id, detalhes)
  VALUES
    (v_actor->>'id', v_actor->>'nome', v_actor->>'role', v_cycle.unit_id,
     'excluir', 'treatment_cycle', p_cycle_id::text, 'tratamentos', v_cycle.patient_id, v_cycle.professional_id,
     jsonb_build_object('motivo_alteracao', btrim(p_reason), 'sessoes_excluidas', v_sessions,
                        'agendamentos_excluidos', v_removed_appointments, 'agendamentos_ids', to_jsonb(v_appointment_ids),
                        'agendamentos_preservados', to_jsonb(v_kept_ids),
                        'ciclo', to_jsonb(v_cycle)));
  RETURN jsonb_build_object('sessions_removed', v_sessions, 'appointments_removed', v_removed_appointments);
END;
$function$;
REVOKE ALL ON FUNCTION public.delete_treatment_cycle_with_appointments(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_treatment_cycle_with_appointments(uuid, text) TO authenticated;