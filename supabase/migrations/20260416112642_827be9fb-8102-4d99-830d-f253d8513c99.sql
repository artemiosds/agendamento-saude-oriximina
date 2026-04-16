
-- Backfill pacientes.unidade_id from treatment_cycles where patient has cycles
UPDATE public.pacientes p
SET unidade_id = tc.unit_id
FROM (
  SELECT DISTINCT ON (patient_id) patient_id, unit_id
  FROM public.treatment_cycles
  WHERE unit_id IS NOT NULL AND unit_id != ''
  ORDER BY patient_id, created_at DESC
) tc
WHERE p.id = tc.patient_id
  AND (p.unidade_id IS NULL OR p.unidade_id = '');

-- Backfill pacientes.unidade_id from agendamentos where patient has appointments
UPDATE public.pacientes p
SET unidade_id = ag.unidade_id
FROM (
  SELECT DISTINCT ON (paciente_id) paciente_id, unidade_id
  FROM public.agendamentos
  WHERE unidade_id IS NOT NULL AND unidade_id != ''
  ORDER BY paciente_id, criado_em DESC
) ag
WHERE p.id = ag.paciente_id
  AND (p.unidade_id IS NULL OR p.unidade_id = '');
