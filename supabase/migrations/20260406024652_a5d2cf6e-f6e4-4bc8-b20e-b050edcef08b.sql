
-- Indexes for pacientes table (search performance)
CREATE INDEX IF NOT EXISTS idx_pacientes_nome_trgm ON public.pacientes USING btree (nome);
CREATE INDEX IF NOT EXISTS idx_pacientes_cpf ON public.pacientes USING btree (cpf);
CREATE INDEX IF NOT EXISTS idx_pacientes_cns ON public.pacientes USING btree (cns);
CREATE INDEX IF NOT EXISTS idx_pacientes_telefone ON public.pacientes USING btree (telefone);

-- Index for agendamentos date + status queries
CREATE INDEX IF NOT EXISTS idx_agendamentos_data_status ON public.agendamentos USING btree (data, status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_profissional_data ON public.agendamentos USING btree (profissional_id, data);

-- Index for fila_espera status queries
CREATE INDEX IF NOT EXISTS idx_fila_espera_status ON public.fila_espera USING btree (status);

-- Index for disponibilidades lookups
CREATE INDEX IF NOT EXISTS idx_disponibilidades_profissional_unidade ON public.disponibilidades USING btree (profissional_id, unidade_id);
