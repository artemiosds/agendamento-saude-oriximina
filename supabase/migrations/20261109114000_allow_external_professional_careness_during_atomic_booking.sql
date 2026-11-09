BEGIN;

-- Restore the authorized external-booking path without granting external users
-- general access to patient discharge/careness information.
--
-- create_external_appointment() sets app.external_booking_rpc='create' only
-- after validating the authenticated external professional, the selected
-- quota, its internal professional, unit, period, and remaining capacity.
-- The trigger invokes this function in that same transaction.
--
-- The additional database checks below bind that transaction marker to the
-- authenticated active external account and an active, non-exhausted quota
-- for the exact professional and unit being checked. The carearness calculation
-- and returned JSON remain unchanged.
CREATE OR REPLACE FUNCTION public.check_patient_profession_careness(
  p_patient_id text,
  p_professional_id text,
  p_unit_id text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_key text;
  v_name text;
  v_until date;
  v_scope text;
  v_external_booking_authorized boolean := false;
BEGIN
  -- Staff and service-role callers retain their existing authorization.
  -- An external professional is accepted only while the trusted atomic
  -- create_external_appointment() transaction is executing its INSERT.
  IF coalesce(auth.role(), '') <> 'service_role'
     AND NOT public.is_staff_member() THEN

    IF auth.uid() IS NOT NULL
       AND current_setting('app.external_booking_rpc', true) = 'create' THEN
      SELECT EXISTS (
        SELECT 1
          FROM public.profissionais_externos e
          JOIN public.quotas_externas q
            ON q.profissional_externo_id = e.id
         WHERE e.auth_user_id = auth.uid()
           AND e.ativo IS TRUE
           AND q.ativo IS TRUE
           AND q.profissional_interno_id::text = p_professional_id
           AND q.unidade_id = coalesce(p_unit_id, '')
           AND coalesce(q.vagas_usadas, 0) < coalesce(q.vagas_total, 0)
           AND coalesce(q.vagas_total, 0) > 0
      )
      INTO v_external_booking_authorized;
    END IF;

    IF NOT v_external_booking_authorized THEN
      RAISE EXCEPTION 'Acesso não autorizado à verificação de carência'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Original carência mapping and calculation logic is intentionally preserved.
  IF NOT public.profession_careness_mapping_is_current() THEN
    RETURN jsonb_build_object('blocked', false, 'reason', 'mapping_confirmation_required');
  END IF;

  SELECT public.normalize_profession(coalesce(f.profissao, ''))
    INTO v_key
    FROM public.funcionarios f
   WHERE f.id::text = p_professional_id
     AND f.ativo IS TRUE;

  IF v_key IS NULL THEN
    RETURN jsonb_build_object('blocked', false);
  END IF;

  SELECT c.profession_name, c.release_date, c.scope
    INTO v_name, v_until, v_scope
    FROM public.patient_profession_careness c
    JOIN public.profession_careness_rules r
      ON r.profession_key = c.profession_key
     AND r.enabled IS TRUE
   WHERE c.patient_id = p_patient_id
     AND c.profession_key = v_key
     AND c.released_at IS NULL
     AND c.annulled_at IS NULL
     AND c.release_date > current_date
     AND (c.scope = 'global' OR c.source_unit_id = coalesce(p_unit_id, ''))
   ORDER BY c.release_date DESC
   LIMIT 1;

  IF v_until IS NULL THEN
    RETURN jsonb_build_object('blocked', false);
  END IF;

  RETURN jsonb_build_object(
    'blocked', true,
    'profession', v_name,
    'release_date', v_until,
    'scope', v_scope,
    'message', format(
      'Paciente em carência para %s até %s.',
      v_name,
      to_char(v_until, 'DD/MM/YYYY')
    )
  );
END;
$function$;

-- Keep the function callable by the same roles as before; its internal
-- authorization still denies direct external lookups outside the trusted RPC.
REVOKE ALL ON FUNCTION public.check_patient_profession_careness(text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_patient_profession_careness(text, text, text)
  TO authenticated, service_role;

COMMIT;
