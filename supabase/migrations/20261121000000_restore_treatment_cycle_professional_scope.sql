CREATE OR REPLACE FUNCTION public.get_treatment_cycles_scoped(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_professional_id text DEFAULT NULL::text, p_unit_id text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_only_own_professional boolean DEFAULT false, p_integrity_only boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor public.funcionarios%ROWTYPE;
  v_offset integer;
  v_cycles jsonb;
  v_user_id text;
  v_search_digits text;
BEGIN
  SELECT * INTO v_actor FROM public.funcionarios WHERE auth_user_id=auth.uid() AND ativo IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário ativo não encontrado.' USING ERRCODE='42501'; END IF;
  IF p_integrity_only AND lower(trim(v_actor.role))<>'master' THEN RAISE EXCEPTION 'Filtro exclusivo do Master.' USING ERRCODE='42501'; END IF;
  IF lower(trim(v_actor.role)) = 'profissional' THEN
    p_professional_id := v_actor.id::text;
    p_only_own_professional := true;
  END IF;
  IF v_actor.usuario IS DISTINCT FROM 'admin.sms' OR lower(trim(v_actor.role)) = 'profissional' THEN
    IF nullif(v_actor.unidade_id,'') IS NULL THEN RAISE EXCEPTION 'Unidade não identificada.' USING ERRCODE='42501'; END IF;
    p_unit_id:=v_actor.unidade_id;
  END IF;
  p_page_size:=greatest(1,least(coalesce(p_page_size,20),50));
  v_offset := GREATEST(0, (p_page - 1) * p_page_size);
  v_search_digits := regexp_replace(p_search, '\D', '', 'g');

  IF p_only_own_professional THEN
    v_user_id := v_actor.id::text;
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
      AND (NOT p_integrity_only OR cardinality(public.treatment_cycle_integrity_issues(c.id))>0)
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
        WHERE ts.cycle_id = pg.id AND ts.status IN ('paciente_faltou', 'falta')
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
