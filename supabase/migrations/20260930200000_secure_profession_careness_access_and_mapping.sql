BEGIN;

-- A changed employee profession catalog suspends enforcement until a Master
-- reviews and reconfirms the current De-Para signature.
CREATE OR REPLACE FUNCTION public.profession_careness_mapping_is_current()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.profession_careness_mapping_state s
     WHERE s.id IS TRUE
       AND s.confirmed_signature = md5(public.profession_careness_catalog()::text)
  )
$function$;
REVOKE ALL ON FUNCTION public.profession_careness_mapping_is_current() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_patient_profession_careness(
  p_patient_id text, p_professional_id text, p_unit_id text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_key text; v_name text; v_until date; v_scope text;
BEGIN
  -- This RPC is used by staff scheduling and the trusted public-scheduling
  -- Edge Function (service_role). Do not allow arbitrary authenticated clients
  -- to probe another patient's discharge information.
  IF coalesce(auth.role(), '') <> 'service_role' AND NOT public.is_staff_member() THEN
    RAISE EXCEPTION 'Acesso não autorizado à verificação de carência' USING ERRCODE = '42501';
  END IF;

  IF NOT public.profession_careness_mapping_is_current() THEN
    RETURN jsonb_build_object('blocked', false, 'reason', 'mapping_confirmation_required');
  END IF;

  SELECT public.normalize_profession(coalesce(f.profissao,'')) INTO v_key
    FROM public.funcionarios f WHERE f.id::text = p_professional_id AND f.ativo IS TRUE;
  IF v_key IS NULL THEN RETURN jsonb_build_object('blocked', false); END IF;
  SELECT c.profession_name, c.release_date, c.scope
    INTO v_name, v_until, v_scope
    FROM public.patient_profession_careness c
    JOIN public.profession_careness_rules r ON r.profession_key = c.profession_key AND r.enabled IS TRUE
   WHERE c.patient_id = p_patient_id AND c.profession_key = v_key
     AND c.released_at IS NULL AND c.annulled_at IS NULL AND c.release_date > current_date
     AND (c.scope = 'global' OR c.source_unit_id = coalesce(p_unit_id,''))
   ORDER BY c.release_date DESC LIMIT 1;
  IF v_until IS NULL THEN RETURN jsonb_build_object('blocked', false); END IF;
  RETURN jsonb_build_object('blocked', true, 'profession', v_name, 'release_date', v_until, 'scope', v_scope,
    'message', format('Paciente em carência para %s até %s.', v_name, to_char(v_until,'DD/MM/YYYY')));
END;
$function$;
REVOKE ALL ON FUNCTION public.check_patient_profession_careness(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_patient_profession_careness(text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_patient_profession_careness(p_patient_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF auth.uid() IS NULL OR (
       NOT public.is_staff_member()
       AND NOT EXISTS (
         SELECT 1 FROM public.pacientes p
          WHERE p.id = p_patient_id AND p.auth_user_id = auth.uid()
       )
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado aos dados de carência deste paciente' USING ERRCODE = '42501';
  END IF;

  IF NOT public.profession_careness_mapping_is_current() THEN RETURN '[]'::jsonb; END IF;

  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('profession',c.profession_name,'discharge_date',c.discharge_date,
      'release_date',c.release_date,'source_unit_id',c.source_unit_id,'scope',c.scope))
    FROM public.patient_profession_careness c
    JOIN public.profession_careness_rules r ON r.profession_key = c.profession_key AND r.enabled IS TRUE
    WHERE c.patient_id = p_patient_id AND c.released_at IS NULL AND c.annulled_at IS NULL AND c.release_date>current_date), '[]'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.list_patient_profession_careness(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_patient_profession_careness(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_active_profession_careness()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_staff public.funcionarios%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO v_staff FROM public.funcionarios f WHERE f.auth_user_id=auth.uid() AND f.ativo IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário ativo não encontrado' USING ERRCODE='42501'; END IF;
  v_role := lower(trim(v_staff.role));
  IF v_role NOT IN ('master','gestao','gestão','coordenador','coordenacao') THEN
    RAISE EXCEPTION 'Sem permissão para consultar este relatório' USING ERRCODE='42501';
  END IF;
  IF NOT public.profession_careness_mapping_is_current() THEN RETURN '[]'::jsonb; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('patient_id',c.patient_id,'patient_name',p.nome,
      'profession',c.profession_name,'discharge_date',c.discharge_date,'release_date',c.release_date,
      'source_unit_id',c.source_unit_id,'unit_name',u.nome,'scope',c.scope)
      ORDER BY c.release_date,c.profession_name,p.nome)
    FROM public.patient_profession_careness c
    JOIN public.profession_careness_rules r ON r.profession_key=c.profession_key AND r.enabled IS TRUE
    JOIN public.pacientes p ON p.id=c.patient_id
    LEFT JOIN public.unidades u ON u.id=c.source_unit_id
    WHERE c.released_at IS NULL AND c.annulled_at IS NULL AND c.release_date>current_date
      AND (v_role='master' OR v_staff.usuario='admin.sms' OR c.scope='global'
           OR c.source_unit_id=coalesce(v_staff.unidade_id,''))),'[]'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.list_active_profession_careness() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_active_profession_careness() TO authenticated;

COMMIT;
