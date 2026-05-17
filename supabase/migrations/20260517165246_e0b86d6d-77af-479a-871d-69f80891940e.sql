
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram indexes for fast ILIKE / similarity search
CREATE INDEX IF NOT EXISTS idx_sigtap_proc_nome_trgm
  ON public.sigtap_procedimentos USING GIN (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sigtap_proc_codigo_trgm
  ON public.sigtap_procedimentos USING GIN (codigo gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_cid10_descricao_trgm
  ON public.cid10_codigos USING GIN (descricao gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cid10_codigo_trgm
  ON public.cid10_codigos USING GIN (codigo gin_trgm_ops);

-- Unified search RPC: returns top procedures and top CIDs ranked by relevance
CREATE OR REPLACE FUNCTION public.search_sigtap_and_cid(q text, lim int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q text := COALESCE(trim(q), '');
  v_procs jsonb;
  v_cids jsonb;
BEGIN
  IF v_q = '' THEN
    RETURN jsonb_build_object('procedimentos', '[]'::jsonb, 'cids', '[]'::jsonb);
  END IF;

  WITH p AS (
    SELECT codigo, nome, especialidade,
           GREATEST(similarity(nome, v_q), similarity(codigo, v_q)) AS score
    FROM public.sigtap_procedimentos
    WHERE ativo = true
      AND (nome ILIKE '%' || v_q || '%' OR codigo ILIKE v_q || '%' OR nome % v_q)
    ORDER BY (codigo ILIKE v_q || '%') DESC, score DESC, nome ASC
    LIMIT lim
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(p.*)), '[]'::jsonb) INTO v_procs FROM p;

  WITH c AS (
    SELECT DISTINCT ON (codigo) codigo, descricao,
           GREATEST(similarity(descricao, v_q), similarity(codigo, v_q)) AS score
    FROM public.cid10_codigos
    WHERE descricao ILIKE '%' || v_q || '%' OR codigo ILIKE v_q || '%' OR descricao % v_q
    ORDER BY codigo, score DESC
  ), c2 AS (
    SELECT * FROM c
    ORDER BY (codigo ILIKE v_q || '%') DESC, score DESC, codigo ASC
    LIMIT lim
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(c2.*)), '[]'::jsonb) INTO v_cids FROM c2;

  RETURN jsonb_build_object('procedimentos', v_procs, 'cids', v_cids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_sigtap_and_cid(text, int) TO anon, authenticated;

-- Helper: list procedures linked to a CID (for auto-suggestion when CID selected first)
CREATE OR REPLACE FUNCTION public.get_procedures_for_cid(p_cid text, lim int DEFAULT 10)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb)
  FROM (
    SELECT sp.codigo, sp.nome, sp.especialidade
    FROM public.sigtap_procedimento_cids spc
    JOIN public.sigtap_procedimentos sp ON sp.codigo = spc.procedimento_codigo
    WHERE spc.cid_codigo = p_cid AND sp.ativo = true
    ORDER BY sp.nome
    LIMIT lim
  ) t;
$$;

GRANT EXECUTE ON FUNCTION public.get_procedures_for_cid(text, int) TO anon, authenticated;
