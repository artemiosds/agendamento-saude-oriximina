CREATE INDEX IF NOT EXISTS idx_fila_unidade_status_criado
  ON public.fila_espera(unidade_id, status, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_agendamentos_unidade_data
  ON public.agendamentos(unidade_id, data DESC);

CREATE INDEX IF NOT EXISTS idx_pacientes_unidade_criado
  ON public.pacientes(unidade_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_prontuarios_unidade
  ON public.prontuarios(unidade_id);