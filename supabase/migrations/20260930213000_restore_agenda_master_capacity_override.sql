-- Restore Master capacity overrides for internal appointments from the Agenda.
-- This permits overbooking only when the selected slot is valid and the only
-- server-side rejection is capacity/reserved capacity. Blocks, missing or
-- ambiguous availability, invalid times, and times outside the configured
-- consultation grid remain non-overridable.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_internal_appointment_with_policy_override(
  p_payload jsonb,
  p_override_reason text,
  p_bypass_careness boolean,
  p_capacity_override boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_staff public.funcionarios%ROWTYPE;
  v_check jsonb;
  v_careness jsonb;
  v_row public.agendamentos%ROWTYPE;
  v_capacity_reason text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_staff
  FROM public.funcionarios
  WHERE auth_user_id = auth.uid() AND ativo IS TRUE;

  IF NOT FOUND OR lower(trim(v_staff.role)) <> 'master' THEN
    RAISE EXCEPTION 'Somente Master pode autorizar esta exceção' USING ERRCODE = '42501';
  END IF;

  IF v_staff.usuario IS DISTINCT FROM 'admin.sms'
     AND v_staff.unidade_id IS DISTINCT FROM p_payload->>'unidade_id' THEN
    RAISE EXCEPTION 'Master sem acesso à unidade do agendamento' USING ERRCODE = '42501';
  END IF;

  IF length(btrim(coalesce(p_override_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo da exceção';
  END IF;

  IF coalesce(p_payload->>'origem', '') = 'externo' THEN
    RAISE EXCEPTION 'Origem externa não permitida nesta função';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    (p_payload->>'profissional_id') || '|' || (p_payload->>'unidade_id') || '|' || (p_payload->>'data'), 0));

  v_check := public.check_internal_slot_availability(
    p_payload->>'profissional_id',
    p_payload->>'unidade_id',
    (p_payload->>'data')::date,
    p_payload->>'hora'
  );

  v_capacity_reason := v_check->>'reason';
  IF NOT coalesce((v_check->>'available')::boolean, false)
     AND NOT (p_capacity_override AND coalesce(v_capacity_reason IN (
       'external_reservation', 'day_full', 'turno_full', 'hour_full'
     ), false)) THEN
    RAISE EXCEPTION 'Encaixe Master não permitido: %',
      coalesce(v_capacity_reason, 'indisponível');
  END IF;

  v_careness := public.check_patient_profession_careness(
    p_payload->>'paciente_id', p_payload->>'profissional_id', p_payload->>'unidade_id');
  IF coalesce((v_careness->>'blocked')::boolean, false) AND NOT p_bypass_careness THEN
    RAISE EXCEPTION '%', v_careness->>'message' USING ERRCODE = 'P0001';
  END IF;
  IF p_bypass_careness AND NOT coalesce((v_careness->>'blocked')::boolean, false) THEN
    RAISE EXCEPTION 'Não há carência ativa para ignorar';
  END IF;

  IF p_capacity_override THEN
    PERFORM pg_catalog.set_config('app.master_capacity_override', 'on', true);
  END IF;
  IF p_bypass_careness THEN
    PERFORM pg_catalog.set_config('app.profession_careness_override', 'on', true);
  END IF;

  INSERT INTO public.agendamentos(
    id, paciente_id, paciente_nome, unidade_id, sala_id, setor_id,
    profissional_id, profissional_nome, data, hora, status, tipo,
    observacoes, origem, criado_por, prioridade_perfil
  ) VALUES (
    p_payload->>'id', p_payload->>'paciente_id', p_payload->>'paciente_nome', p_payload->>'unidade_id',
    coalesce(p_payload->>'sala_id', ''), coalesce(p_payload->>'setor_id', ''),
    p_payload->>'profissional_id', p_payload->>'profissional_nome',
    (p_payload->>'data')::date, p_payload->>'hora', coalesce(p_payload->>'status', 'confirmado'),
    p_payload->>'tipo', coalesce(p_payload->>'observacoes', ''),
    coalesce(p_payload->>'origem', 'recepcao'), v_staff.id::text, 'normal'
  ) RETURNING * INTO v_row;

  PERFORM pg_catalog.set_config('app.master_capacity_override', 'off', true);
  PERFORM pg_catalog.set_config('app.profession_careness_override', 'off', true);

  INSERT INTO public.action_logs(
    user_id, user_nome, role, unidade_id, acao, entidade, entidade_id,
    detalhes, agendamento_id, paciente_id, profissional_id
  ) VALUES (
    v_staff.id::text, v_staff.nome, v_staff.role, v_row.unidade_id,
    'encaixe_master_excecao_carencia', 'agendamento', v_row.id,
    jsonb_build_object(
      'motivo', btrim(p_override_reason),
      'bypass_careness', p_bypass_careness,
      'capacity_override', p_capacity_override,
      'carencia', v_careness,
      'capacity', v_check
    ),
    v_row.id, v_row.paciente_id, v_row.profissional_id
  );

  RETURN jsonb_build_object('id', v_row.id, 'created', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_internal_appointment_with_policy_override(jsonb, text, boolean, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_internal_appointment_with_policy_override(jsonb, text, boolean, boolean)
  TO authenticated;

COMMIT;
