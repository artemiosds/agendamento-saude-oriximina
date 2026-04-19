-- 1) form_templates: motor de formulários dinâmicos
CREATE TABLE IF NOT EXISTS public.form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id text NOT NULL DEFAULT '',
  profissional_id text NOT NULL DEFAULT '',
  form_slug text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  descricao text NOT NULL DEFAULT '',
  schema jsonb NOT NULL DEFAULT '{"sections":[]}'::jsonb,
  ativo boolean NOT NULL DEFAULT true,
  versao integer NOT NULL DEFAULT 1,
  criado_por text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Hierarquia: (slug, profissional, unidade) único — permite 1 template por escopo
CREATE UNIQUE INDEX IF NOT EXISTS form_templates_slug_prof_unid_uidx
  ON public.form_templates (form_slug, profissional_id, unidade_id);

CREATE INDEX IF NOT EXISTS form_templates_slug_idx ON public.form_templates (form_slug);
CREATE INDEX IF NOT EXISTS form_templates_unid_idx ON public.form_templates (unidade_id);
CREATE INDEX IF NOT EXISTS form_templates_prof_idx ON public.form_templates (profissional_id);

ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read form_templates" ON public.form_templates;
CREATE POLICY "Staff read form_templates"
ON public.form_templates FOR SELECT TO authenticated
USING (public.is_staff_member());

DROP POLICY IF EXISTS "Master manage form_templates" ON public.form_templates;
CREATE POLICY "Master manage form_templates"
ON public.form_templates FOR ALL TO authenticated
USING (public.has_staff_role('master'))
WITH CHECK (public.has_staff_role('master'));

-- Profissional pode gerenciar seu próprio template (override individual)
DROP POLICY IF EXISTS "Professional manage own form_templates" ON public.form_templates;
CREATE POLICY "Professional manage own form_templates"
ON public.form_templates FOR ALL TO authenticated
USING (
  public.is_staff_member()
  AND profissional_id <> ''
  AND profissional_id IN (
    SELECT (f.id)::text FROM public.funcionarios f
    WHERE f.auth_user_id = auth.uid() AND f.ativo = true
  )
)
WITH CHECK (
  public.is_staff_member()
  AND profissional_id <> ''
  AND profissional_id IN (
    SELECT (f.id)::text FROM public.funcionarios f
    WHERE f.auth_user_id = auth.uid() AND f.ativo = true
  )
);

DROP TRIGGER IF EXISTS trg_form_templates_updated ON public.form_templates;
CREATE TRIGGER trg_form_templates_updated
BEFORE UPDATE ON public.form_templates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

-- 2) Realtime para reatividade instantânea
ALTER TABLE public.form_templates REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.form_templates';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- 3) RPC: resolução hierárquica (profissional > unidade > global)
CREATE OR REPLACE FUNCTION public.resolve_form_template(
  p_form_slug text,
  p_profissional_id text DEFAULT NULL,
  p_unidade_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- 1º: template do profissional (em qualquer unidade dele)
  IF p_profissional_id IS NOT NULL AND p_profissional_id <> '' THEN
    SELECT to_jsonb(t.*) INTO v_result
    FROM form_templates t
    WHERE t.form_slug = p_form_slug
      AND t.profissional_id = p_profissional_id
      AND t.ativo = true
    ORDER BY t.updated_at DESC
    LIMIT 1;
    IF v_result IS NOT NULL THEN
      RETURN jsonb_set(v_result, '{_origem}', '"profissional"'::jsonb);
    END IF;
  END IF;

  -- 2º: template da unidade
  IF p_unidade_id IS NOT NULL AND p_unidade_id <> '' THEN
    SELECT to_jsonb(t.*) INTO v_result
    FROM form_templates t
    WHERE t.form_slug = p_form_slug
      AND t.unidade_id = p_unidade_id
      AND t.profissional_id = ''
      AND t.ativo = true
    ORDER BY t.updated_at DESC
    LIMIT 1;
    IF v_result IS NOT NULL THEN
      RETURN jsonb_set(v_result, '{_origem}', '"unidade"'::jsonb);
    END IF;
  END IF;

  -- 3º: template global
  SELECT to_jsonb(t.*) INTO v_result
  FROM form_templates t
  WHERE t.form_slug = p_form_slug
    AND t.unidade_id = ''
    AND t.profissional_id = ''
    AND t.ativo = true
  ORDER BY t.updated_at DESC
  LIMIT 1;
  IF v_result IS NOT NULL THEN
    RETURN jsonb_set(v_result, '{_origem}', '"global"'::jsonb);
  END IF;

  RETURN NULL;
END;
$$;

-- 4) Seeds: slugs canônicos imutáveis (display_name editável)
INSERT INTO public.form_templates (form_slug, display_name, descricao, unidade_id, profissional_id, schema, criado_por)
SELECT * FROM (VALUES
  ('initial_eval', 'Avaliação Inicial', 'Primeira consulta / avaliação clínica do paciente', '', '', '{"sections":[]}'::jsonb, 'system'),
  ('consulta_padrao', 'Consulta', 'Consulta padrão de retorno ou rotina', '', '', '{"sections":[]}'::jsonb, 'system'),
  ('retorno', 'Retorno', 'Consulta de retorno / reavaliação', '', '', '{"sections":[]}'::jsonb, 'system'),
  ('session', 'Sessão de Tratamento', 'Sessão de tratamento (fisio, fono, psico, TO)', '', '', '{"sections":[]}'::jsonb, 'system')
) AS v(form_slug, display_name, descricao, unidade_id, profissional_id, schema, criado_por)
WHERE NOT EXISTS (
  SELECT 1 FROM public.form_templates ft
  WHERE ft.form_slug = v.form_slug AND ft.unidade_id = '' AND ft.profissional_id = ''
);