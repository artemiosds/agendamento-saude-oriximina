CREATE OR REPLACE FUNCTION public.reavaliar_todos_status_falta()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cfg jsonb;
  v_limite_alerta int := 2;
  v_limite_bloqueio int := 4;
  v_atualizados int := 0;
  v_bloqueados int := 0;
  v_faltosos int := 0;
  v_regulares int := 0;
BEGIN
  SELECT configuracoes->'config_fluxo_faltas' INTO v_cfg
  FROM public.system_config WHERE id = 'default';

  IF v_cfg IS NOT NULL THEN
    v_limite_alerta   := COALESCE((v_cfg->>'limite_alerta')::int, v_limite_alerta);
    v_limite_bloqueio := COALESCE((v_cfg->>'limite_bloqueio')::int, v_limite_bloqueio);
  END IF;

  WITH counts AS (
    SELECT p.id AS pid,
           COALESCE((SELECT COUNT(*) FROM public.agendamentos a WHERE a.paciente_id = p.id AND a.status = 'falta'),0)
         + COALESCE((SELECT COUNT(*) FROM public.treatment_sessions s WHERE s.patient_id = p.id AND s.status IN ('falta','paciente_faltou')),0) AS total
    FROM public.pacientes p
  ), upd AS (
    UPDATE public.pacientes p
       SET total_faltas = c.total,
           status_falta = CASE
             WHEN c.total >= v_limite_bloqueio THEN 'BLOQUEADO'
             WHEN c.total >= v_limite_alerta   THEN 'FALTOSO'
             ELSE 'REGULAR'
           END
      FROM counts c
     WHERE p.id = c.pid
       AND (p.total_faltas IS DISTINCT FROM c.total
            OR p.status_falta IS DISTINCT FROM CASE
                  WHEN c.total >= v_limite_bloqueio THEN 'BLOQUEADO'
                  WHEN c.total >= v_limite_alerta   THEN 'FALTOSO'
                  ELSE 'REGULAR' END)
     RETURNING p.status_falta
  )
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE status_falta='BLOQUEADO'),
         COUNT(*) FILTER (WHERE status_falta='FALTOSO'),
         COUNT(*) FILTER (WHERE status_falta='REGULAR')
    INTO v_atualizados, v_bloqueados, v_faltosos, v_regulares
    FROM upd;

  -- Limpa fila de bloqueio para pacientes que deixaram de estar BLOQUEADO
  UPDATE public.fila_espera fe
     SET status = 'atendido',
         hora_chamada = COALESCE(fe.hora_chamada, to_char(now(),'HH24:MI'))
   WHERE fe.origem_cadastro = 'BLOQUEIO_FALTA'
     AND fe.status IN ('aguardando','chamado')
     AND EXISTS (
       SELECT 1 FROM public.pacientes p
        WHERE p.id = fe.paciente_id AND p.status_falta <> 'BLOQUEADO'
     );

  RETURN jsonb_build_object(
    'atualizados', v_atualizados,
    'bloqueados', v_bloqueados,
    'faltosos', v_faltosos,
    'regulares', v_regulares,
    'limite_alerta', v_limite_alerta,
    'limite_bloqueio', v_limite_bloqueio
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reavaliar_todos_status_falta() TO authenticated, anon;