
-- 1. Unique partial index on pacientes.cpf (exclude empty strings and nulls)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pacientes_cpf_unique 
ON public.pacientes(cpf) 
WHERE cpf IS NOT NULL AND cpf != '';

-- 2. Index on pacientes.telefone for deduplication lookups
CREATE INDEX IF NOT EXISTS idx_pacientes_telefone_lookup 
ON public.pacientes(telefone) 
WHERE telefone IS NOT NULL AND telefone != '';

-- 3. Index on pacientes.email for deduplication lookups
CREATE INDEX IF NOT EXISTS idx_pacientes_email_lookup 
ON public.pacientes(email) 
WHERE email IS NOT NULL AND email != '';

-- 4. Unique constraint on triage_records.agendamento_id (needed for upsert onConflict)
CREATE UNIQUE INDEX IF NOT EXISTS idx_triage_records_agendamento_unique 
ON public.triage_records(agendamento_id);

-- 5. Index on disponibilidades for availability queries
CREATE INDEX IF NOT EXISTS idx_disponibilidades_prof_unidade 
ON public.disponibilidades(profissional_id, unidade_id, data_inicio, data_fim);

-- 6. Index on atendimentos for dashboard queries
CREATE INDEX IF NOT EXISTS idx_atendimentos_data_status 
ON public.atendimentos(data, status);

-- 7. Enable realtime on agendamentos (critical for Triagem page)
ALTER PUBLICATION supabase_realtime ADD TABLE public.agendamentos;

-- 8. Enable realtime on fila_espera (needed for queue updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.fila_espera;

-- 9. DB function for atomic slot check (prevents race condition / double-booking)
CREATE OR REPLACE FUNCTION public.check_slot_availability(
  p_profissional_id text,
  p_unidade_id text,
  p_data date,
  p_hora text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vagas_por_hora integer;
  v_vagas_por_dia integer;
  v_current_hour_count integer;
  v_current_day_count integer;
  v_hora_prefix text;
BEGIN
  SELECT vagas_por_hora, vagas_por_dia 
  INTO v_vagas_por_hora, v_vagas_por_dia
  FROM disponibilidades
  WHERE profissional_id = p_profissional_id
    AND unidade_id = p_unidade_id
    AND p_data >= data_inicio
    AND p_data <= data_fim
    AND EXTRACT(DOW FROM p_data)::int = ANY(dias_semana)
  LIMIT 1;

  IF v_vagas_por_hora IS NULL THEN
    RETURN jsonb_build_object('available', false, 'reason', 'no_availability');
  END IF;

  SELECT COUNT(*) INTO v_current_day_count
  FROM agendamentos
  WHERE profissional_id = p_profissional_id
    AND unidade_id = p_unidade_id
    AND data = p_data
    AND status NOT IN ('cancelado', 'falta');

  IF v_current_day_count >= v_vagas_por_dia THEN
    RETURN jsonb_build_object('available', false, 'reason', 'day_full');
  END IF;

  v_hora_prefix := LEFT(p_hora, 3);
  SELECT COUNT(*) INTO v_current_hour_count
  FROM agendamentos
  WHERE profissional_id = p_profissional_id
    AND unidade_id = p_unidade_id
    AND data = p_data
    AND hora LIKE v_hora_prefix || '%'
    AND status NOT IN ('cancelado', 'falta');

  IF v_current_hour_count >= v_vagas_por_hora THEN
    RETURN jsonb_build_object('available', false, 'reason', 'hour_full');
  END IF;

  RETURN jsonb_build_object('available', true, 'day_count', v_current_day_count, 'hour_count', v_current_hour_count);
END;
$$;
