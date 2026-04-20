-- 1) Add unidade_id to permissoes (empty = global fallback)
ALTER TABLE public.permissoes
  ADD COLUMN IF NOT EXISTS unidade_id text NOT NULL DEFAULT '';

-- Drop old unique on (perfil, modulo) if exists, recreate including unidade
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='permissoes_perfil_modulo_key') THEN
    EXECUTE 'ALTER TABLE public.permissoes DROP CONSTRAINT IF EXISTS permissoes_perfil_modulo_key';
    EXECUTE 'DROP INDEX IF EXISTS public.permissoes_perfil_modulo_key';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS permissoes_perfil_modulo_unidade_uidx
  ON public.permissoes (perfil, modulo, unidade_id);

-- 2) New table for per-user overrides
CREATE TABLE IF NOT EXISTS public.permissoes_usuario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  unidade_id text NOT NULL DEFAULT '',
  modulo text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  can_execute boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS permissoes_usuario_user_modulo_unidade_uidx
  ON public.permissoes_usuario (user_id, modulo, unidade_id);

CREATE INDEX IF NOT EXISTS permissoes_usuario_user_idx
  ON public.permissoes_usuario (user_id);

ALTER TABLE public.permissoes_usuario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read permissoes_usuario" ON public.permissoes_usuario;
CREATE POLICY "Staff read permissoes_usuario"
ON public.permissoes_usuario
FOR SELECT
TO authenticated
USING (public.is_staff_member());

DROP POLICY IF EXISTS "Master manage permissoes_usuario" ON public.permissoes_usuario;
CREATE POLICY "Master manage permissoes_usuario"
ON public.permissoes_usuario
FOR ALL
TO authenticated
USING (public.has_staff_role('master'))
WITH CHECK (public.has_staff_role('master'));

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_permissoes_usuario_updated ON public.permissoes_usuario;
CREATE TRIGGER trg_permissoes_usuario_updated
BEFORE UPDATE ON public.permissoes_usuario
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

DROP TRIGGER IF EXISTS trg_permissoes_updated ON public.permissoes;
CREATE TRIGGER trg_permissoes_updated
BEFORE UPDATE ON public.permissoes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

-- 3) Realtime
ALTER TABLE public.permissoes REPLICA IDENTITY FULL;
ALTER TABLE public.permissoes_usuario REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.permissoes';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.permissoes_usuario';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- 4) Trigger to fire webhook-notify edge function on permission changes
CREATE OR REPLACE FUNCTION public.notify_permissao_alterada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_table text := TG_TABLE_NAME;
  v_op text := TG_OP;
BEGIN
  v_payload := jsonb_build_object(
    'evento', 'permissao_alterada',
    'tabela', v_table,
    'operacao', v_op,
    'old', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    'new', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    'timestamp', now()
  );

  INSERT INTO public.notification_logs (canal, evento, payload, status)
  VALUES ('webhook', 'permissao_alterada', v_payload, 'pendente');

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_permissoes ON public.permissoes;
CREATE TRIGGER trg_notify_permissoes
AFTER INSERT OR UPDATE OR DELETE ON public.permissoes
FOR EACH ROW EXECUTE FUNCTION public.notify_permissao_alterada();

DROP TRIGGER IF EXISTS trg_notify_permissoes_usuario ON public.permissoes_usuario;
CREATE TRIGGER trg_notify_permissoes_usuario
AFTER INSERT OR UPDATE OR DELETE ON public.permissoes_usuario
FOR EACH ROW EXECUTE FUNCTION public.notify_permissao_alterada();