CREATE OR REPLACE FUNCTION public.regularizar_atendimentos_anteriores_master(
  p_justificativa text, p_data_referencia date, p_total_confirmado integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor public.funcionarios%ROWTYPE;
  v_hoje date := (statement_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_motivo text := trim(coalesce(p_justificativa, ''));
  v_total integer;
BEGIN
  SELECT f.* INTO v_actor
  FROM public.funcionarios f
  WHERE f.auth_user_id = auth.uid() AND f.ativo IS TRUE AND lower(trim(f.role)) = 'master';

  IF NOT FOUND OR (v_actor.usuario IS DISTINCT FROM 'admin.sms' AND nullif(trim(v_actor.unidade_id), '') IS NULL) THEN
    RAISE EXCEPTION 'Acesso restrito a Masters com escopo válido.' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_motivo) NOT BETWEEN 10 AND 1000 OR coalesce(p_total_confirmado, 0) <= 0 THEN
    RAISE EXCEPTION 'Justificativa ou total de confirmação inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_data_referencia IS DISTINCT FROM v_hoje THEN
    RAISE EXCEPTION 'O plantão mudou. Atualize as pendências e confirme novamente.' USING ERRCODE = '40001';
  END IF;

  WITH fechados AS (
    UPDATE public.agendamentos a
    SET status = 'atendimento_encerrado'
    WHERE a.status = 'em_atendimento'
      AND a.data < v_hoje
      AND (v_actor.usuario = 'admin.sms' OR a.unidade_id = v_actor.unidade_id)
    RETURNING a.id, a.unidade_id, a.profissional_id, a.paciente_id, a.data
  ), registrados AS (
    INSERT INTO public.action_logs (
      user_id, user_nome, role, unidade_id, acao, acao_legivel, entidade,
      entidade_id, modulo, agendamento_id, profissional_id, paciente_id, detalhes
    )
    SELECT v_actor.id::text, v_actor.nome, v_actor.role, f.unidade_id,
      'fechamento_administrativo_pendencia_historica',
      'Fechamento administrativo de pendência histórica pelo Master', 'agendamento',
      f.id, 'atendimento', f.id, f.profissional_id, f.paciente_id,
      jsonb_build_object(
        'justificativa', v_motivo, 'data_original', f.data,
        'status_anterior', 'em_atendimento', 'status_novo', 'atendimento_encerrado'
      )
    FROM fechados f
    RETURNING id
  )
  SELECT count(*) INTO v_total FROM registrados;

  IF v_total <> p_total_confirmado THEN
    RAISE EXCEPTION 'O total de pendências mudou. Atualize a lista e confirme novamente.' USING ERRCODE = '40001';
  END IF;

  RETURN v_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.regularizar_atendimentos_anteriores_master(text, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regularizar_atendimentos_anteriores_master(text, date, integer) TO authenticated;
