CREATE OR REPLACE FUNCTION public.prevent_action_logs_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Registros de auditoria são legalmente imutáveis e não podem ser alterados ou excluídos.';
END; $$;

DROP TRIGGER IF EXISTS trg_action_logs_immutable ON public.action_logs;
CREATE TRIGGER trg_action_logs_immutable
BEFORE UPDATE OR DELETE ON public.action_logs
FOR EACH ROW EXECUTE FUNCTION public.prevent_action_logs_mutation();

DROP TRIGGER IF EXISTS trg_action_logs_no_truncate ON public.action_logs;
CREATE TRIGGER trg_action_logs_no_truncate
BEFORE TRUNCATE ON public.action_logs
FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_action_logs_mutation();