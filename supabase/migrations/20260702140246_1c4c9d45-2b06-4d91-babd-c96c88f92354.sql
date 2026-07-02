
-- 1) Sincronização retroativa
UPDATE public.prontuarios t SET paciente_nome = p.nome
  FROM public.pacientes p WHERE t.paciente_id = p.id AND t.paciente_nome IS DISTINCT FROM p.nome;
UPDATE public.agendamentos t SET paciente_nome = p.nome
  FROM public.pacientes p WHERE t.paciente_id = p.id AND t.paciente_nome IS DISTINCT FROM p.nome;
UPDATE public.atendimentos t SET paciente_nome = p.nome
  FROM public.pacientes p WHERE t.paciente_id = p.id AND t.paciente_nome IS DISTINCT FROM p.nome;
UPDATE public.fila_espera t SET paciente_nome = p.nome
  FROM public.pacientes p WHERE t.paciente_id = p.id AND t.paciente_nome IS DISTINCT FROM p.nome;
UPDATE public.documentos_gerados t SET paciente_nome = p.nome
  FROM public.pacientes p WHERE t.paciente_id = p.id AND t.paciente_nome IS DISTINCT FROM p.nome;
UPDATE public.whatsapp_queue t SET paciente_nome = p.nome
  FROM public.pacientes p WHERE t.paciente_id = p.id AND t.paciente_nome IS DISTINCT FROM p.nome;
UPDATE public.whatsapp_inbound_messages t SET paciente_nome = p.nome
  FROM public.pacientes p WHERE t.paciente_id = p.id AND t.paciente_nome IS DISTINCT FROM p.nome;
-- action_logs é histórico de auditoria — não sobrescrevemos para preservar contexto do evento.

-- 2) Trigger de propagação
CREATE OR REPLACE FUNCTION public.propagate_paciente_nome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.nome IS DISTINCT FROM OLD.nome THEN
    UPDATE public.prontuarios SET paciente_nome = NEW.nome WHERE paciente_id = NEW.id AND paciente_nome IS DISTINCT FROM NEW.nome;
    UPDATE public.agendamentos SET paciente_nome = NEW.nome WHERE paciente_id = NEW.id AND paciente_nome IS DISTINCT FROM NEW.nome;
    UPDATE public.atendimentos SET paciente_nome = NEW.nome WHERE paciente_id = NEW.id AND paciente_nome IS DISTINCT FROM NEW.nome;
    UPDATE public.fila_espera SET paciente_nome = NEW.nome WHERE paciente_id = NEW.id AND paciente_nome IS DISTINCT FROM NEW.nome;
    UPDATE public.documentos_gerados SET paciente_nome = NEW.nome WHERE paciente_id = NEW.id AND paciente_nome IS DISTINCT FROM NEW.nome;
    UPDATE public.whatsapp_queue SET paciente_nome = NEW.nome WHERE paciente_id = NEW.id AND paciente_nome IS DISTINCT FROM NEW.nome;
    UPDATE public.whatsapp_inbound_messages SET paciente_nome = NEW.nome WHERE paciente_id = NEW.id AND paciente_nome IS DISTINCT FROM NEW.nome;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_paciente_nome ON public.pacientes;
CREATE TRIGGER trg_propagate_paciente_nome
AFTER UPDATE OF nome ON public.pacientes
FOR EACH ROW EXECUTE FUNCTION public.propagate_paciente_nome();
