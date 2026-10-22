-- Manual, confirmed regularization only. No historical UPDATE/backfill.
BEGIN;
ALTER TABLE public.treatment_sessions ALTER COLUMN scheduled_date DROP NOT NULL;
ALTER TABLE public.treatment_sessions ADD CONSTRAINT treatment_session_undated_pending_only CHECK (scheduled_date IS NOT NULL OR (status='pendente_agendamento' AND appointment_id IS NULL)) NOT VALID;
ALTER TABLE public.treatment_sessions VALIDATE CONSTRAINT treatment_session_undated_pending_only;
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
  IF EXISTS (SELECT 1 FROM public.treatment_sessions s WHERE s.cycle_id = c.id AND s.status NOT IN ('cancelada','remarcada') AND s.scheduled_date IS NOT NULL GROUP BY s.scheduled_date HAVING count(*) > 1) THEN
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
  IF EXISTS (SELECT 1 FROM public.treatment_sessions WHERE cycle_id=c.id AND scheduled_date IS NULL AND status NOT IN ('cancelada','remarcada')) THEN
    issues:=array_append(issues,'Sessão sem data — aguarda nova marcação manual.');
  END IF;
  RETURN issues;
END $$;

CREATE OR REPLACE FUNCTION public.guard_treatment_session_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    RAISE EXCEPTION 'Já existe a sessão nº % deste ciclo em %. Escolha outra data.', (SELECT s.session_number FROM public.treatment_sessions s WHERE s.cycle_id = NEW.cycle_id AND s.id <> NEW.id AND s.scheduled_date = NEW.scheduled_date AND s.status NOT IN ('cancelada','remarcada') ORDER BY s.session_number LIMIT 1), to_char(NEW.scheduled_date, 'DD/MM/YYYY') USING ERRCODE = '23514';
  END IF;
  IF check_link AND NEW.appointment_id IS NOT NULL THEN
    SELECT * INTO a FROM public.agendamentos WHERE id = NEW.appointment_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.treatment_sessions s WHERE s.appointment_id = NEW.appointment_id AND s.id <> NEW.id) THEN
      RAISE EXCEPTION 'Agendamento já vinculado à sessão nº % do ciclo %. O vínculo original foi preservado.', (SELECT s.session_number FROM public.treatment_sessions s WHERE s.appointment_id = NEW.appointment_id AND s.id <> NEW.id LIMIT 1), (SELECT s.cycle_id FROM public.treatment_sessions s WHERE s.appointment_id = NEW.appointment_id AND s.id <> NEW.id LIMIT 1) USING ERRCODE = '23514';
    END IF;
    SELECT * INTO a FROM public.agendamentos WHERE id = NEW.appointment_id;
    IF NOT FOUND OR a.paciente_id IS DISTINCT FROM c.patient_id OR a.profissional_id IS DISTINCT FROM c.professional_id OR a.unidade_id IS DISTINCT FROM c.unit_id OR a.data IS DISTINCT FROM NEW.scheduled_date THEN
      RAISE EXCEPTION 'Agendamento divergente de paciente, profissional, unidade ou data.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $function$;
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
    VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'revisar_data_sessao','treatment_session',s.id::text,'tratamentos',c.patient_id,c.professional_id,jsonb_build_object('motivo_alteracao',btrim(p_reason),'ciclo',c.id,'sessao',s.id,'data_anterior',s.scheduled_date,'data_nova',p_date,'valor_anterior',to_jsonb(s),'valor_novo',jsonb_build_object('scheduled_date',p_date,'status',s.status,'appointment_id',s.appointment_id)));
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
    -- The trigger validates the target session; unrelated historical gaps must not freeze this action.
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
  -- Historical discrepancies on other sessions do not block a valid manual link.
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
    WHERE (actor.usuario = 'admin.sms' OR (nullif(actor.unidade_id,'') IS NOT NULL AND c.unit_id = actor.unidade_id))
      AND cardinality(public.treatment_cycle_integrity_issues(c.id)) > 0
    ORDER BY c.created_at DESC, c.id LIMIT greatest(1,least(coalesce(p_limit,20),50)) OFFSET greatest(coalesce(p_page,0),0) * greatest(1,least(coalesce(p_limit,20),50))
  ) pending;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.schedule_treatment_session(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment jsonb, p_check_patient_conflict boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_staff record;
  v_role text;
  v_permission boolean;
  v_session record;
  v_cycle record;
  v_appointment public.agendamentos%ROWTYPE;
  v_id text;
  v_new_date date;
  v_blocked boolean;
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '42501';
  END IF;
  SELECT f.id, f.role, f.usuario, f.unidade_id
    INTO v_staff FROM public.funcionarios f
   WHERE f.auth_user_id = auth.uid() AND f.ativo IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário ativo não encontrado' USING ERRCODE = '42501'; END IF;

  v_role := lower(trim(v_staff.role));
  v_role := CASE v_role
    WHEN 'gestão' THEN 'gestao' WHEN 'gestor' THEN 'gestao'
    WHEN 'coordenacao' THEN 'gestao' WHEN 'coordenador' THEN 'gestao'
    WHEN 'recepção' THEN 'recepcao' WHEN 'tecnico' THEN 'triagem'
    WHEN 'tecnico_enfermagem' THEN 'enfermagem' ELSE v_role END;
  IF nullif(v_role, '') IS NULL THEN RAISE EXCEPTION 'Perfil não identificado' USING ERRCODE = '42501'; END IF;
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

  SELECT s.* INTO v_session FROM public.treatment_sessions s WHERE s.id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','nao_encontrado','reason','sessao'); END IF;
  SELECT c.* INTO v_cycle FROM public.treatment_cycles c WHERE c.id = p_cycle_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','vinculo_inconsistente','reason','ciclo_ausente'); END IF;
  IF v_session.cycle_id IS DISTINCT FROM p_cycle_id
     OR v_session.patient_id IS DISTINCT FROM v_cycle.patient_id
     OR v_session.professional_id IS DISTINCT FROM v_cycle.professional_id
     OR v_cycle.status <> 'em_andamento' THEN
    RETURN jsonb_build_object('status','vinculo_inconsistente','reason','ciclo_sessao');
  END IF;
  IF v_staff.usuario IS DISTINCT FROM 'admin.sms' AND
     (nullif(v_staff.unidade_id, '') IS NULL AND v_role <> 'master'
       OR nullif(v_staff.unidade_id, '') IS NOT NULL AND v_cycle.unit_id <> v_staff.unidade_id) THEN
    RAISE EXCEPTION 'Fora do escopo de unidade' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'profissional' AND v_cycle.professional_id <> v_staff.id::text THEN
    RAISE EXCEPTION 'Fora do escopo profissional' USING ERRCODE = '42501';
  END IF;
  IF v_session.status = 'agendada' AND v_session.appointment_id IS NOT NULL THEN
    SELECT a.* INTO v_appointment FROM public.agendamentos a WHERE a.id = v_session.appointment_id FOR UPDATE;
    IF FOUND AND v_appointment.paciente_id IS NOT DISTINCT FROM v_session.patient_id
       AND v_appointment.profissional_id IS NOT DISTINCT FROM v_session.professional_id
       AND v_appointment.unidade_id IS NOT DISTINCT FROM v_cycle.unit_id
       AND v_appointment.data IS NOT DISTINCT FROM v_session.scheduled_date
       AND v_appointment.data IS NOT DISTINCT FROM nullif(p_appointment->>'data','')::date
       AND v_appointment.hora IS NOT DISTINCT FROM p_appointment->>'hora'
       AND v_appointment.status = 'confirmado' THEN
      RETURN jsonb_build_object('status','ja_agendado','session',to_jsonb(v_session),'appointment',to_jsonb(v_appointment));
    END IF;
    IF FOUND THEN RETURN jsonb_build_object('status','estado_protegido','reason','sessao_ja_vinculada'); END IF;
    RETURN jsonb_build_object('status','vinculo_inconsistente','reason','agendamento_ausente');
  END IF;
  IF v_session.status <> 'pendente_agendamento' OR v_session.appointment_id IS NOT NULL
     OR v_session.scheduled_date IS DISTINCT FROM p_expected_session_date THEN
    RETURN jsonb_build_object('status','estado_protegido','reason','sessao_alterada');
  END IF;

  v_id := nullif(p_appointment->>'id', '');
  v_new_date := nullif(p_appointment->>'data','')::date;
  IF v_id IS NULL OR p_appointment->>'status' IS DISTINCT FROM 'confirmado'
     OR p_appointment->>'paciente_id' IS DISTINCT FROM v_cycle.patient_id
     OR p_appointment->>'profissional_id' IS DISTINCT FROM v_cycle.professional_id
     OR p_appointment->>'unidade_id' IS DISTINCT FROM v_cycle.unit_id
     OR v_new_date IS NULL
     OR nullif(p_appointment->>'hora','') IS NULL THEN
    RETURN jsonb_build_object('status','payload_invalido','reason','agendamento');
  END IF;
  IF v_role NOT IN ('master','profissional') THEN
    SELECT public.is_date_blocked(v_new_date,v_cycle.professional_id,v_cycle.unit_id) INTO v_blocked;
    IF v_blocked IS DISTINCT FROM false THEN
      RETURN jsonb_build_object('status','data_bloqueada','reason','indisponivel');
    END IF;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_cycle.patient_id || '|' || v_new_date::text || '|' || (p_appointment->>'hora'), 0));
  IF EXISTS (
    SELECT 1 FROM public.agendamentos a
     WHERE a.paciente_id = v_cycle.patient_id
       AND (p_check_patient_conflict IS TRUE OR a.profissional_id = v_cycle.professional_id)
       AND a.data = v_new_date AND a.hora = p_appointment->>'hora'
       AND a.status NOT IN ('cancelado','falta','remarcado')
  ) THEN RETURN jsonb_build_object('status','duplicado','reason','horario_ocupado'); END IF;

  INSERT INTO public.agendamentos (
    id,paciente_id,paciente_nome,unidade_id,sala_id,setor_id,profissional_id,profissional_nome,
    data,hora,status,tipo,observacoes,origem,google_event_id,sync_status,criado_por,prioridade_perfil
  ) VALUES (
    v_id,v_cycle.patient_id,p_appointment->>'paciente_nome',v_cycle.unit_id,
    coalesce(p_appointment->>'sala_id',''),coalesce(p_appointment->>'setor_id',''),
    v_cycle.professional_id,p_appointment->>'profissional_nome',v_new_date,
    p_appointment->>'hora','confirmado',p_appointment->>'tipo',coalesce(p_appointment->>'observacoes',''),
    coalesce(p_appointment->>'origem','recepcao'),coalesce(p_appointment->>'google_event_id',''),
    coalesce(p_appointment->>'sync_status','pendente'),coalesce(p_appointment->>'criado_por',''),'normal'
  ) RETURNING * INTO v_appointment;

  UPDATE public.treatment_sessions s
     SET appointment_id = v_id, status = 'agendada', scheduled_date = v_new_date
   WHERE s.id = p_session_id AND s.cycle_id = p_cycle_id AND s.status = 'pendente_agendamento'
     AND s.appointment_id IS NULL AND s.scheduled_date IS NOT DISTINCT FROM p_expected_session_date;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'Sessão alterada durante o agendamento' USING ERRCODE = '40001'; END IF;
  SELECT s.* INTO v_session FROM public.treatment_sessions s WHERE s.id = p_session_id;
  RETURN jsonb_build_object('status','agendado','session',to_jsonb(v_session),'appointment',to_jsonb(v_appointment));
