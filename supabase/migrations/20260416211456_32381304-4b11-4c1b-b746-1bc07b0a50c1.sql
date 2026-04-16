
-- Performance indexes for treatments page
CREATE INDEX IF NOT EXISTS idx_treatment_cycles_professional_id ON public.treatment_cycles(professional_id);
CREATE INDEX IF NOT EXISTS idx_treatment_cycles_unit_id ON public.treatment_cycles(unit_id);
CREATE INDEX IF NOT EXISTS idx_treatment_cycles_patient_id ON public.treatment_cycles(patient_id);
CREATE INDEX IF NOT EXISTS idx_treatment_cycles_status ON public.treatment_cycles(status);
CREATE INDEX IF NOT EXISTS idx_treatment_cycles_created_at_desc ON public.treatment_cycles(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_treatment_sessions_cycle_id ON public.treatment_sessions(cycle_id);
CREATE INDEX IF NOT EXISTS idx_treatment_sessions_patient_id ON public.treatment_sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_treatment_sessions_professional_id ON public.treatment_sessions(professional_id);
CREATE INDEX IF NOT EXISTS idx_treatment_sessions_status ON public.treatment_sessions(status);
CREATE INDEX IF NOT EXISTS idx_treatment_sessions_scheduled_date ON public.treatment_sessions(scheduled_date);

CREATE INDEX IF NOT EXISTS idx_treatment_extensions_cycle_id ON public.treatment_extensions(cycle_id);

CREATE INDEX IF NOT EXISTS idx_agendamentos_paciente_data ON public.agendamentos(paciente_id, data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_prof_data ON public.agendamentos(profissional_id, data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON public.agendamentos(status);

CREATE INDEX IF NOT EXISTS idx_pts_patient_id ON public.pts(patient_id);
CREATE INDEX IF NOT EXISTS idx_pts_unit_id ON public.pts(unit_id);
