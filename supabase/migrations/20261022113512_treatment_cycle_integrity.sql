-- Only future, explicit writes are validated. NO historical data repair or backfill.
BEGIN;
CREATE OR REPLACE FUNCTION public.assert_treatment_write_scope(p_professional_id text, p_unit_id text, p_manage boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_staff record; v_role text; v_permission boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT f.id, f.nome, f.role, f.usuario, f.unidade_id
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
    SELECT chosen.allowed INTO v_permission FROM (
      SELECT CASE WHEN p_manage AND v_role <> 'profissional' THEN pu.can_delete ELSE pu.can_execute END AS allowed, 1 AS rank FROM public.permissoes_usuario pu
       WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento'
         AND pu.unidade_id = coalesce(v_staff.unidade_id, '') AND coalesce(v_staff.unidade_id, '') <> ''
      UNION ALL SELECT CASE WHEN p_manage AND v_role <> 'profissional' THEN pu.can_delete ELSE pu.can_execute END, 2 FROM public.permissoes_usuario pu
       WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento' AND pu.unidade_id = ''
      UNION ALL SELECT CASE WHEN p_manage AND v_role <> 'profissional' THEN p.can_delete ELSE p.can_execute END, 3 FROM public.permissoes p
       WHERE p.perfil IN (v_role, lower(trim(v_staff.role))) AND p.modulo = 'tratamento'
         AND p.unidade_id = coalesce(v_staff.unidade_id, '') AND coalesce(v_staff.unidade_id, '') <> ''
      UNION ALL SELECT CASE WHEN p_manage AND v_role <> 'profissional' THEN p.can_delete ELSE p.can_execute END, 4 FROM public.permissoes p
       WHERE p.perfil IN (v_role, lower(trim(v_staff.role))) AND p.modulo = 'tratamento' AND p.unidade_id = ''
    ) chosen ORDER BY chosen.rank LIMIT 1;
    IF v_permission IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Sem permissão para agendar sessões de tratamento' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_staff.usuario IS DISTINCT FROM 'admin.sms' AND
     (nullif(v_staff.unidade_id, '') IS NULL AND v_role <> 'master'
       OR nullif(v_staff.unidade_id, '') IS NOT NULL AND p_unit_id <> v_staff.unidade_id) THEN
    RAISE EXCEPTION 'Fora do escopo de unidade' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'profissional' AND p_professional_id <> v_staff.id::text THEN
    RAISE EXCEPTION 'Fora do escopo profissional' USING ERRCODE = '42501';
  END IF;
  IF nullif(p_unit_id, '') IS NULL OR NOT EXISTS (SELECT 1 FROM public.funcionarios WHERE id::text = p_professional_id AND ativo IS TRUE) THEN
    RAISE EXCEPTION 'Profissional ou unidade inválida' USING ERRCODE = '23514';
  END IF;
  RETURN to_jsonb(v_staff);
END $$;

-- Shared server-side read-only validator. Used by transactions and the Master review.
CREATE OR REPLACE FUNCTION public.treatment_cycle_integrity_issues(p_cycle_id uuid)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE c public.treatment_cycles%ROWTYPE; n integer; unique_numbers integer; first_number integer; last_number integer; issues text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO c FROM public.treatment_cycles WHERE id = p_cycle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado' USING ERRCODE = '23503'; END IF;
  SELECT count(*), count(DISTINCT session_number), min(session_number), max(session_number) INTO n, unique_numbers, first_number, last_number FROM public.treatment_sessions WHERE cycle_id = c.id;
  IF n <> c.total_sessions OR c.total_sessions < 1 THEN
    issues := array_append(issues, format('Quantidade %s: ciclo previsto para %s sessões, mas possui %s registradas.', CASE WHEN n < c.total_sessions THEN 'incompleta' ELSE 'inconsistente' END, c.total_sessions, n));
  END IF;
  IF n <> c.total_sessions OR unique_numbers <> n OR first_number IS DISTINCT FROM 1 OR last_number IS DISTINCT FROM c.total_sessions THEN issues := array_append(issues, 'Numeração inconsistente: há sessões com sequência incompleta.'); END IF;
  IF EXISTS (SELECT 1 FROM public.treatment_sessions s WHERE s.cycle_id = c.id AND s.status NOT IN ('cancelada','remarcada') GROUP BY s.scheduled_date HAVING count(*) > 1) THEN
    issues := array_append(issues, 'Data duplicada: duas sessões ativas deste ciclo estão previstas para a mesma data.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.treatment_sessions s JOIN public.treatment_sessions other ON other.appointment_id = s.appointment_id AND other.id <> s.id WHERE s.cycle_id = c.id AND s.appointment_id IS NOT NULL) THEN
    issues := array_append(issues, 'Agendamento já vinculado a outra sessão deste ciclo ou de outro ciclo.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.treatment_sessions s LEFT JOIN public.agendamentos a ON a.id = s.appointment_id WHERE s.cycle_id = c.id AND
    (s.patient_id IS DISTINCT FROM c.patient_id OR s.professional_id IS DISTINCT FROM c.professional_id OR nullif(c.unit_id,'') IS NULL
     OR (s.appointment_id IS NOT NULL AND (a.id IS NULL OR a.paciente_id IS DISTINCT FROM c.patient_id OR a.profissional_id IS DISTINCT FROM c.professional_id OR a.unidade_id IS DISTINCT FROM c.unit_id OR a.data IS DISTINCT FROM s.scheduled_date)))) THEN
    issues := array_append(issues, 'Vínculo com paciente, profissional, unidade ou data divergente — revisão necessária.');
  END IF;
  RETURN issues;
END $$;

CREATE OR REPLACE FUNCTION public.assert_treatment_cycle_integrity(p_cycle_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE issues text[];
BEGIN
  issues := public.treatment_cycle_integrity_issues(p_cycle_id);
  IF cardinality(issues) > 0 THEN RAISE EXCEPTION '%', array_to_string(issues, ' ') USING ERRCODE = '23514'; END IF;
END $$;

-- Atomic new cycle / append-only extension. A failure rolls back this entire RPC.
CREATE OR REPLACE FUNCTION public.save_treatment_cycle_plan(p_cycle jsonb, p_dates date[], p_reason text, p_expected_total integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE c public.treatment_cycles%ROWTYPE; previous public.treatment_cycles%ROWTYPE;
 actor jsonb; planned integer; actual integer; added integer; issues text[];
BEGIN
  IF jsonb_typeof(p_cycle) <> 'object' OR p_cycle IS NULL THEN RAISE EXCEPTION 'Plano inválido' USING ERRCODE = '23514'; END IF;
  planned := (p_cycle->>'total_sessions')::integer;
  added := coalesce(cardinality(p_dates), 0);
  IF planned IS NULL OR planned NOT BETWEEN 1 AND 200 OR added < 1 OR p_expected_total IS NULL OR p_expected_total < 0 THEN
    RAISE EXCEPTION 'Quantidade de sessões inválida (1 a 200)' USING ERRCODE = '23514';
  END IF;
  IF added + p_expected_total <> planned THEN
    RAISE EXCEPTION 'Geração incompleta: % sessões previstas, mas % datas informadas.', planned, added + p_expected_total USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_dates) d WHERE d IS NULL) OR (SELECT count(DISTINCT d) FROM unnest(p_dates) d) <> added THEN
    RAISE EXCEPTION 'Data duplicada ou inválida no plano de sessões.' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO previous FROM public.treatment_cycles WHERE id = (p_cycle->>'id')::uuid FOR UPDATE;
  IF FOUND THEN
    actor := public.assert_treatment_write_scope(previous.professional_id, previous.unit_id, true);
    IF nullif(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Informe a justificativa da extensão.' USING ERRCODE = '23514'; END IF;
    IF previous.patient_id IS DISTINCT FROM p_cycle->>'patient_id' OR previous.professional_id IS DISTINCT FROM p_cycle->>'professional_id'
       OR previous.unit_id IS DISTINCT FROM p_cycle->>'unit_id' OR previous.total_sessions <> p_expected_total THEN
      RAISE EXCEPTION 'O ciclo mudou. Recarregue antes de estender.' USING ERRCODE = '40001';
    END IF;
    IF previous.status NOT IN ('em_andamento', 'concluido') THEN RAISE EXCEPTION 'Este ciclo não permite extensão.' USING ERRCODE = '23514'; END IF;
    PERFORM public.assert_treatment_cycle_integrity(previous.id);
    IF EXISTS (SELECT 1 FROM public.treatment_sessions s WHERE s.cycle_id = previous.id AND s.status NOT IN ('cancelada','remarcada') AND s.scheduled_date = ANY(p_dates)) THEN
      RAISE EXCEPTION 'Data duplicada: já existe sessão ativa neste ciclo na data informada.' USING ERRCODE = '23514';
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
  PERFORM public.assert_treatment_cycle_integrity(c.id);
  SELECT count(*) INTO actual FROM public.treatment_sessions WHERE cycle_id = c.id;
  INSERT INTO public.action_logs(user_id, user_nome, role, unidade_id, acao, entidade, entidade_id, modulo, paciente_id, profissional_id, detalhes)
    VALUES(actor->>'id', actor->>'nome', actor->>'role', c.unit_id, CASE WHEN p_expected_total = 0 THEN 'criar_ciclo_integridade' ELSE 'extensao_tratamento' END,
      'treatment_cycle', c.id::text, 'tratamentos', c.patient_id, c.professional_id,
      jsonb_build_object('motivo_alteracao', coalesce(p_reason, 'Criação explícita do plano de sessões'), 'total_anterior', p_expected_total, 'total_previsto', planned, 'total_registrado', actual));
  RETURN jsonb_build_object('cycle', to_jsonb(c), 'registered_sessions', actual);
END $$;

-- Lock per cycle and per appointment. Validate only changed invariants, allowing
-- unrelated clinical updates of legacy rows without silently repairing them.
CREATE OR REPLACE FUNCTION public.guard_treatment_session_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE c public.treatment_cycles%ROWTYPE; a public.agendamentos%ROWTYPE; check_date boolean; check_link boolean;
BEGIN
  check_date := TG_OP = 'INSERT'; check_link := TG_OP = 'INSERT';
  IF TG_OP = 'UPDATE' THEN
    check_date := NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date OR NEW.cycle_id IS DISTINCT FROM OLD.cycle_id OR (OLD.status IN ('cancelada','remarcada') AND NEW.status NOT IN ('cancelada','remarcada')) OR (NEW.appointment_id IS DISTINCT FROM OLD.appointment_id AND NEW.appointment_id IS NOT NULL);
    check_link := NEW.appointment_id IS DISTINCT FROM OLD.appointment_id OR NEW.cycle_id IS DISTINCT FROM OLD.cycle_id OR NEW.patient_id IS DISTINCT FROM OLD.patient_id OR NEW.professional_id IS DISTINCT FROM OLD.professional_id OR NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date;
    IF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date AND nullif(btrim(current_setting('app.treatment_change_reason', true)), '') IS NULL THEN
      RAISE EXCEPTION 'Informe uma justificativa pela revisão segura da sessão.' USING ERRCODE = '23514';
    END IF;
    IF NEW.session_number IS DISTINCT FROM OLD.session_number THEN
      RAISE EXCEPTION 'A numeração histórica não pode ser alterada automaticamente.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NOT check_date AND NOT check_link THEN RETURN NEW; END IF;
  SELECT * INTO c FROM public.treatment_cycles WHERE id = NEW.cycle_id FOR UPDATE;
  IF NOT FOUND OR NEW.patient_id IS DISTINCT FROM c.patient_id OR NEW.professional_id IS DISTINCT FROM c.professional_id THEN
    RAISE EXCEPTION 'Sessão divergente do paciente ou profissional do ciclo.' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' AND (NEW.session_number < 1 OR NEW.session_number > c.total_sessions OR EXISTS (SELECT 1 FROM public.treatment_sessions s WHERE s.cycle_id = c.id AND s.session_number = NEW.session_number)) THEN
    RAISE EXCEPTION 'Numeração inconsistente: a sessão excede ou repete a sequência planejada.' USING ERRCODE = '23514';
  END IF;
  IF check_date AND NEW.status NOT IN ('cancelada','remarcada') AND EXISTS(SELECT 1 FROM public.treatment_sessions s WHERE s.cycle_id = NEW.cycle_id AND s.id <> NEW.id AND s.scheduled_date = NEW.scheduled_date AND s.status NOT IN ('cancelada','remarcada')) THEN
    RAISE EXCEPTION 'Data duplicada: duas sessões ativas deste ciclo estão previstas para a mesma data.' USING ERRCODE = '23514';
  END IF;
  IF check_link AND NEW.appointment_id IS NOT NULL THEN
    SELECT * INTO a FROM public.agendamentos WHERE id = NEW.appointment_id FOR UPDATE;
    IF TG_OP = 'UPDATE' AND NEW.appointment_id IS DISTINCT FROM OLD.appointment_id THEN
      PERFORM public.assert_treatment_cycle_integrity(c.id);
    END IF;
    IF EXISTS (SELECT 1 FROM public.treatment_sessions s WHERE s.appointment_id = NEW.appointment_id AND s.id <> NEW.id) THEN
      RAISE EXCEPTION 'Agendamento já vinculado a outra sessão deste ciclo ou de outro ciclo.' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO a FROM public.agendamentos WHERE id = NEW.appointment_id;
    IF NOT FOUND OR a.paciente_id IS DISTINCT FROM c.patient_id OR a.profissional_id IS DISTINCT FROM c.professional_id OR a.unidade_id IS DISTINCT FROM c.unit_id OR a.data IS DISTINCT FROM NEW.scheduled_date THEN
      RAISE EXCEPTION 'Agendamento divergente de paciente, profissional, unidade ou data.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_treatment_session_duplicate_date ON public.treatment_sessions;
CREATE TRIGGER trg_guard_treatment_session_integrity BEFORE INSERT OR UPDATE OF scheduled_date, status, appointment_id, cycle_id, patient_id, professional_id, session_number ON public.treatment_sessions FOR EACH ROW EXECUTE FUNCTION public.guard_treatment_session_integrity();

CREATE OR REPLACE FUNCTION public.review_treatment_session_date(p_session_id uuid, p_expected_date date, p_date date, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE s public.treatment_sessions%ROWTYPE; c public.treatment_cycles%ROWTYPE; actor jsonb;
BEGIN
  IF nullif(btrim(p_reason),'') IS NULL OR p_date IS NULL THEN RAISE EXCEPTION 'Informe a data e a justificativa.' USING ERRCODE = '23514'; END IF;
  SELECT * INTO s FROM public.treatment_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sessão não encontrada.' USING ERRCODE = '23503'; END IF;
  SELECT * INTO c FROM public.treatment_cycles WHERE id = s.cycle_id FOR UPDATE;
  actor := public.assert_treatment_write_scope(c.professional_id, c.unit_id, true);
  IF s.appointment_id IS NOT NULL OR s.status <> 'pendente_agendamento' OR c.status <> 'em_andamento' THEN
    RAISE EXCEPTION 'Revisão de data permitida somente para sessão pendente sem vínculo. Histórico clínico preservado.' USING ERRCODE = '23514';
  END IF;
  IF s.scheduled_date IS DISTINCT FROM p_expected_date THEN RAISE EXCEPTION 'A sessão mudou. Recarregue.' USING ERRCODE = '40001'; END IF;
  IF p_date < CURRENT_DATE OR extract(isodow FROM p_date) IN (6,7) THEN RAISE EXCEPTION 'Selecione um dia útil futuro.' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM public.bloqueios b WHERE p_date BETWEEN b.data_inicio AND coalesce(b.data_fim,b.data_inicio) AND (b.profissional_id = c.professional_id OR (coalesce(b.profissional_id,'') = '' AND (coalesce(b.unidade_id,'') = '' OR b.unidade_id = c.unit_id))) AND (coalesce(b.dia_inteiro,true) OR coalesce(b.hora_inicio,'') = '')) THEN
    RAISE EXCEPTION 'Data bloqueada.' USING ERRCODE = '23514';
  END IF;
  PERFORM set_config('app.treatment_change_reason', btrim(p_reason), true);
  UPDATE public.treatment_sessions SET scheduled_date = p_date WHERE id = s.id;
  INSERT INTO public.action_logs(user_id, user_nome, role, unidade_id, acao, entidade, entidade_id, modulo, paciente_id, profissional_id, detalhes)
    VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'revisar_data_sessao','treatment_session',s.id::text,'tratamentos',c.patient_id,c.professional_id,jsonb_build_object('motivo_alteracao',btrim(p_reason),'data_anterior',s.scheduled_date,'data_nova',p_date));
  RETURN jsonb_build_object('id',s.id,'scheduled_date',p_date);
END $$;

CREATE OR REPLACE FUNCTION public.reschedule_treatment_session_checked(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text, p_new_date date, p_new_time text, p_check_patient_conflict boolean, p_manual_capacity boolean, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result jsonb; c public.treatment_cycles%ROWTYPE; actor jsonb;
BEGIN
  IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Informe a justificativa da remarcação.' USING ERRCODE = '23514'; END IF;
  SELECT * INTO c FROM public.treatment_cycles WHERE id = p_cycle_id;
  actor := public.assert_treatment_write_scope(c.professional_id,c.unit_id,false);
  PERFORM set_config('app.treatment_change_reason',btrim(p_reason),true);
  IF p_manual_capacity THEN
    result := public.reschedule_treatment_session_manual_capacity(p_session_id,p_cycle_id,p_expected_session_date,p_expected_appointment_id,p_new_date,p_new_time,p_check_patient_conflict);
  ELSE
    result := public.reschedule_treatment_session(p_session_id,p_cycle_id,p_expected_session_date,p_expected_appointment_id,p_new_date,p_new_time,p_check_patient_conflict);
  END IF;
  IF result->>'status' = 'remarcado' THEN
    PERFORM public.assert_treatment_cycle_integrity(c.id);
    INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,paciente_id,profissional_id,detalhes)
      VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'remarcar_sessao','treatment_session',p_session_id::text,'tratamentos',c.patient_id,c.professional_id,jsonb_build_object('motivo_alteracao',btrim(p_reason),'data_anterior',p_expected_session_date,'data_nova',p_new_date));
  END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.link_treatment_session_checked(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment_id text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result jsonb; c public.treatment_cycles%ROWTYPE; actor jsonb;
BEGIN
  IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Informe a justificativa do vínculo manual.' USING ERRCODE = '23514'; END IF;
  SELECT * INTO c FROM public.treatment_cycles WHERE id = p_cycle_id;
  actor := public.assert_treatment_write_scope(c.professional_id,c.unit_id,false);
  PERFORM public.assert_treatment_cycle_integrity(c.id);
  result := public.link_existing_treatment_session_appointment(p_session_id,p_cycle_id,p_expected_session_date,p_appointment_id);
  IF result->>'status' = 'ja_agendado' THEN
    INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,paciente_id,profissional_id,detalhes)
      VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'vincular_agenda_manual','treatment_session',p_session_id::text,'tratamentos',c.patient_id,c.professional_id,jsonb_build_object('motivo_alteracao',btrim(p_reason),'agendamento_id',p_appointment_id));
  END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.get_treatment_integrity_pending(p_page integer DEFAULT 0, p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE actor public.funcionarios%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO actor FROM public.funcionarios WHERE auth_user_id = auth.uid() AND ativo IS TRUE;
  IF NOT FOUND OR lower(btrim(actor.role)) <> 'master' THEN RAISE EXCEPTION 'Consulta exclusiva do Master.' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(pending)), '[]'::jsonb) INTO result FROM (
    SELECT to_jsonb(c) AS cycle, coalesce(p.nome, 'Paciente não localizado') AS patient_name,
      (SELECT count(*) FROM public.treatment_sessions s WHERE s.cycle_id = c.id) AS registered_sessions,
      public.treatment_cycle_integrity_issues(c.id) AS issues
    FROM public.treatment_cycles c LEFT JOIN public.pacientes p ON p.id = c.patient_id
    WHERE (actor.usuario = 'admin.sms' OR nullif(actor.unidade_id,'') IS NULL OR c.unit_id = actor.unidade_id)
      AND cardinality(public.treatment_cycle_integrity_issues(c.id)) > 0
    ORDER BY c.created_at DESC, c.id LIMIT greatest(1,least(coalesce(p_limit,20),50)) OFFSET greatest(coalesce(p_page,0),0) * greatest(1,least(coalesce(p_limit,20),50))
  ) pending;
  RETURN result;
