
-- Enable accent-insensitive search
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Rewrite unified search to:
--  * default limit 50 (configurable)
--  * accent-insensitive matching via unaccent()
--  * include procedures matched indirectly via CID linkage (sigtap_procedimento_cids)
--  * return a `matched_by` field ('codigo' | 'nome' | 'cid') on each procedure
--  * include the matched cid info when matched_by = 'cid'
CREATE OR REPLACE FUNCTION public.search_sigtap_and_cid(q text, lim integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_q text := COALESCE(trim(q), '');
  v_qu text;
  v_procs jsonb;
  v_cids jsonb;
BEGIN
  IF v_q = '' THEN
    RETURN jsonb_build_object('procedimentos', '[]'::jsonb, 'cids', '[]'::jsonb);
  END IF;

  v_qu := unaccent(v_q);

  WITH direct AS (
    SELECT sp.codigo,
           sp.nome,
           sp.especialidade,
           CASE WHEN sp.codigo ILIKE v_q || '%' THEN 'codigo' ELSE 'nome' END AS matched_by,
           NULL::text AS cid_codigo,
           NULL::text AS cid_descricao,
           GREATEST(
             similarity(unaccent(sp.nome), v_qu),
             similarity(sp.codigo, v_q),
             CASE WHEN sp.codigo ILIKE v_q || '%' THEN 1.0 ELSE 0 END
           ) AS score
    FROM public.sigtap_procedimentos sp
    WHERE sp.ativo = true
      AND (
        sp.codigo ILIKE v_q || '%'
        OR unaccent(sp.nome) ILIKE '%' || v_qu || '%'
        OR unaccent(sp.nome) % v_qu
      )
  ),
  by_cid AS (
    SELECT sp.codigo,
           sp.nome,
           sp.especialidade,
           'cid'::text AS matched_by,
           spc.cid_codigo,
           spc.cid_descricao,
           GREATEST(
             similarity(unaccent(COALESCE(spc.cid_descricao, '')), v_qu),
             similarity(spc.cid_codigo, v_q),
             CASE WHEN spc.cid_codigo ILIKE v_q || '%' THEN 0.95 ELSE 0 END
           ) AS score
    FROM public.sigtap_procedimento_cids spc
    JOIN public.sigtap_procedimentos sp
      ON sp.codigo = spc.procedimento_codigo AND sp.ativo = true
    WHERE spc.cid_codigo ILIKE v_q || '%'
       OR unaccent(COALESCE(spc.cid_descricao,'')) ILIKE '%' || v_qu || '%'
  ),
  unioned AS (
    SELECT * FROM direct
    UNION ALL
    SELECT * FROM by_cid
  ),
  ranked AS (
    SELECT DISTINCT ON (codigo)
           codigo, nome, especialidade, matched_by, cid_codigo, cid_descricao, score
    FROM unioned
    ORDER BY codigo, score DESC
  ),
  top_procs AS (
    SELECT codigo, nome, especialidade, matched_by, cid_codigo, cid_descricao
    FROM ranked
    ORDER BY (matched_by = 'codigo') DESC, score DESC, nome ASC
    LIMIT lim
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb) INTO v_procs FROM top_procs t;

  WITH c AS (
    SELECT DISTINCT ON (codigo) codigo, descricao,
           GREATEST(
             similarity(unaccent(descricao), v_qu),
             similarity(codigo, v_q),
             CASE WHEN codigo ILIKE v_q || '%' THEN 1.0 ELSE 0 END
           ) AS score
    FROM public.cid10_codigos
    WHERE codigo ILIKE v_q || '%'
       OR unaccent(descricao) ILIKE '%' || v_qu || '%'
       OR unaccent(descricao) % v_qu
    ORDER BY codigo, score DESC
  ), c2 AS (
    SELECT * FROM c
    ORDER BY (codigo ILIKE v_q || '%') DESC, score DESC, codigo ASC
    LIMIT lim
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(c2.*)), '[]'::jsonb) INTO v_cids FROM c2;

  RETURN jsonb_build_object('procedimentos', v_procs, 'cids', v_cids);
END;
$function$;

-- Increase default limit for "procedures linked to a CID" lookup
CREATE OR REPLACE FUNCTION public.get_procedures_for_cid(p_cid text, lim integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb)
  FROM (
    SELECT sp.codigo, sp.nome, sp.especialidade
    FROM public.sigtap_procedimento_cids spc
    JOIN public.sigtap_procedimentos sp ON sp.codigo = spc.procedimento_codigo
    WHERE spc.cid_codigo = p_cid AND sp.ativo = true
    ORDER BY sp.nome
    LIMIT lim
  ) t;
$function$;
