CREATE OR REPLACE FUNCTION public.save_document_template(
  p_template_id uuid DEFAULT NULL,
  p_nome text DEFAULT '',
  p_tipo text DEFAULT 'Atestado Médico',
  p_conteudo text DEFAULT '',
  p_ativo boolean DEFAULT true,
  p_perfis_permitidos text[] DEFAULT ARRAY['master','profissional'],
  p_tipo_modelo text DEFAULT NULL,
  p_unidade_id text DEFAULT NULL,
  p_blocos_clinicos jsonb DEFAULT '[]'::jsonb,
  p_versoes jsonb DEFAULT '[]'::jsonb
)
RETURNS public.document_templates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_staff record;
  v_existing public.document_templates%ROWTYPE;
  v_result public.document_templates%ROWTYPE;
  v_tipo_modelo text := COALESCE(NULLIF(p_tipo_modelo, ''), 'UNIDADE');
  v_target_unidade text := COALESCE(p_unidade_id, '');
  v_is_manager boolean := false;
  v_is_global_owner boolean := false;
BEGIN
  SELECT id::text AS id, nome, usuario, role, COALESCE(unidade_id, '') AS unidade_id
    INTO v_staff
    FROM public.funcionarios
   WHERE auth_user_id = auth.uid()
     AND ativo = true
   LIMIT 1;

  IF v_staff.id IS NULL THEN
    RAISE EXCEPTION 'usuario_sem_perfil_ativo' USING ERRCODE = '42501';
  END IF;

  v_is_global_owner := (v_staff.usuario = 'admin.sms');
  v_is_manager := v_is_global_owner OR v_staff.role IN ('master', 'coordenador', 'gestao');

  IF length(trim(COALESCE(p_nome, ''))) = 0 THEN
    RAISE EXCEPTION 'nome_obrigatorio';
  END IF;

  IF length(trim(COALESCE(p_conteudo, ''))) = 0 THEN
    RAISE EXCEPTION 'conteudo_obrigatorio';
  END IF;

  IF p_template_id IS NOT NULL THEN
    SELECT * INTO v_existing
      FROM public.document_templates
     WHERE id = p_template_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'template_nao_encontrado';
    END IF;

    v_tipo_modelo := COALESCE(NULLIF(p_tipo_modelo, ''), v_existing.tipo_modelo, 'UNIDADE');
    v_target_unidade := COALESCE(p_unidade_id, v_existing.unidade_id, '');

    IF v_tipo_modelo NOT IN ('GLOBAL', 'UNIDADE', 'PROFISSIONAL') THEN
      v_tipo_modelo := v_existing.tipo_modelo;
    END IF;

    IF NOT v_is_global_owner AND v_tipo_modelo = 'GLOBAL' AND v_existing.tipo_modelo <> 'GLOBAL' THEN
      RAISE EXCEPTION 'apenas_admin_sms_pode_salvar_modelo_global' USING ERRCODE = '42501';
    END IF;

    IF v_tipo_modelo = 'GLOBAL' THEN
      v_target_unidade := '';
    ELSIF NOT v_is_global_owner THEN
      v_target_unidade := v_staff.unidade_id;
    END IF;

    IF NOT v_is_global_owner THEN
      IF v_existing.tipo_modelo = 'GLOBAL' THEN
        RAISE EXCEPTION 'modelo_global_nao_editavel' USING ERRCODE = '42501';
      END IF;

      IF v_is_manager THEN
        IF COALESCE(v_existing.unidade_id, '') NOT IN ('', v_staff.unidade_id) THEN
          RAISE EXCEPTION 'template_de_outra_unidade' USING ERRCODE = '42501';
        END IF;
      ELSIF v_existing.criado_por <> v_staff.id THEN
        RAISE EXCEPTION 'template_de_outro_profissional' USING ERRCODE = '42501';
      END IF;
    END IF;

    UPDATE public.document_templates
       SET nome = trim(p_nome),
           tipo = COALESCE(NULLIF(p_tipo, ''), v_existing.tipo),
           conteudo = p_conteudo,
           ativo = COALESCE(p_ativo, true),
           perfis_permitidos = COALESCE(p_perfis_permitidos, v_existing.perfis_permitidos),
           tipo_modelo = v_tipo_modelo,
           unidade_id = v_target_unidade,
           blocos_clinicos = COALESCE(p_blocos_clinicos, v_existing.blocos_clinicos, '[]'::jsonb),
           versoes = COALESCE(p_versoes, v_existing.versoes, '[]'::jsonb),
           updated_at = now()
     WHERE id = p_template_id
     RETURNING * INTO v_result;

    RETURN v_result;
  END IF;

  v_tipo_modelo := COALESCE(NULLIF(p_tipo_modelo, ''), 'UNIDADE');
  IF v_tipo_modelo NOT IN ('GLOBAL', 'UNIDADE', 'PROFISSIONAL') THEN
    v_tipo_modelo := 'UNIDADE';
  END IF;

  IF NOT v_is_global_owner AND v_tipo_modelo = 'GLOBAL' THEN
    RAISE EXCEPTION 'apenas_admin_sms_pode_salvar_modelo_global' USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_manager AND v_tipo_modelo <> 'PROFISSIONAL' THEN
    v_tipo_modelo := 'PROFISSIONAL';
  END IF;

  IF v_tipo_modelo = 'GLOBAL' THEN
    v_target_unidade := '';
  ELSIF v_is_global_owner THEN
    v_target_unidade := COALESCE(p_unidade_id, '');
  ELSE
    v_target_unidade := v_staff.unidade_id;
  END IF;

  INSERT INTO public.document_templates (
    nome, tipo, conteudo, ativo, perfis_permitidos, tipo_modelo, unidade_id,
    criado_por, criado_por_nome, blocos_clinicos, versoes
  ) VALUES (
    trim(p_nome),
    COALESCE(NULLIF(p_tipo, ''), 'Atestado Médico'),
    p_conteudo,
    COALESCE(p_ativo, true),
    COALESCE(p_perfis_permitidos, ARRAY['master','profissional']),
    v_tipo_modelo,
    v_target_unidade,
    v_staff.id,
    v_staff.nome,
    COALESCE(p_blocos_clinicos, '[]'::jsonb),
    COALESCE(p_versoes, '[]'::jsonb)
  ) RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_document_template(uuid, text, text, text, boolean, text[], text, text, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_document_template(uuid, text, text, text, boolean, text[], text, text, jsonb, jsonb) TO service_role;