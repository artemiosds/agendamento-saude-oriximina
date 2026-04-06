
-- Indexes for prontuarios (search by patient, date)
CREATE INDEX IF NOT EXISTS idx_prontuarios_paciente_id ON public.prontuarios USING btree (paciente_id);
CREATE INDEX IF NOT EXISTS idx_prontuarios_profissional_id ON public.prontuarios USING btree (profissional_id);
CREATE INDEX IF NOT EXISTS idx_prontuarios_data_atendimento ON public.prontuarios USING btree (data_atendimento DESC);
CREATE INDEX IF NOT EXISTS idx_prontuarios_unidade_id ON public.prontuarios USING btree (unidade_id);

-- Indexes for fila_espera (queue lookups)
CREATE INDEX IF NOT EXISTS idx_fila_espera_unidade_status ON public.fila_espera USING btree (unidade_id, status);
CREATE INDEX IF NOT EXISTS idx_fila_espera_paciente_id ON public.fila_espera USING btree (paciente_id);

-- Indexes for treatment_sessions
CREATE INDEX IF NOT EXISTS idx_treatment_sessions_cycle_id ON public.treatment_sessions USING btree (cycle_id);
CREATE INDEX IF NOT EXISTS idx_treatment_sessions_patient_id ON public.treatment_sessions USING btree (patient_id);
CREATE INDEX IF NOT EXISTS idx_treatment_sessions_scheduled_date ON public.treatment_sessions USING btree (scheduled_date);

-- Indexes for treatment_cycles
CREATE INDEX IF NOT EXISTS idx_treatment_cycles_patient_id ON public.treatment_cycles USING btree (patient_id);
CREATE INDEX IF NOT EXISTS idx_treatment_cycles_professional_id ON public.treatment_cycles USING btree (professional_id);

-- Indexes for nursing_evaluations
CREATE INDEX IF NOT EXISTS idx_nursing_evaluations_patient_id ON public.nursing_evaluations USING btree (patient_id);

-- Indexes for multiprofessional_evaluations
CREATE INDEX IF NOT EXISTS idx_multi_evaluations_patient_id ON public.multiprofessional_evaluations USING btree (patient_id);

-- Index for prontuario_procedimentos
CREATE INDEX IF NOT EXISTS idx_prontuario_procs_prontuario_id ON public.prontuario_procedimentos USING btree (prontuario_id);

-- Index for patient_regulation
CREATE INDEX IF NOT EXISTS idx_patient_regulation_patient_id ON public.patient_regulation USING btree (patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_regulation_status ON public.patient_regulation USING btree (status);

-- Index for patient_evaluations
CREATE INDEX IF NOT EXISTS idx_patient_evaluations_patient_id ON public.patient_evaluations USING btree (patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_evaluations_regulation_id ON public.patient_evaluations USING btree (regulation_id);
