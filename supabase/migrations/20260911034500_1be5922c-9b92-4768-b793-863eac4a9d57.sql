CREATE OR REPLACE FUNCTION public.bpa_profissionais_com_atendimento(
  p_start date,
  p_end date,
  p_unidade_id text DEFAULT NULL
)
RETURNS TABLE(profissional_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT x.profissional_id FROM (
    SELECT pr.profissional_id
    FROM public.prontuarios pr
    WHERE pr.data_atendimento >= p_start
      AND pr.data_atendimento <= p_end
      AND pr.status = 'finalizado'
      AND pr.profissional_id IS NOT NULL
      AND (p_unidade_id IS NULL OR pr.unidade_id = p_unidade_id)

    UNION

    SELECT tr.tecnico_id AS profissional_id
    FROM public.triage_records tr
    LEFT JOIN public.agendamentos ag ON ag.id = tr.agendamento_id
    WHERE tr.criado_em >= p_start::timestamptz
      AND tr.criado_em < (p_end + 1)::timestamptz
      AND tr.tecnico_id IS NOT NULL
      AND (p_unidade_id IS NULL OR ag.unidade_id = p_unidade_id)

    UNION

    SELECT a.profissional_id
    FROM public.agendamentos a
    WHERE a.data >= p_start
      AND a.data <= p_end
      AND a.profissional_id IS NOT NULL
      AND a.status IN (
        'concluido','confirmado_chegada','aguardando_atendimento',
        'em_atendimento','falta','paciente_faltou'
      )
      AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
  ) x
  WHERE x.profissional_id IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.bpa_profissionais_com_atendimento(date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bpa_profissionais_com_atendimento(date, date, text) TO service_role;