END;
$function$;

CREATE OR REPLACE FUNCTION public.schedule_treatment_session_checked(p_session_id uuid,p_cycle_id uuid,p_expected_session_date date,p_appointment jsonb,p_check_patient_conflict boolean,p_manual_capacity boolean,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.treatment_sessions%ROWTYPE; c public.treatment_cycles%ROWTYPE; actor jsonb; result jsonb; new_date date;
BEGIN
  SELECT * INTO s FROM public.treatment_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sessão não encontrada.' USING ERRCODE='23503'; END IF;
  SELECT * INTO c FROM public.treatment_cycles WHERE id=p_cycle_id FOR UPDATE;
  actor:=public.assert_treatment_write_scope(c.professional_id,c.unit_id,false);
  IF s.cycle_id IS DISTINCT FROM c.id OR s.scheduled_date IS DISTINCT FROM p_expected_session_date THEN RAISE EXCEPTION 'A sessão mudou. Atualize o ciclo.' USING ERRCODE='40001'; END IF;
  new_date:=nullif(p_appointment->>'data','')::date;
  IF new_date IS DISTINCT FROM s.scheduled_date AND nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Informe o motivo da alteração da data.' USING ERRCODE='23514'; END IF;
  PERFORM set_config('app.treatment_change_reason',coalesce(nullif(btrim(p_reason),''),'Agendamento confirmado manualmente'),true);
  IF p_manual_capacity THEN
    result:=public.schedule_treatment_session_manual_capacity(p_session_id,p_cycle_id,p_expected_session_date,p_appointment,p_check_patient_conflict);
  ELSE
    result:=public.schedule_treatment_session_batch(p_session_id,p_cycle_id,p_expected_session_date,p_appointment,p_check_patient_conflict);
  END IF;
  IF result->>'status'='agendado' THEN
    INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,paciente_id,profissional_id,detalhes)
      VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'agendar_sessao','treatment_session',s.id::text,'tratamentos',c.patient_id,c.professional_id,jsonb_build_object('motivo_alteracao',coalesce(p_reason,'Agendamento confirmado manualmente'),'ciclo',c.id,'sessao',s.id,'valor_anterior',to_jsonb(s),'valor_novo',result->'session'));
  END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.clear_duplicate_treatment_session_date(p_session_id uuid,p_expected_date date,p_reason text,p_confirmed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.treatment_sessions%ROWTYPE; c public.treatment_cycles%ROWTYPE; kept public.treatment_sessions%ROWTYPE; actor jsonb; message text;
BEGIN
  IF p_confirmed IS DISTINCT FROM true OR nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Confirme a regularização e informe motivo_alteracao.' USING ERRCODE='23514'; END IF;
  SELECT * INTO s FROM public.treatment_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sessão não encontrada.' USING ERRCODE='23503'; END IF;
  SELECT * INTO c FROM public.treatment_cycles WHERE id=s.cycle_id FOR UPDATE;
  actor:=public.assert_treatment_write_scope(c.professional_id,c.unit_id,true);
  IF s.scheduled_date IS DISTINCT FROM p_expected_date THEN RAISE EXCEPTION 'A sessão mudou. Recarregue.' USING ERRCODE='40001'; END IF;
  IF s.status<>'pendente_agendamento' OR s.appointment_id IS NOT NULL OR c.status<>'em_andamento' OR s.scheduled_date IS NULL THEN RAISE EXCEPTION 'Somente sessão pendente, sem agendamento próprio e com data pode ser regularizada.' USING ERRCODE='23514'; END IF;
  SELECT other.* INTO kept FROM public.treatment_sessions other JOIN public.agendamentos a ON a.id=other.appointment_id
    WHERE other.cycle_id=c.id AND other.id<>s.id AND other.scheduled_date=s.scheduled_date
      AND other.status NOT IN ('cancelada','remarcada') AND a.status NOT IN ('cancelado','falta','remarcado')
      AND a.paciente_id=c.patient_id AND a.profissional_id=c.professional_id AND a.unidade_id=c.unit_id AND a.data=other.scheduled_date
    ORDER BY other.session_number LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Não há outra sessão com agendamento válido nesta data. Confira os vínculos antes de regularizar.' USING ERRCODE='23514'; END IF;
  PERFORM set_config('app.treatment_change_reason',btrim(p_reason),true);
  UPDATE public.treatment_sessions SET scheduled_date=NULL,status='pendente_agendamento' WHERE id=s.id;
  message:=format('Data duplicada removida da sessão nº %s. O dia %s permanece reservado para a sessão nº %s, que possui agendamento vinculado. Esta sessão aguarda uma nova data.',s.session_number,to_char(s.scheduled_date,'DD/MM/YYYY'),kept.session_number);
  INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,paciente_id,profissional_id,detalhes)
    VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'retirar_data_duplicada','treatment_session',s.id::text,'tratamentos',c.patient_id,c.professional_id,
      jsonb_build_object('motivo_alteracao',btrim(p_reason),'ciclo',c.id,'sessao',s.id,'data_anterior',s.scheduled_date,'estado_anterior',s.status,'estado_novo','pendente_agendamento','valor_anterior',to_jsonb(s),'valor_novo',jsonb_build_object('scheduled_date',NULL,'status','pendente_agendamento','appointment_id',NULL),'sessao_protegida',kept.id,'agendamento_protegido',kept.appointment_id,'mensagem',message));
  RETURN jsonb_build_object('message',message,'session_id',s.id,'protected_session_id',kept.id);
