-- Proposed deployment: keep this migration in source control; do not apply to
-- production until separately authorized and integration-tested.
BEGIN;

CREATE FUNCTION public.auto_fix_invalid_treatment_sessions_batch(
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

REVOKE ALL ON FUNCTION public.auto_fix_invalid_treatment_sessions_batch(uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_fix_invalid_treatment_sessions_batch(uuid, integer)
  TO authenticated;

COMMIT;
