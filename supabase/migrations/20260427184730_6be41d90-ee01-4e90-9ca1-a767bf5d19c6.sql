
WITH candidatos AS (
  SELECT id FROM public.pacientes WHERE COALESCE(unidade_id, '') = ''
),
resolvido AS (
  SELECT
    c.id,
    COALESCE(
      (SELECT a.unidade_id FROM public.agendamentos a
         WHERE a.paciente_id = c.id AND COALESCE(a.unidade_id,'') <> ''
         ORDER BY a.criado_em DESC NULLS LAST LIMIT 1),
      (SELECT pr.unidade_id FROM public.prontuarios pr
         WHERE pr.paciente_id = c.id AND COALESCE(pr.unidade_id,'') <> ''
         ORDER BY pr.criado_em DESC NULLS LAST LIMIT 1),
      (SELECT f.unidade_id FROM public.fila_espera f
         WHERE f.paciente_id = c.id AND COALESCE(f.unidade_id,'') <> ''
         ORDER BY f.criado_em DESC NULLS LAST LIMIT 1),
      (SELECT n.unit_id FROM public.nursing_evaluations n
         WHERE n.patient_id = c.id AND COALESCE(n.unit_id,'') <> ''
         ORDER BY n.created_at DESC NULLS LAST LIMIT 1),
      (SELECT t.unit_id FROM public.treatment_cycles t
         WHERE t.patient_id = c.id AND COALESCE(t.unit_id,'') <> ''
         ORDER BY t.created_at DESC NULLS LAST LIMIT 1)
    ) AS u
  FROM candidatos c
)
UPDATE public.pacientes p
SET unidade_id = r.u
FROM resolvido r
WHERE p.id = r.id
  AND COALESCE(r.u, '') <> ''
  AND COALESCE(p.unidade_id, '') = '';
