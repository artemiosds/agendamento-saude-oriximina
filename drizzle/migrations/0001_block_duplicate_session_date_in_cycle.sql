CREATE OR REPLACE FUNCTION public.guard_treatment_session_duplicate_date()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.scheduled_date IS NULL OR NEW.cycle_id IS NULL
     OR NEW.status IN ('cancelada','remarcada') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.scheduled_date IS NOT DISTINCT FROM OLD.scheduled_date THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.treatment_sessions s
    WHERE s.cycle_id = NEW.cycle_id
      AND s.scheduled_date = NEW.scheduled_date
      AND s.id <> NEW.id
      AND s.status NOT IN ('cancelada','remarcada')
  ) THEN
    RAISE EXCEPTION 'Já existe outra sessão deste ciclo na data %. Escolha uma data diferente.',
      to_char(NEW.scheduled_date::date, 'DD/MM/YYYY')
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_treatment_session_duplicate_date ON public.treatment_sessions;
CREATE TRIGGER trg_guard_treatment_session_duplicate_date
BEFORE INSERT OR UPDATE OF scheduled_date ON public.treatment_sessions
FOR EACH ROW EXECUTE FUNCTION public.guard_treatment_session_duplicate_date();