CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

ALTER TABLE public.agendamentos ADD CONSTRAINT ag_diagnostic_slot_valid CHECK (
  NOT (lower(tipo)='exame' AND custom_data->>'sala_tipo'='aparelho_diagnostico'
    AND status NOT IN ('cancelado','falta','paciente_faltou','remarcado')
    AND coalesce(custom_data->>'status_exame','') <> 'cancelado')
  OR CASE WHEN hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:00)?$'
    AND custom_data->>'duracao_slot_minutos' IN ('10','15','20','30','45')
    THEN unidade_id IS NOT NULL AND unidade_id<>'' AND sala_id IS NOT NULL AND sala_id<>''
      AND data IS NOT NULL
      AND substring(hora,1,2)::int*60+substring(hora,4,2)::int+(custom_data->>'duracao_slot_minutos')::int<=1440
    ELSE false END
);

ALTER TABLE public.agendamentos ADD CONSTRAINT ag_diagnostic_no_overlap EXCLUDE USING gist (
  unidade_id extensions.gist_text_ops WITH =, sala_id extensions.gist_text_ops WITH =,
  data extensions.gist_date_ops WITH =,
  (int4range(substring(hora,1,2)::int*60+substring(hora,4,2)::int,
    substring(hora,1,2)::int*60+substring(hora,4,2)::int+(custom_data->>'duracao_slot_minutos')::int,'[)')) WITH &&
) WHERE (lower(tipo)='exame' AND custom_data->>'sala_tipo'='aparelho_diagnostico'
  AND status NOT IN ('cancelado','falta','paciente_faltou','remarcado')
  AND coalesce(custom_data->>'status_exame','') <> 'cancelado');

CREATE OR REPLACE FUNCTION public.guard_diagnostic_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_st text; new_st text;
BEGIN
  IF NOT (lower(coalesce(OLD.tipo,''))='exame' AND OLD.custom_data->>'sala_tipo'='aparelho_diagnostico') THEN
    RETURN NEW;
  END IF;
  old_st := coalesce(OLD.custom_data->>'status_exame','agendado');
  new_st := coalesce(NEW.custom_data->>'status_exame','agendado');
  IF old_st = 'laudo_liberado' THEN
    IF new_st <> 'laudo_liberado' OR (NEW.custom_data->'laudo') IS DISTINCT FROM (OLD.custom_data->'laudo') THEN
      RAISE EXCEPTION 'Laudo já liberado não pode ser alterado.' USING ERRCODE = 'P0001';
    END IF;
  ELSIF new_st = 'laudo_liberado' THEN
    IF old_st <> 'exame_realizado_em_laudo' THEN
      RAISE EXCEPTION 'Laudo só pode ser liberado após o exame realizado.' USING ERRCODE = 'P0001';
    END IF;
    IF coalesce(trim(NEW.custom_data->'laudo'->>'conclusao'),'') = '' THEN
      RAISE EXCEPTION 'Conclusão do laudo é obrigatória.' USING ERRCODE = 'P0001';
    END IF;
    IF auth.uid() IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.funcionarios f
      WHERE f.auth_user_id = auth.uid() AND f.ativo AND f.role = 'profissional'
        AND upper(coalesce(f.tipo_conselho,'')) LIKE '%CRM%'
        AND coalesce(trim(f.numero_conselho),'') <> ''
        AND (f.unidade_id = NEW.unidade_id OR f.usuario = 'admin.sms')
    ) THEN
      RAISE EXCEPTION 'Somente profissional ativo com CRM da unidade pode liberar laudo.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_diagnostic_report ON public.agendamentos;
CREATE TRIGGER trg_guard_diagnostic_report BEFORE UPDATE ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.guard_diagnostic_report();