END $$;

-- Deferred check: the cycle insert and all N sessions must commit together.
CREATE OR REPLACE FUNCTION public.guard_treatment_plan_count()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.total_sessions IS DISTINCT FROM OLD.total_sessions THEN
    IF EXISTS (SELECT 1 FROM public.treatment_cycles WHERE id = NEW.id) THEN
      PERFORM public.assert_treatment_cycle_integrity(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER trg_guard_treatment_plan_count AFTER INSERT OR UPDATE ON public.treatment_cycles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_treatment_plan_count();
REVOKE ALL ON FUNCTION public.guard_treatment_plan_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_treatment_plan_count() TO authenticated;

-- Existing clinical discharge remains explicit. Conclusion cannot silently remove
-- future sessions and end with fewer rows than its planned total.
CREATE OR REPLACE FUNCTION public.guard_treatment_discharge_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.tipo_alta::text = 'conclusao' THEN
    PERFORM 1 FROM public.treatment_cycles WHERE id = NEW.cycle_id FOR UPDATE;
    PERFORM public.assert_treatment_cycle_integrity(NEW.cycle_id);
    IF EXISTS (SELECT 1 FROM public.treatment_sessions WHERE cycle_id = NEW.cycle_id AND scheduled_date >= CURRENT_DATE AND status IN ('pendente_agendamento','agendada')) THEN
      RAISE EXCEPTION 'Conclusão não registrada: existem sessões futuras pendentes. Revise o ciclo; nenhuma sessão foi removida.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_treatment_discharge_integrity BEFORE INSERT ON public.patient_discharges FOR EACH ROW EXECUTE FUNCTION public.guard_treatment_discharge_integrity();
REVOKE ALL ON FUNCTION public.guard_treatment_discharge_integrity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_treatment_discharge_integrity() TO authenticated;

-- Guard the conclusion transition; no historical row is updated by deployment.
CREATE OR REPLACE FUNCTION public.guard_treatment_cycle_conclusion()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'concluido' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.assert_treatment_cycle_integrity(NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_treatment_cycle_conclusion BEFORE UPDATE OF status ON public.treatment_cycles FOR EACH ROW EXECUTE FUNCTION public.guard_treatment_cycle_conclusion();
REVOKE ALL ON FUNCTION public.assert_treatment_write_scope(text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_treatment_write_scope(text,text,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.treatment_cycle_integrity_issues(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.treatment_cycle_integrity_issues(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.assert_treatment_cycle_integrity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_treatment_cycle_integrity(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.save_treatment_cycle_plan(jsonb,date[],text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_treatment_cycle_plan(jsonb,date[],text,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.review_treatment_session_date(uuid,date,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_treatment_session_date(uuid,date,date,text) TO authenticated;
REVOKE ALL ON FUNCTION public.reschedule_treatment_session_checked(uuid,uuid,date,text,date,text,boolean,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_treatment_session_checked(uuid,uuid,date,text,date,text,boolean,boolean,text) TO authenticated;
REVOKE ALL ON FUNCTION public.link_treatment_session_checked(uuid,uuid,date,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_treatment_session_checked(uuid,uuid,date,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_treatment_integrity_pending(integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_treatment_integrity_pending(integer,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.guard_treatment_session_integrity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_treatment_session_integrity() TO authenticated;
REVOKE ALL ON FUNCTION public.guard_treatment_cycle_conclusion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_treatment_cycle_conclusion() TO authenticated;
COMMIT;
