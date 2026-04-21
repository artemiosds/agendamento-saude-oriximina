CREATE OR REPLACE FUNCTION public.get_treatment_cycles_paginated(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20,
  p_professional_id text DEFAULT NULL::text,
  p_unit_id text DEFAULT NULL::text,
  p_status text DEFAULT NULL::text,
  p_search text DEFAULT NULL::text,
  p_only_own_professional boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_offset integer;
  v_cycles jsonb;
  v_user_id text;
BEGIN
  v_offset := GREATEST(0, (p_page - 1) * p_page_size);

  IF p_only_own_professional THEN
    SELECT (f.id)::text INTO v_user_id
    FROM funcionarios f
    WHERE f.auth_user_id = auth.uid() AND f.ativo = true
    LIMIT 1;
  END IF;

  WITH base AS (
    SELECT c.*, p.nome AS paciente_nome
    FROM treatment_cycles c
    LEFT JOIN pacientes p ON p.id = c.patient_id
    WHERE
      (p_professional_id IS NULL OR c.professional_id = p_professional_id)
      AND (p_unit_id IS NULL OR c.unit_id = p_unit_id)
      AND (p_status IS NULL OR c.status = p_status)
      AND (NOT p_only_own_professional OR (v_user_id IS NOT NULL AND c.professional_id = v_user_id))
      AND (
        p_search IS NULL OR p_search = '' OR
        p.nome ILIKE '%' || p_search || '%' OR
        p.cpf ILIKE '%' || p_search || '%' OR
        p.cns ILIKE '%' || p_search || '%' OR
        c.treatment_type ILIKE '%' || p_search || '%'
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
        WHERE ts.cycle_id = pg.id AND ts.status = 'paciente_faltou'
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