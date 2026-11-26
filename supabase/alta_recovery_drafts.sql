-- Checkpoints privados de recuperação; não são documentos clínicos emitidos.
-- Aplicação manual no Lovable Cloud; não modifica prontuarios.
BEGIN;
CREATE TABLE IF NOT EXISTS public.alta_recovery_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL DEFAULT auth.uid(),
  profissional_id text NOT NULL,
  unidade_id text NOT NULL,
  paciente_id text NOT NULL,
  modo text NOT NULL CHECK (modo IN ('multi','individual')),
  report_id uuid,
  base_updated_at timestamptz,
  base_hash text NOT NULL CHECK (base_hash ~ '^[a-f0-9]{64}$'),
  changes jsonb NOT NULL CHECK (jsonb_typeof(changes)='object' AND octet_length(changes::text)<=524288),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL DEFAULT now()+interval '7 days'
);
ALTER TABLE public.alta_recovery_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.alta_recovery_drafts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alta_recovery_drafts TO authenticated;
CREATE INDEX IF NOT EXISTS alta_recovery_scope_idx ON public.alta_recovery_drafts(auth_user_id,profissional_id,unidade_id,paciente_id,modo,atualizado_em DESC);
CREATE OR REPLACE FUNCTION public.alta_recovery_scope_allowed(p_auth uuid,p_prof text,p_unit text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT p_auth=auth.uid() AND EXISTS(
    SELECT 1 FROM public.funcionarios f WHERE f.auth_user_id=auth.uid() AND f.id::text=p_prof AND f.ativo IS TRUE AND f.unidade_id=p_unit
    AND coalesce(f.unidade_id,'')<>'' AND (
      lower(btrim(f.role))='master' OR coalesce(
        (SELECT u.can_view FROM public.permissoes_usuario u WHERE u.user_id=p_prof AND u.modulo='relatorio_alta' AND u.unidade_id=p_unit LIMIT 1),
        (SELECT u.can_view FROM public.permissoes_usuario u WHERE u.user_id=p_prof AND u.modulo='relatorio_alta' AND u.unidade_id='' LIMIT 1),
        (SELECT p.can_view FROM public.permissoes p WHERE p.perfil=f.role AND p.modulo='relatorio_alta' AND p.unidade_id=p_unit LIMIT 1),
        (SELECT p.can_view FROM public.permissoes p WHERE p.perfil=f.role AND p.modulo='relatorio_alta' AND p.unidade_id='' LIMIT 1),
        false)
    )
  );
$fn$;
REVOKE ALL ON FUNCTION public.alta_recovery_scope_allowed(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.alta_recovery_scope_allowed(uuid,text,text) TO authenticated;
DROP POLICY IF EXISTS alta_recovery_select ON public.alta_recovery_drafts;
CREATE POLICY alta_recovery_select ON public.alta_recovery_drafts FOR SELECT TO authenticated
USING (expira_em>now() AND public.alta_recovery_scope_allowed(auth_user_id,profissional_id,unidade_id));
DROP POLICY IF EXISTS alta_recovery_insert ON public.alta_recovery_drafts;
CREATE POLICY alta_recovery_insert ON public.alta_recovery_drafts FOR INSERT TO authenticated
WITH CHECK (public.alta_recovery_scope_allowed(auth_user_id,profissional_id,unidade_id));
DROP POLICY IF EXISTS alta_recovery_update ON public.alta_recovery_drafts;
CREATE POLICY alta_recovery_update ON public.alta_recovery_drafts FOR UPDATE TO authenticated
USING (expira_em>now() AND public.alta_recovery_scope_allowed(auth_user_id,profissional_id,unidade_id))
WITH CHECK (public.alta_recovery_scope_allowed(auth_user_id,profissional_id,unidade_id));
DROP POLICY IF EXISTS alta_recovery_delete ON public.alta_recovery_drafts;
CREATE POLICY alta_recovery_delete ON public.alta_recovery_drafts FOR DELETE TO authenticated
USING (public.alta_recovery_scope_allowed(auth_user_id,profissional_id,unidade_id));
CREATE OR REPLACE FUNCTION public.alta_recovery_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.id,NEW.auth_user_id,NEW.profissional_id,NEW.unidade_id,NEW.paciente_id,NEW.modo,NEW.report_id,NEW.base_updated_at,NEW.base_hash)
 IS DISTINCT FROM (OLD.id,OLD.auth_user_id,OLD.profissional_id,OLD.unidade_id,OLD.paciente_id,OLD.modo,OLD.report_id,OLD.base_updated_at,OLD.base_hash) THEN
   RAISE EXCEPTION 'Contexto da recuperação é imutável.' USING ERRCODE='42501';
 END IF;
 NEW.atualizado_em:=clock_timestamp();
 NEW.expira_em:=NEW.atualizado_em+interval '7 days';
 RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.alta_recovery_stamp() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_alta_recovery_stamp ON public.alta_recovery_drafts;
CREATE TRIGGER trg_alta_recovery_stamp BEFORE INSERT OR UPDATE ON public.alta_recovery_drafts FOR EACH ROW EXECUTE FUNCTION public.alta_recovery_stamp();
-- Purge only expired private recovery copies, never official records.
SELECT cron.schedule('alta-recovery-expired-purge','17 4 * * *',
  $cleanup$DELETE FROM public.alta_recovery_drafts WHERE expira_em < now()$cleanup$);
COMMIT;
