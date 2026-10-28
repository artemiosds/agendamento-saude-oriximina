-- Preserve the deferred integrity check. For a legacy cycle, an append is valid
-- only when every old session is byte-for-byte unchanged and all new rows pass
-- the normal identity/date/link/number guards. No historical row is repaired.
CREATE OR REPLACE FUNCTION public.capture_treatment_plan_baseline()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE contexts jsonb; baseline jsonb; ids jsonb; fingerprint text; n integer;
BEGIN
  IF NEW.total_sessions IS NOT DISTINCT FROM OLD.total_sessions THEN RETURN NEW; END IF;
  contexts := coalesce(nullif(current_setting('app.treatment_plan_baselines', true), ''), '{}')::jsonb;
  -- The first state in this transaction is authoritative, including repeated extensions.
  IF contexts ? OLD.id::text THEN RETURN NEW; END IF;
  SELECT count(*), coalesce(jsonb_agg(s.id ORDER BY s.id), '[]'::jsonb),
    md5(coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id), '[]'::jsonb)::text)
    INTO n, ids, fingerprint FROM public.treatment_sessions s WHERE s.cycle_id = OLD.id;
  baseline := jsonb_build_object('total', OLD.total_sessions, 'count', n, 'ids', ids,
    'fingerprint', fingerprint, 'legacy', cardinality(public.treatment_cycle_integrity_issues(OLD.id)) > 0);
  PERFORM set_config('app.treatment_plan_baselines', (contexts || jsonb_build_object(OLD.id::text, baseline))::text, true);
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trg_capture_treatment_plan_baseline
BEFORE UPDATE OF total_sessions ON public.treatment_cycles
FOR EACH ROW EXECUTE FUNCTION public.capture_treatment_plan_baseline();

CREATE OR REPLACE FUNCTION public.guard_treatment_plan_count()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE c public.treatment_cycles%ROWTYPE; baseline jsonb; old_ids uuid[];
 old_fingerprint text; added integer; old_total integer; final_count integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.total_sessions IS NOT DISTINCT FROM OLD.total_sessions THEN RETURN NEW; END IF;
  END IF;
  SELECT * INTO c FROM public.treatment_cycles WHERE id = NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  baseline := (coalesce(nullif(current_setting('app.treatment_plan_baselines', true), ''), '{}')::jsonb)->NEW.id::text;
  IF TG_OP = 'UPDATE' AND coalesce((baseline->>'legacy')::boolean, false)
      AND c.total_sessions > (baseline->>'total')::integer THEN
    old_total := (baseline->>'total')::integer;
    SELECT coalesce(array_agg(value::uuid), ARRAY[]::uuid[]) INTO old_ids
      FROM jsonb_array_elements_text(baseline->'ids');
    SELECT md5(coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id), '[]'::jsonb)::text)
      INTO old_fingerprint FROM public.treatment_sessions s WHERE s.cycle_id = c.id AND s.id = ANY(old_ids);
    IF old_fingerprint IS DISTINCT FROM baseline->>'fingerprint' THEN
      RAISE EXCEPTION 'A extensão não pode alterar ou excluir sessões anteriores. Recarregue o ciclo.' USING ERRCODE = '23514';
    END IF;
    SELECT count(*) INTO final_count FROM public.treatment_sessions WHERE cycle_id = c.id;
    added := final_count - (baseline->>'count')::integer;
    IF added <> c.total_sessions - old_total OR added < 1 THEN
      RAISE EXCEPTION 'Quantidade incompleta no acréscimo: nenhuma sessão foi gravada.' USING ERRCODE = '23514';
    END IF;
    -- Check only the appended rows against the final state, even if constraints
    -- were deferred or a second operation occurred in this transaction.
    IF EXISTS (
      SELECT 1 FROM public.treatment_sessions s LEFT JOIN public.agendamentos a ON a.id = s.appointment_id
      WHERE s.cycle_id = c.id AND NOT (s.id = ANY(old_ids)) AND (
        s.patient_id IS DISTINCT FROM c.patient_id OR s.professional_id IS DISTINCT FROM c.professional_id
        OR nullif(c.unit_id, '') IS NULL OR s.session_number <= old_total OR s.session_number > c.total_sessions
        OR (s.scheduled_date IS NULL AND (s.status <> 'pendente_agendamento' OR s.appointment_id IS NOT NULL))
        OR EXISTS (SELECT 1 FROM public.treatment_sessions other WHERE other.cycle_id=c.id AND other.id<>s.id AND other.session_number=s.session_number)
        OR (s.status NOT IN ('cancelada','remarcada') AND EXISTS (SELECT 1 FROM public.treatment_sessions other WHERE other.cycle_id=c.id AND other.id<>s.id AND other.scheduled_date=s.scheduled_date AND other.status NOT IN ('cancelada','remarcada')))
        OR (s.appointment_id IS NOT NULL AND (a.id IS NULL OR a.paciente_id IS DISTINCT FROM c.patient_id
          OR a.profissional_id IS DISTINCT FROM c.professional_id OR a.unidade_id IS DISTINCT FROM c.unit_id OR a.data IS DISTINCT FROM s.scheduled_date
          OR EXISTS (SELECT 1 FROM public.treatment_sessions other WHERE other.id<>s.id AND other.appointment_id=s.appointment_id)))
      )
    ) THEN
      RAISE EXCEPTION 'Nova sessão inválida: confira paciente, profissional, unidade, data e numeração.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  -- New and previously consistent plans retain the complete validation.
  PERFORM public.assert_treatment_cycle_integrity(c.id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_treatment_plan_baseline() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.capture_treatment_plan_baseline() TO authenticated;
