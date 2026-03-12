
CREATE OR REPLACE FUNCTION public.iniciar_atendimento(
  p_agendamento_id text,
  p_profissional_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
  v_profissional_id text;
BEGIN
  SELECT status, profissional_id
  INTO v_status, v_profissional_id
  FROM agendamentos
  WHERE id = p_agendamento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment_not_found';
  END IF;

  IF v_profissional_id != p_profissional_id THEN
    RAISE EXCEPTION 'not_authorized'
      USING HINT = 'Profissional não autorizado para este agendamento';
  END IF;

  -- Allow starting from confirmado_chegada (no triage) or aguardando_atendimento (after triage)
  IF v_status NOT IN ('confirmado_chegada', 'aguardando_atendimento') THEN
    RAISE EXCEPTION 'arrival_not_confirmed'
      USING HINT = 'Chegada do paciente ainda não foi confirmada pela recepção';
  END IF;

  UPDATE agendamentos
  SET status = 'em_atendimento',
      atualizado_em = now()
  WHERE id = p_agendamento_id;
END;
$$;