END $$;

CREATE OR REPLACE FUNCTION public.restore_missing_treatment_session(p_cycle_id uuid,p_session_number integer,p_date date,p_reason text,p_confirmed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.treatment_cycles%ROWTYPE; s public.treatment_sessions%ROWTYPE; actor jsonb; actual integer;
BEGIN
  IF p_confirmed IS DISTINCT FROM true OR nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Confirme a regularização e informe motivo_alteracao.' USING ERRCODE='23514'; END IF;
  SELECT * INTO c FROM public.treatment_cycles WHERE id=p_cycle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado.' USING ERRCODE='23503'; END IF;
  actor:=public.assert_treatment_write_scope(c.professional_id,c.unit_id,true);
  IF c.status<>'em_andamento' OR p_session_number IS NULL OR p_session_number<1 OR p_session_number>c.total_sessions THEN RAISE EXCEPTION 'Número fora do planejamento ou ciclo encerrado.' USING ERRCODE='23514'; END IF;
  SELECT * INTO s FROM public.treatment_sessions WHERE cycle_id=c.id AND session_number=p_session_number;
  IF FOUND THEN RETURN jsonb_build_object('status','already_exists','message',format('A sessão nº %s já está registrada. Nenhuma sessão foi duplicada.',p_session_number),'session',to_jsonb(s)); END IF;
  SELECT count(*) INTO actual FROM public.treatment_sessions WHERE cycle_id=c.id;
  IF actual>=c.total_sessions THEN RAISE EXCEPTION 'O ciclo já possui a quantidade planejada. Revise a numeração; não será criada sessão adicional.' USING ERRCODE='23514'; END IF;
  IF p_date IS NOT NULL AND (p_date<CURRENT_DATE OR extract(isodow FROM p_date) IN (6,7) OR EXISTS (SELECT 1 FROM public.bloqueios b WHERE p_date BETWEEN b.data_inicio AND coalesce(b.data_fim,b.data_inicio) AND (b.profissional_id=c.professional_id OR (coalesce(b.profissional_id,'')='' AND (coalesce(b.unidade_id,'')='' OR b.unidade_id=c.unit_id))) AND (coalesce(b.dia_inteiro,true) OR coalesce(b.hora_inicio,'')=''))) THEN RAISE EXCEPTION 'Data inválida ou bloqueada. Escolha outra data ou deixe sem data para marcação posterior.' USING ERRCODE='23514'; END IF;
  INSERT INTO public.treatment_sessions(cycle_id,patient_id,professional_id,session_number,total_sessions,scheduled_date,status)
    VALUES(c.id,c.patient_id,c.professional_id,p_session_number,c.total_sessions,p_date,'pendente_agendamento') RETURNING * INTO s;
  INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,paciente_id,profissional_id,detalhes)
    VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'registrar_sessao_faltante','treatment_session',s.id::text,'tratamentos',c.patient_id,c.professional_id,jsonb_build_object('motivo_alteracao',btrim(p_reason),'ciclo',c.id,'sessao',s.id,'valor_anterior',NULL,'valor_novo',to_jsonb(s),'previsto',c.total_sessions,'registradas',actual+1));
  RETURN jsonb_build_object('status','created','session',to_jsonb(s),'registered_sessions',actual+1,'message',format('%s de %s sessões registradas. Sessão nº %s incluída manualmente, sem alterar os registros anteriores.',actual+1,c.total_sessions,p_session_number));
