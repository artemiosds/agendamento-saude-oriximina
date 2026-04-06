
CREATE INDEX IF NOT EXISTS idx_pacientes_nome ON public.pacientes USING btree (nome);
CREATE INDEX IF NOT EXISTS idx_pacientes_cpf ON public.pacientes USING btree (cpf);
CREATE INDEX IF NOT EXISTS idx_pacientes_telefone ON public.pacientes USING btree (telefone);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON public.agendamentos USING btree (data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_profissional_id ON public.agendamentos USING btree (profissional_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON public.agendamentos USING btree (status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_profissional_data ON public.agendamentos USING btree (profissional_id, data);
CREATE INDEX IF NOT EXISTS idx_fila_espera_status ON public.fila_espera USING btree (status);
CREATE INDEX IF NOT EXISTS idx_fila_espera_paciente_id ON public.fila_espera USING btree (paciente_id);
CREATE INDEX IF NOT EXISTS idx_atendimentos_data ON public.atendimentos USING btree (data);
CREATE INDEX IF NOT EXISTS idx_atendimentos_profissional_id ON public.atendimentos USING btree (profissional_id);
CREATE INDEX IF NOT EXISTS idx_prontuarios_paciente_id ON public.prontuarios USING btree (paciente_id);
CREATE INDEX IF NOT EXISTS idx_prontuarios_data_atendimento ON public.prontuarios USING btree (data_atendimento);
CREATE INDEX IF NOT EXISTS idx_disponibilidades_profissional_id ON public.disponibilidades USING btree (profissional_id);
