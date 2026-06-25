CREATE INDEX IF NOT EXISTS idx_pacientes_unidade_criado_desc
  ON public.pacientes (unidade_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_prontuarios_unidade_data_desc
  ON public.prontuarios (unidade_id, data_atendimento DESC, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_agendamentos_unidade_data_desc
  ON public.agendamentos (unidade_id, data DESC);

CREATE INDEX IF NOT EXISTS idx_agendamentos_unidade_paciente
  ON public.agendamentos (unidade_id, paciente_id);

CREATE INDEX IF NOT EXISTS idx_fila_espera_unidade_criado_ativos
  ON public.fila_espera (unidade_id, criado_em ASC)
  WHERE status NOT IN ('atendido','cancelado','removido');

CREATE INDEX IF NOT EXISTS idx_triage_records_criado_desc
  ON public.triage_records (criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_treatment_sessions_created_desc
  ON public.treatment_sessions (created_at DESC);
