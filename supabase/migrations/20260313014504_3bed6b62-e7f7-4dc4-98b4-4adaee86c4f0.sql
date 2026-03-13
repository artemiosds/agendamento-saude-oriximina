
-- Performance indexes for agendamentos (most queried table)
CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON public.agendamentos (data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_profissional_data ON public.agendamentos (profissional_id, data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_profissional_unidade_data ON public.agendamentos (profissional_id, unidade_id, data, status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_paciente ON public.agendamentos (paciente_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON public.agendamentos (status);

-- Performance indexes for fila_espera
CREATE INDEX IF NOT EXISTS idx_fila_espera_status ON public.fila_espera (status);
CREATE INDEX IF NOT EXISTS idx_fila_espera_unidade ON public.fila_espera (unidade_id);
CREATE INDEX IF NOT EXISTS idx_fila_espera_paciente ON public.fila_espera (paciente_id);

-- Performance indexes for pacientes
CREATE INDEX IF NOT EXISTS idx_pacientes_cpf ON public.pacientes (cpf);
CREATE INDEX IF NOT EXISTS idx_pacientes_nome ON public.pacientes (nome);
CREATE INDEX IF NOT EXISTS idx_pacientes_auth_user ON public.pacientes (auth_user_id);

-- Performance indexes for disponibilidades
CREATE INDEX IF NOT EXISTS idx_disponibilidades_prof_unidade ON public.disponibilidades (profissional_id, unidade_id);

-- Performance indexes for bloqueios
CREATE INDEX IF NOT EXISTS idx_bloqueios_datas ON public.bloqueios (data_inicio, data_fim);

-- Performance indexes for prontuarios
CREATE INDEX IF NOT EXISTS idx_prontuarios_paciente ON public.prontuarios (paciente_id);
CREATE INDEX IF NOT EXISTS idx_prontuarios_profissional ON public.prontuarios (profissional_id);
CREATE INDEX IF NOT EXISTS idx_prontuarios_data ON public.prontuarios (data_atendimento);

-- Performance indexes for atendimentos
CREATE INDEX IF NOT EXISTS idx_atendimentos_data ON public.atendimentos (data);
CREATE INDEX IF NOT EXISTS idx_atendimentos_profissional ON public.atendimentos (profissional_id);

-- Performance indexes for action_logs
CREATE INDEX IF NOT EXISTS idx_action_logs_created ON public.action_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_logs_user ON public.action_logs (user_id);

-- Performance indexes for notification_logs
CREATE INDEX IF NOT EXISTS idx_notification_logs_created ON public.notification_logs (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_notification_logs_agendamento ON public.notification_logs (agendamento_id);

-- Performance indexes for funcionarios
CREATE INDEX IF NOT EXISTS idx_funcionarios_auth_user ON public.funcionarios (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_unidade ON public.funcionarios (unidade_id);
