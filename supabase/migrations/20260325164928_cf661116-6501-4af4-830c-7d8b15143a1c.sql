
-- Performance indexes (these use IF NOT EXISTS so safe to re-run)
CREATE INDEX IF NOT EXISTS idx_agendamentos_profissional_data ON agendamentos (profissional_id, data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_paciente_data ON agendamentos (paciente_id, data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_unidade_data ON agendamentos (unidade_id, data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agendamentos_unique_slot ON agendamentos (paciente_id, profissional_id, data, hora) WHERE status NOT IN ('cancelado', 'falta');
CREATE INDEX IF NOT EXISTS idx_fila_espera_status ON fila_espera (status);
CREATE INDEX IF NOT EXISTS idx_fila_espera_paciente ON fila_espera (paciente_id);
CREATE INDEX IF NOT EXISTS idx_fila_espera_unidade_status ON fila_espera (unidade_id, status);
CREATE INDEX IF NOT EXISTS idx_prontuarios_paciente ON prontuarios (paciente_id);
CREATE INDEX IF NOT EXISTS idx_prontuarios_profissional ON prontuarios (profissional_id);
CREATE INDEX IF NOT EXISTS idx_prontuarios_agendamento ON prontuarios (agendamento_id);
CREATE INDEX IF NOT EXISTS idx_atendimentos_profissional ON atendimentos (profissional_id);
CREATE INDEX IF NOT EXISTS idx_atendimentos_paciente ON atendimentos (paciente_id);
CREATE INDEX IF NOT EXISTS idx_treatment_sessions_cycle ON treatment_sessions (cycle_id);
CREATE INDEX IF NOT EXISTS idx_treatment_sessions_patient ON treatment_sessions (patient_id);
CREATE INDEX IF NOT EXISTS idx_treatment_sessions_date ON treatment_sessions (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_disponibilidades_profissional ON disponibilidades (profissional_id, unidade_id);
CREATE INDEX IF NOT EXISTS idx_bloqueios_datas ON bloqueios (data_inicio, data_fim);

-- Enable realtime (only tables not already added)
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.atendimentos; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.prontuarios; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.treatment_cycles; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.treatment_sessions; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
