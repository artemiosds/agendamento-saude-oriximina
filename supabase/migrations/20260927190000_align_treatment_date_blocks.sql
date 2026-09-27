-- Align treatment date checks with is_date_blocked. Existing function signatures,
-- permissions and unrelated scheduling behavior remain unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.schedule_treatment_session(
  p_session_id uuid,
  p_cycle_id uuid,
  p_expected_session_date date,
  p_appointment jsonb,
  p_check_patient_conflict boolean
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
     AND s.appointment_id IS NULL AND s.scheduled_date = p_expected_session_date;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'Sessão alterada durante o agendamento' USING ERRCODE = '40001'; END IF;
  SELECT s.* INTO v_session FROM public.treatment_sessions s WHERE s.id = p_session_id;
  RETURN jsonb_build_object('status','agendado','session',to_jsonb(v_session),'appointment',to_jsonb(v_appointment));
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_fix_invalid_treatment_sessions_batch(
  p_after uuid DEFAULT NULL,
  p_limit integer DEFAULT 100
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
         extract(isodow FROM s.scheduled_date) IN (6, 7)
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
        SELECT c.id, c.patient_id, c.professional_id, c.unit_id
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
            extract(isodow FROM v_session.scheduled_date) IN (6, 7)
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

COMMIT;
