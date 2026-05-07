-- Índices para Agendamentos
CREATE INDEX IF NOT EXISTS idx_agendamentos_data_unidade ON public.agendamentos (data, unidade_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data_profissional ON public.agendamentos (data, profissional_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data_status_unidade ON public.agendamentos (data, status, unidade_id);

-- Índices para Pacientes
CREATE INDEX IF NOT EXISTS idx_pacientes_criado_em ON public.pacientes (criado_em);
CREATE INDEX IF NOT EXISTS idx_pacientes_unidade_id ON public.pacientes (unidade_id);

-- Índices para Prontuários
CREATE INDEX IF NOT EXISTS idx_prontuarios_criado_em ON public.prontuarios (criado_em);
CREATE INDEX IF NOT EXISTS idx_prontuarios_data_atendimento ON public.prontuarios (data_atendimento);
CREATE INDEX IF NOT EXISTS idx_prontuarios_unidade_data ON public.prontuarios (unidade_id, data_atendimento);
CREATE INDEX IF NOT EXISTS idx_prontuarios_profissional_data ON public.prontuarios (profissional_id, data_atendimento);

-- Índices para Fila de Espera
CREATE INDEX IF NOT EXISTS idx_fila_espera_criado_em ON public.fila_espera (criado_em);

-- Índices para Procedimentos (tabela prontuario_procedimentos)
CREATE INDEX IF NOT EXISTS idx_prontuario_procedimentos_criado_em ON public.prontuario_procedimentos (criado_em);
