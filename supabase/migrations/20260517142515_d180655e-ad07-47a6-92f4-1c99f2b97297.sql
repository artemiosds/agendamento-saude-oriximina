CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_prontuarios_paciente_nome_trgm
  ON public.prontuarios USING GIN (paciente_nome gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_prontuarios_profissional_nome_trgm
  ON public.prontuarios USING GIN (profissional_nome gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_prontuarios_data_desc
  ON public.prontuarios (data_atendimento DESC);

CREATE INDEX IF NOT EXISTS idx_pacientes_nome_trgm
  ON public.pacientes USING GIN (nome gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_pacientes_cpf_trgm
  ON public.pacientes USING GIN (cpf gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_pacientes_cns_trgm
  ON public.pacientes USING GIN (cns gin_trgm_ops);