END $$;
CREATE OR REPLACE FUNCTION public.get_treatment_cycles_scoped(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_professional_id text DEFAULT NULL::text, p_unit_id text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_only_own_professional boolean DEFAULT false, p_integrity_only boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor public.funcionarios%ROWTYPE;
  v_offset integer;
  v_cycles jsonb;
  v_user_id text;
  v_search_digits text;
BEGIN
  SELECT * INTO v_actor FROM public.funcionarios WHERE auth_user_id=auth.uid() AND ativo IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário ativo não encontrado.' USING ERRCODE='42501'; END IF;
  IF p_integrity_only AND lower(trim(v_actor.role))<>'master' THEN RAISE EXCEPTION 'Filtro exclusivo do Master.' USING ERRCODE='42501'; END IF;
  IF lower(trim(v_actor.role))='profissional' THEN p_professional_id:=v_actor.id::text; END IF;
  IF v_actor.usuario IS DISTINCT FROM 'admin.sms' THEN
    IF nullif(v_actor.unidade_id,'') IS NULL THEN RAISE EXCEPTION 'Unidade não identificada.' USING ERRCODE='42501'; END IF;
    p_unit_id:=v_actor.unidade_id;
  END IF;
  p_page_size:=greatest(1,least(coalesce(p_page_size,20),50));
  v_offset := GREATEST(0, (p_page - 1) * p_page_size);
  v_search_digits := regexp_replace(p_search, '\D', '', 'g');

  IF p_only_own_professional THEN
    SELECT (f.id)::text INTO v_user_id
    FROM funcionarios f
    WHERE f.auth_user_id = auth.uid() AND f.ativo = true
    LIMIT 1;
  END IF;

  WITH base AS (
    SELECT c.*, p.nome AS paciente_nome, f.nome AS professional_nome
    FROM treatment_cycles c
    LEFT JOIN pacientes p ON p.id = c.patient_id
    LEFT JOIN funcionarios f ON f.id::text = c.professional_id
    WHERE
      (p_professional_id IS NULL OR p_professional_id = '' OR p_professional_id = 'all' OR c.professional_id = p_professional_id)
      AND (p_unit_id IS NULL OR p_unit_id = '' OR p_unit_id = 'all' OR c.unit_id = p_unit_id)
      AND (
        p_status IS NULL OR p_status = '' OR p_status = 'all'
        OR (p_status != 'aguardando_agendamento' AND c.status = p_status)
        OR (p_status = 'aguardando_agendamento' AND EXISTS (
          SELECT 1 FROM treatment_sessions ts 
          WHERE ts.cycle_id = c.id AND ts.status = 'pendente_agendamento'
        ))
      )
      AND (NOT p_integrity_only OR cardinality(public.treatment_cycle_integrity_issues(c.id))>0)
      AND (NOT p_only_own_professional OR (v_user_id IS NOT NULL AND c.professional_id = v_user_id))
      AND (
        p_search IS NULL OR p_search = '' OR 
        unaccent(p.nome) ILIKE unaccent('%' || p_search || '%') OR 
        (v_search_digits <> '' AND p.cpf ILIKE '%' || v_search_digits || '%') OR 
        (v_search_digits <> '' AND p.cns ILIKE '%' || v_search_digits || '%') OR 
        unaccent(c.treatment_type) ILIKE unaccent('%' || p_search || '%') OR
        unaccent(f.nome) ILIKE unaccent('%' || p_search || '%')
      )
  ),
  counted AS (
    SELECT COUNT(*) AS total FROM base
  ),
  page AS (
    SELECT b.*
    FROM base b
    ORDER BY b.created_at DESC
    LIMIT p_page_size OFFSET v_offset
  ),
  with_stats AS (
    SELECT 
      pg.*,
      COALESCE((
        SELECT COUNT(*) FROM treatment_sessions ts 
        WHERE ts.cycle_id = pg.id AND ts.status = 'pendente_agendamento'
      ), 0) AS pending_ag,
      COALESCE((
        SELECT COUNT(*) FROM treatment_sessions ts 
        WHERE ts.cycle_id = pg.id AND ts.status IN ('paciente_faltou', 'falta')
      ), 0) AS faltas
    FROM page pg
  )
  SELECT jsonb_build_object(
    'total', (SELECT total FROM counted),
    'page', p_page,
    'page_size', p_page_size,
    'cycles', COALESCE(jsonb_agg(to_jsonb(with_stats.*)), '[]'::jsonb)
  )
  INTO v_cycles
  FROM with_stats;

  RETURN v_cycles;
END;
$function$;

REVOKE ALL ON FUNCTION public.schedule_treatment_session_checked(uuid,uuid,date,jsonb,boolean,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.schedule_treatment_session_checked(uuid,uuid,date,jsonb,boolean,boolean,text) TO authenticated;
REVOKE ALL ON FUNCTION public.clear_duplicate_treatment_session_date(uuid,date,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.clear_duplicate_treatment_session_date(uuid,date,text,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.restore_missing_treatment_session(uuid,integer,date,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restore_missing_treatment_session(uuid,integer,date,text,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.get_treatment_cycles_scoped(integer,integer,text,text,text,text,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_treatment_cycles_scoped(integer,integer,text,text,text,text,boolean,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_treatment_cycles_paginated(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_professional_id text DEFAULT NULL::text, p_unit_id text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_only_own_professional boolean DEFAULT false)
 RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $compat$
SELECT public.get_treatment_cycles_scoped(p_page,p_page_size,p_professional_id,p_unit_id,p_status,p_search,p_only_own_professional,false);
$compat$;
REVOKE ALL ON FUNCTION public.get_treatment_cycles_paginated(integer,integer,text,text,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_treatment_cycles_paginated(integer,integer,text,text,text,text,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.reschedule_treatment_session_with_room(p_session_id uuid,p_cycle_id uuid,p_expected_session_date date,p_expected_appointment_id text,p_new_date date,p_new_time text,p_check_patient_conflict boolean,p_manual_capacity boolean,p_reason text,p_new_room_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb; previous_room text; appointment public.agendamentos%ROWTYPE; c public.treatment_cycles%ROWTYPE; actor jsonb;
BEGIN
  result:=public.reschedule_treatment_session_checked(p_session_id,p_cycle_id,p_expected_session_date,p_expected_appointment_id,p_new_date,p_new_time,p_check_patient_conflict,p_manual_capacity,p_reason);
  IF result->>'status'='remarcado' THEN
    SELECT * INTO c FROM public.treatment_cycles WHERE id=p_cycle_id;
    actor:=public.assert_treatment_write_scope(c.professional_id,c.unit_id,false);
    SELECT sala_id INTO previous_room FROM public.agendamentos WHERE id=p_expected_appointment_id;
    UPDATE public.agendamentos SET sala_id=p_new_room_id WHERE id=p_expected_appointment_id RETURNING * INTO appointment;
    IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado; remarcação revertida.' USING ERRCODE='40001'; END IF;
    result:=jsonb_set(result,'{appointment}',to_jsonb(appointment));
    IF previous_room IS DISTINCT FROM p_new_room_id THEN
      INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,paciente_id,profissional_id,detalhes)
      VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'alterar_sala_sessao','treatment_session',p_session_id::text,'tratamentos',c.patient_id,c.professional_id,jsonb_build_object('motivo_alteracao',btrim(p_reason),'ciclo',c.id,'sessao',p_session_id,'valor_anterior',previous_room,'valor_novo',p_new_room_id));
    END IF;
  END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.reschedule_treatment_session_with_room(uuid,uuid,date,text,date,text,boolean,boolean,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reschedule_treatment_session_with_room(uuid,uuid,date,text,date,text,boolean,boolean,text,text) TO authenticated;
COMMIT;
