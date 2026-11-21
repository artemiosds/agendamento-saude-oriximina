CREATE OR REPLACE FUNCTION public.get_atendimentos_pendentes_master_page(
  p_periodo text,
  p_pagina integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_usuario text;
  v_unidade text;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_minutos integer := 60;
  v_limite constant integer := 15;
  v_pagina integer := greatest(coalesce(p_pagina, 1), 1);
  v_config jsonb;
  v_result jsonb;
BEGIN
  SELECT f.usuario, f.unidade_id INTO v_usuario, v_unidade
  FROM public.funcionarios f
  WHERE f.auth_user_id = auth.uid() AND f.ativo IS TRUE AND lower(trim(f.role)) = 'master';

  IF NOT FOUND OR (v_usuario IS DISTINCT FROM 'admin.sms' AND nullif(trim(v_unidade), '') IS NULL) THEN
    RAISE EXCEPTION 'Acesso restrito a Masters com escopo válido.' USING ERRCODE = '42501';
  END IF;

  IF p_periodo IS NULL OR p_periodo NOT IN ('hoje', 'anteriores') THEN
    RAISE EXCEPTION 'Período inválido.' USING ERRCODE = '22023';
  END IF;

  SELECT c.configuracoes #> '{config_fluxo_atendimento,alerta_minutos_em_atendimento}'
    INTO v_config
  FROM public.system_config c WHERE c.id = 'default';
  IF jsonb_typeof(v_config) = 'number' AND (v_config::text)::numeric BETWEEN 1 AND 1440 THEN
    v_minutos := (v_config::text)::numeric::integer;
  END IF;

  WITH candidates AS NOT MATERIALIZED (
    SELECT a.id, a.paciente_nome, a.profissional_nome, a.data, a.hora,
      coalesce(a.iniciado_em, CASE
        WHEN a.hora ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
          THEN (a.data + a.hora::time) AT TIME ZONE 'America/Sao_Paulo'
      END) AS inicio
    FROM public.agendamentos a
    WHERE a.status = 'em_atendimento'
      AND (v_usuario = 'admin.sms' OR a.unidade_id = v_unidade)
      AND ((p_periodo = 'hoje' AND a.data = v_hoje) OR (p_periodo = 'anteriores' AND a.data < v_hoje))
  ), eligible AS NOT MATERIALIZED (
    SELECT * FROM candidates
    WHERE p_periodo = 'anteriores' OR inicio < now() - make_interval(mins => v_minutos)
  ), page AS (
    SELECT id, paciente_nome, profissional_nome, data, hora, inicio,
      floor(extract(epoch FROM (now() - inicio)) / 60)::integer AS minutos_aberto
    FROM eligible
    ORDER BY data DESC, inicio DESC NULLS LAST, id DESC
    LIMIT v_limite OFFSET ((v_pagina::bigint - 1) * v_limite)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM eligible),
    'limite_minutos', v_minutos,
    'itens', coalesce((SELECT jsonb_agg(to_jsonb(page) - 'inicio' ORDER BY data DESC, inicio DESC NULLS LAST, id DESC) FROM page), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_atendimentos_pendentes_master_page(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_atendimentos_pendentes_master_page(text, integer) TO authenticated;

-- Keep earlier deployed clients working with their original response shape.
-- Their unit argument can narrow the scope, but cannot grant access.
CREATE OR REPLACE FUNCTION public.get_atendimentos_pendentes_master(
  p_unidade_id text DEFAULT NULL,
  p_minutos integer DEFAULT 60
)
RETURNS TABLE(
  id text, paciente_id text, paciente_nome text, profissional_id text,
  profissional_nome text, unidade_id text, data date, hora text,
  iniciado_em timestamptz, minutos_aberto integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT a.id, a.paciente_id, a.paciente_nome, a.profissional_id, a.profissional_nome,
    a.unidade_id, a.data, a.hora, a.iniciado_em,
    floor(extract(epoch FROM (now() - started.inicio)) / 60)::integer
  FROM public.funcionarios actor
  JOIN public.agendamentos a ON (actor.usuario = 'admin.sms' OR a.unidade_id = nullif(trim(actor.unidade_id), ''))
  CROSS JOIN LATERAL (
    SELECT coalesce(a.iniciado_em, CASE
      WHEN a.hora ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
        THEN (a.data + a.hora::time) AT TIME ZONE 'America/Sao_Paulo'
    END) AS inicio
  ) started
  WHERE actor.auth_user_id = auth.uid() AND actor.ativo IS TRUE AND lower(trim(actor.role)) = 'master'
    AND a.status = 'em_atendimento'
    AND (nullif(p_unidade_id, '') IS NULL OR a.unidade_id = p_unidade_id)
    AND started.inicio < now() - make_interval(mins => coalesce(p_minutos, 60))
  ORDER BY a.iniciado_em NULLS FIRST;
$function$;

REVOKE ALL ON FUNCTION public.get_atendimentos_pendentes_master(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_atendimentos_pendentes_master(text, integer) TO authenticated;
