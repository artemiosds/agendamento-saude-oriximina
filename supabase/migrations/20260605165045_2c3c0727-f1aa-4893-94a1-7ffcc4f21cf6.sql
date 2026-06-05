-- Primeiro, removemos as versões existentes para evitar conflitos de sobrecarga (overloading)
DROP FUNCTION IF EXISTS public.get_treatment_cycles_paginated(integer, integer, text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.get_treatment_cycles_paginated(integer, integer, text, uuid, text, text, boolean);

-- Criamos a versão definitiva e unificada
CREATE OR REPLACE FUNCTION public.get_treatment_cycles_paginated(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20,
  p_professional_id text DEFAULT NULL,
  p_unit_id text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_only_own_professional boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_offset integer;
  v_cycles jsonb;
  v_user_id text;
  v_search_digits text;
BEGIN
  v_offset := GREATEST(0, (p_page - 1) * p_page_size);
  -- Remove caracteres não numéricos para busca de CPF/CNS
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
$$;

GRANT EXECUTE ON FUNCTION public.get_treatment_cycles_paginated TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_treatment_cycles_paginated TO anon;
GRANT EXECUTE ON FUNCTION public.get_treatment_cycles_paginated TO service_role;
