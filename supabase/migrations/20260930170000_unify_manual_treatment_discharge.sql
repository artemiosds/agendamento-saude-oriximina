BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'tipo_alta'
  ) THEN
    CREATE TYPE public.tipo_alta AS ENUM ('conclusao', 'falta', 'outro');
  END IF;
END;
$$;

ALTER TABLE public.patient_discharges
  ADD COLUMN IF NOT EXISTS tipo_alta public.tipo_alta NOT NULL DEFAULT 'outro';

CREATE OR REPLACE FUNCTION public.register_treatment_discharge(
  p_cycle_id uuid,
  p_tipo_alta public.tipo_alta,
  p_reason text,
  p_final_notes text DEFAULT ''
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
  v_cycle record;
  v_discharge_id uuid;
  v_appointment_ids text[] := ARRAY[]::text[];
  v_removed_sessions integer := 0;
  v_removed_appointments integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da alta';
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

  SELECT c.id, c.patient_id, c.professional_id, c.unit_id, c.status,
         c.total_sessions, c.sessions_done
    INTO v_cycle
    FROM public.treatment_cycles c
   WHERE c.id = p_cycle_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ciclo de tratamento não encontrado';
  END IF;
  IF v_cycle.status NOT IN ('em_andamento', 'ativo') AND NOT (
       v_cycle.status = 'concluido'
       AND v_cycle.total_sessions > 0
       AND v_cycle.sessions_done >= v_cycle.total_sessions
     ) THEN
    RAISE EXCEPTION 'Este ciclo não está disponível para alta';
  END IF;
  IF EXISTS (SELECT 1 FROM public.patient_discharges d WHERE d.cycle_id = p_cycle_id) THEN
    RAISE EXCEPTION 'Este ciclo já possui alta registrada';
  END IF;

  IF v_role <> 'master' AND NOT (
    v_role = 'profissional' AND v_cycle.professional_id = v_staff.id::text
  ) THEN
    SELECT chosen.can_delete INTO v_permission FROM (
      SELECT pu.can_delete, 1 AS rank FROM public.permissoes_usuario pu
       WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento'
         AND pu.unidade_id = coalesce(v_staff.unidade_id, '')
         AND coalesce(v_staff.unidade_id, '') <> ''
      UNION ALL SELECT pu.can_delete, 2 FROM public.permissoes_usuario pu
       WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento' AND pu.unidade_id = ''
      UNION ALL SELECT p.can_delete, 3 FROM public.permissoes p
       WHERE p.perfil IN (v_role, lower(trim(v_staff.role))) AND p.modulo = 'tratamento'
         AND p.unidade_id = coalesce(v_staff.unidade_id, '')
         AND coalesce(v_staff.unidade_id, '') <> ''
      UNION ALL SELECT p.can_delete, 4 FROM public.permissoes p
       WHERE p.perfil IN (v_role, lower(trim(v_staff.role)))
         AND p.modulo = 'tratamento' AND p.unidade_id = ''
    ) chosen ORDER BY chosen.rank LIMIT 1;
    IF v_permission IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Sem permissão para registrar alta deste tratamento' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_role <> 'master' AND v_staff.usuario IS DISTINCT FROM 'admin.sms'
     AND nullif(v_staff.unidade_id, '') IS NOT NULL
     AND v_cycle.unit_id IS DISTINCT FROM v_staff.unidade_id THEN
    RAISE EXCEPTION 'Ciclo fora do escopo da unidade' USING ERRCODE = '42501';
  END IF;
  IF v_role <> 'master' AND v_staff.usuario IS DISTINCT FROM 'admin.sms'
     AND nullif(v_staff.unidade_id, '') IS NULL
     AND v_role <> 'profissional' THEN
    RAISE EXCEPTION 'Unidade do funcionário não identificada' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(s.appointment_id) FILTER (WHERE s.appointment_id IS NOT NULL), ARRAY[]::text[])
    INTO v_appointment_ids
    FROM public.treatment_sessions s
   WHERE s.cycle_id = p_cycle_id
     AND s.scheduled_date >= CURRENT_DATE
     AND s.status IN ('pendente_agendamento', 'agendada');

  INSERT INTO public.patient_discharges (
    cycle_id, patient_id, professional_id, discharge_date, reason, final_notes, tipo_alta
  ) VALUES (
    v_cycle.id, v_cycle.patient_id, v_staff.id::text,
    CURRENT_DATE, btrim(p_reason), coalesce(p_final_notes, ''), p_tipo_alta
  ) RETURNING id INTO v_discharge_id;

  DELETE FROM public.treatment_sessions s
   WHERE s.cycle_id = p_cycle_id
     AND s.scheduled_date >= CURRENT_DATE
     AND s.status IN ('pendente_agendamento', 'agendada');
  GET DIAGNOSTICS v_removed_sessions = ROW_COUNT;

  IF cardinality(v_appointment_ids) > 0 THEN
    DELETE FROM public.agendamentos a
     WHERE a.id = ANY(v_appointment_ids)
       AND a.paciente_id = v_cycle.patient_id
       AND a.profissional_id = v_cycle.professional_id
       AND a.unidade_id = v_cycle.unit_id
       AND a.status NOT IN ('cancelado', 'falta', 'remarcado', 'realizado', 'atendido', 'concluido');
    GET DIAGNOSTICS v_removed_appointments = ROW_COUNT;
  END IF;

  UPDATE public.treatment_cycles
     SET status = 'finalizado_alta', updated_at = now()
   WHERE id = p_cycle_id;

  RETURN jsonb_build_object(
    'discharge_id', v_discharge_id,
    'removed_sessions', v_removed_sessions,
    'removed_appointments', v_removed_appointments
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.register_treatment_discharge(uuid, public.tipo_alta, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_treatment_discharge(uuid, public.tipo_alta, text, text)
  TO authenticated;

COMMIT;
