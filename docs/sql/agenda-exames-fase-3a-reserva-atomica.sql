-- Fase 3A: integridade de intervalos entre agendamentos diagnósticos.
-- Aplicação manual autorizada no Lovable Cloud; não é uma migration automática.
-- Não altera dados existentes, funções, triggers ou políticas.
BEGIN;
SET LOCAL lock_timeout = '1500ms';
SET LOCAL statement_timeout = '20s';
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
COMMIT;
-- Reversão: em transação e com lock_timeout curto, remover SOMENTE as duas restrições
-- ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS ag_diagnostic_no_overlap, DROP CONSTRAINT IF EXISTS ag_diagnostic_slot_valid;
-- Não remover btree_gist automaticamente: outros recursos podem passar a utilizá-lo.
-- Escopo: conflitos entre registros explicitamente diagnósticos; não impede sobreposição
-- com registros comuns, não valida vínculo da sala, nem protege a autorização dos laudos.
