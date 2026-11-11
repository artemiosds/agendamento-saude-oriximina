-- Permission writes are limited to the owner or to a unit master in their own unit.
-- Existing profile permissions are deliberately left unchanged.
CREATE OR REPLACE FUNCTION public.can_manage_permission_unit(p_unidade_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.funcionarios f
    WHERE f.auth_user_id = auth.uid()
      AND f.ativo IS TRUE
      AND f.role = 'master'
      AND (f.usuario = 'admin.sms' OR (p_unidade_id <> '' AND f.unidade_id = p_unidade_id))
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_permission_user(p_user_id text, p_unidade_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.can_manage_permission_unit(p_unidade_id)
    AND EXISTS (
      SELECT 1 FROM public.funcionarios actor
      WHERE actor.auth_user_id = auth.uid() AND actor.ativo IS TRUE AND actor.role = 'master'
        AND (actor.usuario = 'admin.sms' OR EXISTS (
          SELECT 1 FROM public.funcionarios target
          WHERE target.id::text = p_user_id AND target.unidade_id = p_unidade_id
        ))
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_permission_unit(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_permission_user(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_permission_unit(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_permission_user(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_read_permission_profile(p_perfil text, p_unidade_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.funcionarios f
    WHERE f.auth_user_id = auth.uid() AND f.ativo IS TRUE
      AND (p_unidade_id = '' OR p_unidade_id = f.unidade_id OR f.usuario = 'admin.sms')
      AND (
        (f.role = 'master') OR p_perfil = f.role
        OR (f.role IN ('gestor', 'coordenador', 'coordenacao', 'gestão') AND p_perfil = 'gestao')
        OR (f.role = 'tecnico' AND p_perfil = 'triagem')
        OR (f.role = 'tecnico_enfermagem' AND p_perfil = 'enfermagem')
        OR (f.role = 'recepção' AND p_perfil = 'recepcao')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_permission_user(p_user_id text, p_unidade_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.funcionarios actor
    WHERE actor.auth_user_id = auth.uid() AND actor.ativo IS TRUE
      AND (
        (actor.role = 'master' AND actor.usuario = 'admin.sms')
        OR (actor.role = 'master' AND (p_unidade_id = '' OR p_unidade_id = actor.unidade_id)
          AND EXISTS (SELECT 1 FROM public.funcionarios target
            WHERE target.id::text = p_user_id AND target.unidade_id = actor.unidade_id))
        OR (actor.id::text = p_user_id AND (p_unidade_id = '' OR p_unidade_id = actor.unidade_id))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_permission_profile(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_permission_user(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_permission_profile(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_permission_user(text, text) TO authenticated;

DROP POLICY IF EXISTS "Auth users read permissoes" ON public.permissoes;
CREATE POLICY "Auth users read permissoes" ON public.permissoes
FOR SELECT TO authenticated
USING (public.can_read_permission_profile(perfil, unidade_id));

DROP POLICY IF EXISTS "Staff read permissoes_usuario" ON public.permissoes_usuario;
CREATE POLICY "Staff read permissoes_usuario" ON public.permissoes_usuario
FOR SELECT TO authenticated
USING (public.can_read_permission_user(user_id, unidade_id));

DROP POLICY IF EXISTS "Master manages permissoes" ON public.permissoes;
CREATE POLICY "Master manages permissoes" ON public.permissoes
FOR ALL TO authenticated
USING (public.can_manage_permission_unit(unidade_id))
WITH CHECK (public.can_manage_permission_unit(unidade_id));

DROP POLICY IF EXISTS "Master manage permissoes_usuario" ON public.permissoes_usuario;
CREATE POLICY "Master manage permissoes_usuario" ON public.permissoes_usuario
FOR ALL TO authenticated
USING (public.can_manage_permission_user(user_id, unidade_id))
WITH CHECK (public.can_manage_permission_user(user_id, unidade_id));

-- Previously NULL individual actions were interpreted as false. Make that
-- existing decision explicit before enabling per-action inheritance in the client.
UPDATE public.permissoes_usuario
SET can_view = COALESCE(can_view, false),
    can_create = COALESCE(can_create, false),
    can_edit = COALESCE(can_edit, false),
    can_delete = COALESCE(can_delete, false),
    can_execute = COALESCE(can_execute, false)
WHERE can_view IS NULL OR can_create IS NULL OR can_edit IS NULL
   OR can_delete IS NULL OR can_execute IS NULL;

-- Preserve the existing notification format while adding a verifiable actor
-- from the authenticated database session to future permission changes.
CREATE OR REPLACE FUNCTION public.notify_permissao_alterada()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  v_payload := jsonb_build_object(
    'evento', 'permissao_alterada',
    'tabela', TG_TABLE_NAME,
    'operacao', TG_OP,
    'old', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    'new', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    'timestamp', now(),
    'ator_auth_id', auth.uid(),
    'ator_funcionario_id', (
      SELECT f.id FROM public.funcionarios f
      WHERE f.auth_user_id = auth.uid() AND f.ativo IS TRUE LIMIT 1
    )
  );

  INSERT INTO public.notification_logs (canal, evento, payload, status)
  VALUES ('webhook', 'permissao_alterada', v_payload, 'pendente');

  RETURN COALESCE(NEW, OLD);
END;
$$;
