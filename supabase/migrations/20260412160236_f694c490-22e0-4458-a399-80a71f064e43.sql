
-- Add turno column to agendamentos table
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS turno text DEFAULT '';

-- Update check_slot_availability to support turno mode (vagasPorHora=0)
CREATE OR REPLACE FUNCTION public.check_slot_availability(p_profissional_id text, p_unidade_id text, p_data date, p_hora text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vagas_por_hora integer;
  v_vagas_por_dia integer;
  v_current_hour_count integer;
  v_current_day_count integer;
  v_hora_prefix text;
  v_turno_total integer;
  v_turno_count integer;
  v_turno_start text;
  v_turno_end text;
BEGIN
  -- Check if date is blocked
  IF is_date_blocked(p_data, p_profissional_id, p_unidade_id) THEN
    RETURN jsonb_build_object('available', false, 'reason', 'date_blocked');
  END IF;

  -- First check for turno-mode records (vagas_por_hora = 0)
  SELECT hora_inicio, hora_fim, vagas_por_dia
  INTO v_turno_start, v_turno_end, v_turno_total
  FROM disponibilidades
  WHERE profissional_id = p_profissional_id
    AND unidade_id = p_unidade_id
    AND p_data >= data_inicio
    AND p_data <= data_fim
    AND EXTRACT(DOW FROM p_data)::int = ANY(dias_semana)
    AND vagas_por_hora = 0
    AND p_hora >= hora_inicio
    AND p_hora < hora_fim
  LIMIT 1;

  IF v_turno_total IS NOT NULL THEN
    -- Turno mode: count appointments in this turno range
    SELECT COUNT(*) INTO v_turno_count
    FROM agendamentos
    WHERE profissional_id = p_profissional_id
      AND unidade_id = p_unidade_id
      AND data = p_data
      AND hora >= v_turno_start
      AND hora < v_turno_end
      AND status NOT IN ('cancelado', 'falta');

    IF v_turno_count >= v_turno_total THEN
      RETURN jsonb_build_object('available', false, 'reason', 'turno_full',
        'turno_start', v_turno_start, 'turno_end', v_turno_end,
        'turno_count', v_turno_count, 'turno_total', v_turno_total);
    END IF;

    RETURN jsonb_build_object('available', true, 'mode', 'turno',
      'turno_count', v_turno_count, 'turno_total', v_turno_total);
  END IF;

  -- Standard per-hour mode
  SELECT vagas_por_hora, vagas_por_dia 
  INTO v_vagas_por_hora, v_vagas_por_dia
  FROM disponibilidades
  WHERE profissional_id = p_profissional_id
    AND unidade_id = p_unidade_id
    AND p_data >= data_inicio
    AND p_data <= data_fim
    AND EXTRACT(DOW FROM p_data)::int = ANY(dias_semana)
    AND vagas_por_hora > 0
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
$function$;
