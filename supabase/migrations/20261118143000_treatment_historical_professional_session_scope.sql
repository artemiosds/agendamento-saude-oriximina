-- Preserve the original professional on historical cycles while allowing the
-- active team in the same unit to operate their existing sessions.
-- Clinical plan changes still require an active professional as before.
BEGIN;

CREATE OR REPLACE FUNCTION public.assert_treatment_write_scope(p_professional_id text, p_unit_id text, p_manage boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_staff record; v_role text; v_permission boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT f.id, f.nome, f.role, f.usuario, f.unidade_id
    INTO v_staff
    FROM public.funcionarios f
   WHERE f.auth_user_id = auth.uid() AND f.ativo IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionário ativo não encontrado' USING ERRCODE = '42501';
  END IF;

  v_role := lower(trim(v_staff.role));
  v_role := CASE v_role
    WHEN 'gestão' THEN 'gestao' WHEN 'gestor' THEN 'gestao'
    WHEN 'coordenacao' THEN 'gestao' WHEN 'coordenador' THEN 'gestao'
    WHEN 'recepção' THEN 'recepcao' WHEN 'tecnico' THEN 'triagem'
    WHEN 'tecnico_enfermagem' THEN 'enfermagem' ELSE v_role END;
  IF nullif(v_role, '') IS NULL THEN
    RAISE EXCEPTION 'Perfil não identificado' USING ERRCODE = '42501';
  END IF;
  IF v_role NOT IN ('master','profissional') THEN
    SELECT chosen.allowed INTO v_permission FROM (
      SELECT CASE WHEN p_manage AND v_role <> 'profissional' THEN pu.can_delete ELSE pu.can_execute END AS allowed, 1 AS rank FROM public.permissoes_usuario pu
       WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento'
         AND pu.unidade_id = coalesce(v_staff.unidade_id, '') AND coalesce(v_staff.unidade_id, '') <> ''
      UNION ALL SELECT CASE WHEN p_manage AND v_role <> 'profissional' THEN pu.can_delete ELSE pu.can_execute END, 2 FROM public.permissoes_usuario pu
       WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento' AND pu.unidade_id = ''
      UNION ALL SELECT CASE WHEN p_manage AND v_role <> 'profissional' THEN p.can_delete ELSE p.can_execute END, 3 FROM public.permissoes p
       WHERE p.perfil IN (v_role, lower(trim(v_staff.role))) AND p.modulo = 'tratamento'
         AND p.unidade_id = coalesce(v_staff.unidade_id, '') AND coalesce(v_staff.unidade_id, '') <> ''
      UNION ALL SELECT CASE WHEN p_manage AND v_role <> 'profissional' THEN p.can_delete ELSE p.can_execute END, 4 FROM public.permissoes p
       WHERE p.perfil IN (v_role, lower(trim(v_staff.role))) AND p.modulo = 'tratamento' AND p.unidade_id = ''
    ) chosen ORDER BY chosen.rank LIMIT 1;
    IF v_permission IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Sem permissão para agendar sessões de tratamento' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_staff.usuario IS DISTINCT FROM 'admin.sms' AND
     (nullif(v_staff.unidade_id, '') IS NULL OR p_unit_id IS DISTINCT FROM v_staff.unidade_id) THEN
    RAISE EXCEPTION 'Fora do escopo de unidade' USING ERRCODE = '42501';
  END IF;
  IF p_manage AND v_role = 'profissional' AND p_professional_id <> v_staff.id::text THEN
    RAISE EXCEPTION 'Fora do escopo profissional' USING ERRCODE = '42501';
  END IF;
  IF nullif(p_unit_id, '') IS NULL OR nullif(p_professional_id, '') IS NULL THEN
    RAISE EXCEPTION 'Profissional ou unidade inválida' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.funcionarios WHERE id::text = p_professional_id AND ativo IS TRUE)
     AND (p_manage OR NOT EXISTS (
       SELECT 1 FROM public.treatment_cycles c
        WHERE c.professional_id = p_professional_id AND c.unit_id = p_unit_id
          AND c.status = 'em_andamento'
     )) THEN
    RAISE EXCEPTION 'Profissional ou unidade inválida' USING ERRCODE = '23514';
  END IF;
  RETURN to_jsonb(v_staff);
END $function$;

COMMIT;
