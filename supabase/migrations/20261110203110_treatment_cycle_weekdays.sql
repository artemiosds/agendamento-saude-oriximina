BEGIN;

CREATE OR REPLACE FUNCTION public.save_treatment_cycle_plan(p_cycle jsonb, p_dates date[], p_reason text, p_expected_total integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  IF p_cycle ? 'custom_data' AND jsonb_typeof(p_cycle->'custom_data') <> 'object' THEN
    RAISE EXCEPTION 'Dados adicionais do ciclo inválidos' USING ERRCODE = '23514';
  END IF;
  IF p_cycle ? 'custom_data' AND p_cycle->'custom_data' ? 'weekdays' AND
     (jsonb_typeof(p_cycle->'custom_data'->'weekdays') <> 'array' OR
      EXISTS (SELECT 1 FROM jsonb_array_elements(p_cycle->'custom_data'->'weekdays') AS day(value)
              WHERE jsonb_typeof(day.value) <> 'number' OR day.value::text NOT IN ('1','2','3','4','5','6')) OR
      (SELECT count(*) FROM jsonb_array_elements(p_cycle->'custom_data'->'weekdays')) <>
      (SELECT count(DISTINCT day.value) FROM jsonb_array_elements(p_cycle->'custom_data'->'weekdays') AS day(value))) THEN
    RAISE EXCEPTION 'Dias da semana inválidos' USING ERRCODE = '23514';
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
      custom_data = CASE WHEN p_cycle ? 'custom_data' THEN previous.custom_data || (p_cycle->'custom_data') ELSE previous.custom_data END,
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
    INSERT INTO public.treatment_cycles(id, patient_id, professional_id, unit_id, specialty, treatment_type, start_date, end_date_predicted, total_sessions, sessions_done, frequency, status, clinical_notes, created_by, pts_id, custom_data)
      VALUES((p_cycle->>'id')::uuid, p_cycle->>'patient_id', p_cycle->>'professional_id', p_cycle->>'unit_id', coalesce(p_cycle->>'specialty',''), p_cycle->>'treatment_type', (p_cycle->>'start_date')::date,
        (SELECT max(d) FROM unnest(p_dates) d), planned, 0, p_cycle->>'frequency', 'em_andamento', coalesce(p_cycle->>'clinical_notes',''), actor->>'id', nullif(p_cycle->>'pts_id','')::uuid, coalesce(p_cycle->'custom_data', '{}'::jsonb)) RETURNING * INTO c;
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
END $function$;

CREATE OR REPLACE FUNCTION public.auto_fix_invalid_treatment_sessions_batch(p_after uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_staff record;
  v_role text;
  v_can_view boolean;
  v_candidate record;
  v_session record;
  v_cycle record;
  v_appointment record;
  v_last_id uuid;
  v_count integer := 0;
  v_more boolean := false;
  v_invalid boolean;
  v_rows integer;
  v_status text;
  v_reason text;
  v_error_code text;
  v_results jsonb := '[]'::jsonb;
  v_note constant text :=
    'Cancelado automaticamente: data inválida (feriado/fim de semana/bloqueio)';
BEGIN
  IF auth.uid() IS NULL OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Autoajuste não autorizado ou lote inválido'
      USING ERRCODE = '42501';
  END IF;

  SELECT f.id, f.role, f.usuario, f.unidade_id
    INTO v_staff
    FROM public.funcionarios f
   WHERE f.auth_user_id = auth.uid() AND f.ativo IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionário não autorizado' USING ERRCODE = '42501';
  END IF;

  v_role := lower(trim(v_staff.role));
  v_role := CASE v_role
    WHEN 'gestão' THEN 'gestao'
    WHEN 'gestor' THEN 'gestao'
    WHEN 'coordenacao' THEN 'gestao'
    WHEN 'coordenador' THEN 'gestao'
    WHEN 'recepção' THEN 'recepcao'
    WHEN 'tecnico' THEN 'triagem'
    WHEN 'tecnico_enfermagem' THEN 'enfermagem'
    ELSE v_role
  END;

  -- The page allows master without a permission row. Everyone else must have
  -- an explicit effective can_view=true. Missing/NULL/error never grants access.
  IF v_role <> 'master' THEN
    SELECT ranked.can_view INTO v_can_view
      FROM (
        SELECT pu.can_view, 1 AS rank
          FROM public.permissoes_usuario pu
         WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento'
           AND pu.unidade_id = coalesce(v_staff.unidade_id, '')
           AND coalesce(v_staff.unidade_id, '') <> ''
        UNION ALL
        SELECT pu.can_view, 2
          FROM public.permissoes_usuario pu
         WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento'
           AND pu.unidade_id = ''
        UNION ALL
        SELECT p.can_view, 3
          FROM public.permissoes p
         WHERE p.perfil IN (v_role, lower(trim(v_staff.role)))
           AND p.modulo = 'tratamento'
           AND p.unidade_id = coalesce(v_staff.unidade_id, '')
           AND coalesce(v_staff.unidade_id, '') <> ''
        UNION ALL
        SELECT p.can_view, 4
          FROM public.permissoes p
         WHERE p.perfil IN (v_role, lower(trim(v_staff.role)))
           AND p.modulo = 'tratamento' AND p.unidade_id = ''
      ) ranked
     ORDER BY ranked.rank
     LIMIT 1;
    IF v_can_view IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Sem permissão para Gestão de Tratamentos'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Keyset pagination skips already pending/unlinked sessions. The predicate
  -- matches isWeekend/buildBlockedRanges: whole civil days, inclusive dates,
  -- global OR unit-only OR professional-specific (regardless of unit).
  FOR v_candidate IN
    SELECT s.id, s.cycle_id, s.patient_id, s.professional_id,
           s.status, s.scheduled_date, s.appointment_id, c.unit_id
      FROM public.treatment_sessions s
      JOIN public.treatment_cycles c ON c.id = s.cycle_id
     WHERE (p_after IS NULL OR s.id > p_after)
       AND s.status IN ('agendada', 'pendente_agendamento')
       AND s.appointment_id IS NOT NULL
       AND (v_staff.usuario = 'admin.sms' OR
            (nullif(v_staff.unidade_id, '') IS NOT NULL
             AND c.unit_id = v_staff.unidade_id))
       AND (v_role <> 'profissional' OR c.professional_id = v_staff.id::text)
       AND (
         (extract(isodow FROM s.scheduled_date) = 7 OR (extract(isodow FROM s.scheduled_date) = 6 AND NOT coalesce(c.custom_data->'weekdays' @> '[6]'::jsonb, false)))
         OR EXISTS (
           SELECT 1 FROM public.bloqueios b
            WHERE b.data_inicio <= s.scheduled_date
              AND b.data_fim >= s.scheduled_date
              AND (
                (coalesce(b.profissional_id, '') = ''
                 AND coalesce(b.unidade_id, '') = '')
                OR (coalesce(b.profissional_id, '') = ''
                    AND b.unidade_id = c.unit_id)
                OR b.profissional_id = s.professional_id
              )
              AND (b.dia_inteiro IS TRUE OR nullif(b.hora_inicio, '') IS NULL)
         )
       )
     ORDER BY s.id
     LIMIT p_limit + 1
  LOOP
    IF v_count = p_limit THEN
      v_more := true;
      EXIT;
    END IF;
    v_count := v_count + 1;
    v_last_id := v_candidate.id;
    v_status := 'falha';
    v_reason := 'alterado_concorrentemente';

    -- An EXCEPTION block is a subtransaction. If either UPDATE fails,
    -- changes to both records for this item are rolled back.
    BEGIN
      SELECT s.id, s.cycle_id, s.patient_id, s.professional_id,
             s.status, s.scheduled_date, s.appointment_id
        INTO v_session
        FROM public.treatment_sessions s
       WHERE s.id = v_candidate.id
       FOR UPDATE;

      IF NOT FOUND THEN
        v_reason := 'sessao_ausente';
      ELSIF v_session.status = 'pendente_agendamento'
            AND v_session.appointment_id IS NULL THEN
        v_status := 'ja_pendente';
        v_reason := NULL;
      ELSIF v_session.status NOT IN ('agendada', 'pendente_agendamento') THEN
        v_status := 'estado_protegido';
        v_reason := NULL;
      ELSIF v_session.cycle_id IS DISTINCT FROM v_candidate.cycle_id
         OR v_session.status IS DISTINCT FROM v_candidate.status
         OR v_session.scheduled_date IS DISTINCT FROM v_candidate.scheduled_date
         OR v_session.appointment_id IS DISTINCT FROM v_candidate.appointment_id
         OR v_session.patient_id IS DISTINCT FROM v_candidate.patient_id
         OR v_session.professional_id IS DISTINCT FROM v_candidate.professional_id THEN
        v_reason := 'alterado_concorrentemente';
      ELSE
        SELECT c.id, c.patient_id, c.professional_id, c.unit_id, c.custom_data
          INTO v_cycle
          FROM public.treatment_cycles c
         WHERE c.id = v_session.cycle_id
         FOR UPDATE;

        IF NOT FOUND THEN
          v_status := 'vinculo_inconsistente';
          v_reason := NULL;
        ELSIF v_cycle.patient_id IS DISTINCT FROM v_session.patient_id
           OR v_cycle.professional_id IS DISTINCT FROM v_session.professional_id
           OR v_cycle.unit_id IS DISTINCT FROM v_candidate.unit_id THEN
          v_status := 'vinculo_inconsistente';
          v_reason := NULL;
        ELSIF (v_staff.usuario <> 'admin.sms' AND
               (nullif(v_staff.unidade_id, '') IS NULL
                OR v_cycle.unit_id <> v_staff.unidade_id))
           OR (v_role = 'profissional'
               AND v_cycle.professional_id <> v_staff.id::text) THEN
          v_reason := 'escopo_alterado';
        ELSE
          SELECT (
            (extract(isodow FROM v_session.scheduled_date) = 7 OR (extract(isodow FROM v_session.scheduled_date) = 6 AND NOT coalesce(v_cycle.custom_data->'weekdays' @> '[6]'::jsonb, false)))
            OR EXISTS (
              SELECT 1 FROM public.bloqueios b
               WHERE b.data_inicio <= v_session.scheduled_date
                 AND b.data_fim >= v_session.scheduled_date
                 AND (
                   (coalesce(b.profissional_id, '') = ''
                    AND coalesce(b.unidade_id, '') = '')
                   OR (coalesce(b.profissional_id, '') = ''
                       AND b.unidade_id = v_cycle.unit_id)
                   OR b.profissional_id = v_session.professional_id
                 )
                 AND (b.dia_inteiro IS TRUE OR nullif(b.hora_inicio, '') IS NULL)
            )
          ) INTO v_invalid;

          IF NOT v_invalid THEN
            v_status := 'data_valida';
            v_reason := NULL;
          ELSE
            SELECT a.id, a.paciente_id, a.profissional_id,
                   a.unidade_id, a.data, a.status
              INTO v_appointment
              FROM public.agendamentos a
             WHERE a.id = v_session.appointment_id
             FOR UPDATE;

            IF NOT FOUND THEN
              v_status := 'vinculo_inconsistente';
              v_reason := NULL;
            ELSIF v_appointment.paciente_id IS DISTINCT FROM v_session.patient_id
               OR v_appointment.profissional_id IS DISTINCT FROM v_session.professional_id
               OR v_appointment.unidade_id IS DISTINCT FROM v_cycle.unit_id
               OR v_appointment.data IS DISTINCT FROM v_session.scheduled_date THEN
              v_status := 'vinculo_inconsistente';
              v_reason := NULL;
            ELSIF v_appointment.status <> 'confirmado' THEN
              v_status := 'estado_protegido';
              v_reason := NULL;
            ELSE
              UPDATE public.treatment_sessions s
                 SET status = 'pendente_agendamento', appointment_id = NULL
               WHERE s.id = v_session.id
                 AND s.cycle_id = v_session.cycle_id
                 AND s.status = v_session.status
                 AND s.scheduled_date = v_session.scheduled_date
                 AND s.appointment_id = v_session.appointment_id;
              GET DIAGNOSTICS v_rows = ROW_COUNT;
              IF v_rows <> 1 THEN
                RAISE EXCEPTION 'Sessão alterada durante o autoajuste';
              END IF;

              UPDATE public.agendamentos a
                 SET status = 'cancelado',
                     observacoes = CASE
                       WHEN position(v_note IN a.observacoes) > 0
                         THEN a.observacoes
                       WHEN a.observacoes = '' THEN v_note
                       ELSE a.observacoes || E'\n' || v_note
                     END
               WHERE a.id = v_appointment.id
                 AND a.status = 'confirmado'
                 AND a.paciente_id = v_session.patient_id
                 AND a.profissional_id = v_session.professional_id
                 AND a.unidade_id = v_cycle.unit_id
                 AND a.data = v_session.scheduled_date;
              GET DIAGNOSTICS v_rows = ROW_COUNT;
              IF v_rows <> 1 THEN
                RAISE EXCEPTION 'Agendamento alterado durante o autoajuste';
              END IF;
              v_status := 'corrigido';
              v_reason := NULL;
            END IF;
          END IF;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE;
      v_status := 'falha';
      v_reason := 'sqlstate_' || v_error_code;
    END;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'session_id', v_candidate.id,
        'status', v_status,
        'reason', v_reason
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'results', v_results,
    'next_cursor', v_last_id,
    'has_more', v_more
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.review_treatment_session_date(p_session_id uuid, p_expected_date date, p_date date, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  IF p_date < CURRENT_DATE OR (extract(isodow FROM p_date) = 7 OR (extract(isodow FROM p_date) = 6 AND NOT coalesce(c.custom_data->'weekdays' @> '[6]'::jsonb, false))) THEN RAISE EXCEPTION 'Selecione um dia útil futuro.' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM public.bloqueios b WHERE p_date BETWEEN b.data_inicio AND coalesce(b.data_fim,b.data_inicio) AND (b.profissional_id = c.professional_id OR (coalesce(b.profissional_id,'') = '' AND (coalesce(b.unidade_id,'') = '' OR b.unidade_id = c.unit_id))) AND (coalesce(b.dia_inteiro,true) OR coalesce(b.hora_inicio,'') = '')) THEN
    RAISE EXCEPTION 'Data bloqueada.' USING ERRCODE = '23514';
  END IF;
  PERFORM set_config('app.treatment_change_reason', btrim(p_reason), true);
  UPDATE public.treatment_sessions SET scheduled_date = p_date WHERE id = s.id;
  INSERT INTO public.action_logs(user_id, user_nome, role, unidade_id, acao, entidade, entidade_id, modulo, paciente_id, profissional_id, detalhes)
    VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'revisar_data_sessao','treatment_session',s.id::text,'tratamentos',c.patient_id,c.professional_id,jsonb_build_object('motivo_alteracao',btrim(p_reason),'ciclo',c.id,'sessao',s.id,'data_anterior',s.scheduled_date,'data_nova',p_date,'valor_anterior',to_jsonb(s),'valor_novo',jsonb_build_object('scheduled_date',p_date,'status',s.status,'appointment_id',s.appointment_id)));
  RETURN jsonb_build_object('id',s.id,'scheduled_date',p_date);
END $function$;

CREATE OR REPLACE FUNCTION public.restore_missing_treatment_session(p_cycle_id uuid, p_session_number integer, p_date date, p_reason text, p_confirmed boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  IF p_date IS NOT NULL AND (p_date<CURRENT_DATE OR (extract(isodow FROM p_date) = 7 OR (extract(isodow FROM p_date) = 6 AND NOT coalesce(c.custom_data->'weekdays' @> '[6]'::jsonb, false))) OR EXISTS (SELECT 1 FROM public.bloqueios b WHERE p_date BETWEEN b.data_inicio AND coalesce(b.data_fim,b.data_inicio) AND (b.profissional_id=c.professional_id OR (coalesce(b.profissional_id,'')='' AND (coalesce(b.unidade_id,'')='' OR b.unidade_id=c.unit_id))) AND (coalesce(b.dia_inteiro,true) OR coalesce(b.hora_inicio,'')=''))) THEN RAISE EXCEPTION 'Data inválida ou bloqueada. Escolha outra data ou deixe sem data para marcação posterior.' USING ERRCODE='23514'; END IF;
  INSERT INTO public.treatment_sessions(cycle_id,patient_id,professional_id,session_number,total_sessions,scheduled_date,status)
    VALUES(c.id,c.patient_id,c.professional_id,p_session_number,c.total_sessions,p_date,'pendente_agendamento') RETURNING * INTO s;
  INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,paciente_id,profissional_id,detalhes)
    VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'registrar_sessao_faltante','treatment_session',s.id::text,'tratamentos',c.patient_id,c.professional_id,jsonb_build_object('motivo_alteracao',btrim(p_reason),'ciclo',c.id,'sessao',s.id,'valor_anterior',NULL,'valor_novo',to_jsonb(s),'previsto',c.total_sessions,'registradas',actual+1));
  RETURN jsonb_build_object('status','created','session',to_jsonb(s),'registered_sessions',actual+1,'message',format('%s de %s sessões registradas. Sessão nº %s incluída manualmente, sem alterar os registros anteriores.',actual+1,c.total_sessions,p_session_number));
END $function$;

COMMIT;
