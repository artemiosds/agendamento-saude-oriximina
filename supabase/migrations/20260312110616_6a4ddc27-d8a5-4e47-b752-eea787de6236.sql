
-- 1. Create is_date_blocked function using existing bloqueios table
CREATE OR REPLACE FUNCTION public.is_date_blocked(
  p_date date,
  p_profissional_id text,
  p_unidade_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM bloqueios
    WHERE p_date >= data_inicio
      AND p_date <= data_fim
      AND (
        -- Global: no unit and no professional specified
        (unidade_id IS NULL OR unidade_id = '') AND (profissional_id IS NULL OR profissional_id = '')
        -- Unit-level: matches unit, no professional
        OR ((unidade_id = p_unidade_id) AND (profissional_id IS NULL OR profissional_id = ''))
        -- Professional-level: matches professional
        OR (profissional_id = p_profissional_id)
      )
      AND (
        dia_inteiro = true
        OR (hora_inicio IS NULL OR hora_inicio = '')
      )
  );
END;
$$;

-- 2. Update check_slot_availability to also check blocked dates
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
  -- Check if date is blocked
  IF is_date_blocked(p_data, p_profissional_id, p_unidade_id) THEN
    RETURN jsonb_build_object('available', false, 'reason', 'date_blocked');
  END IF;

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

-- 3. Allow anon users to read bloqueios (needed for online scheduling)
-- Policy already exists: "Anon read bloqueios" - no action needed

-- 4. Add index for date range lookups on bloqueios
CREATE INDEX IF NOT EXISTS idx_bloqueios_dates ON public.bloqueios(data_inicio, data_fim);
CREATE INDEX IF NOT EXISTS idx_bloqueios_profissional ON public.bloqueios(profissional_id, data_inicio, data_fim) WHERE profissional_id IS NOT NULL AND profissional_id != '';
