BEGIN;

-- The previous candidate used a three-value enum. Replace it with the agreed
-- two-value schema while preserving any already-written non-conclusion rows.
DO $migration$
DECLARE
  v_labels text[];
BEGIN
  IF to_regtype('public.tipo_alta') IS NULL THEN
    CREATE TYPE public.tipo_alta AS ENUM ('conclusao', 'outro');
  ELSE
    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
      INTO v_labels
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public' AND t.typname = 'tipo_alta';
    IF v_labels IS DISTINCT FROM ARRAY['conclusao','outro']::text[] THEN
      EXECUTE 'DROP FUNCTION IF EXISTS public.register_treatment_discharge(uuid, public.tipo_alta, text, text)';
      CREATE TYPE public.tipo_alta_replacement AS ENUM ('conclusao', 'outro');
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='patient_discharges' AND column_name='tipo_alta') THEN
        ALTER TABLE public.patient_discharges ALTER COLUMN tipo_alta DROP DEFAULT;
        ALTER TABLE public.patient_discharges
          ALTER COLUMN tipo_alta TYPE public.tipo_alta_replacement
          USING CASE WHEN tipo_alta::text = 'conclusao'
            THEN 'conclusao'::public.tipo_alta_replacement
            ELSE 'outro'::public.tipo_alta_replacement END;
      END IF;
      DROP TYPE public.tipo_alta;
      ALTER TYPE public.tipo_alta_replacement RENAME TO tipo_alta;
    END IF;
  END IF;
END;
$migration$;

ALTER TABLE public.patient_discharges
  ADD COLUMN IF NOT EXISTS tipo_alta public.tipo_alta NOT NULL DEFAULT 'outro';
ALTER TABLE public.patient_discharges ALTER COLUMN tipo_alta SET DEFAULT 'outro';

CREATE OR REPLACE FUNCTION public.normalize_profession(p_value text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = ''
AS $function$
DECLARE v_value text;
BEGIN
  v_value := trim(regexp_replace(public.unaccent(lower(p_value)), '[^a-z0-9]+', ' ', 'g'));
  v_value := regexp_replace(v_value, '\s+', ' ', 'g');
  -- Normalize gender inflections only when they are recognized suffixes.
  v_value := regexp_replace(v_value, 'ologa$', 'ologo');
  v_value := regexp_replace(v_value, 'ica$', 'ico');
  v_value := regexp_replace(v_value, 'eira$', 'eiro');
  v_value := regexp_replace(v_value, 'ora$', 'or');
  v_value := CASE v_value
    WHEN 'fonoaudiologia' THEN 'fonoaudiologo'
    WHEN 'fisioterapia' THEN 'fisioterapeuta'
    WHEN 'nutricao' THEN 'nutricionista'
    WHEN 'medicina' THEN 'medico'
    WHEN 'psicologia' THEN 'psicologo'
    WHEN 'odontologia' THEN 'odontologo'
    WHEN 'assistencia social' THEN 'assistente social'
    ELSE v_value END;
  RETURN nullif(v_value, '');
END;
$function$;

CREATE TABLE IF NOT EXISTS public.profession_careness_rules (
  profession_key text PRIMARY KEY,
  profession_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  duration_value integer NOT NULL DEFAULT 30 CHECK (duration_value BETWEEN 1 AND 3650),
  duration_unit text NOT NULL DEFAULT 'days' CHECK (duration_unit IN ('days','months')),
  scope text NOT NULL DEFAULT 'global' CHECK (scope IN ('global','unit')),
  updated_by text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.profession_careness_mapping_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id IS TRUE),
  confirmed_signature text NOT NULL DEFAULT '',
  confirmed_at timestamptz,
  confirmed_by text NOT NULL DEFAULT ''
);
INSERT INTO public.profession_careness_mapping_state(id) VALUES(true) ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.patient_profession_careness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id text NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  profession_key text NOT NULL,
  profession_name text NOT NULL,
  discharge_id uuid REFERENCES public.patient_discharges(id) ON DELETE SET NULL,
  source_professional_id text NOT NULL DEFAULT '',
  source_unit_id text NOT NULL DEFAULT '',
  discharge_date date NOT NULL,
  release_date date NOT NULL,
  scope text NOT NULL CHECK (scope IN ('global','unit')),
  released_at timestamptz,
  release_reason text NOT NULL DEFAULT '',
  annulled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (discharge_id)
);
CREATE INDEX IF NOT EXISTS patient_profession_careness_lookup_idx
  ON public.patient_profession_careness(patient_id, profession_key, release_date)
  WHERE released_at IS NULL AND annulled_at IS NULL;

ALTER TABLE public.profession_careness_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_profession_careness ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Master manages profession carence rules" ON public.profession_careness_rules;
CREATE POLICY "Master manages profession carence rules"
  ON public.profession_careness_rules FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.auth_user_id = auth.uid() AND f.ativo IS TRUE AND lower(trim(f.role)) = 'master'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.auth_user_id = auth.uid() AND f.ativo IS TRUE AND lower(trim(f.role)) = 'master'));
DROP POLICY IF EXISTS "Master reads patient profession carence" ON public.patient_profession_careness;
CREATE POLICY "Master reads patient profession carence"
  ON public.patient_profession_careness FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.auth_user_id = auth.uid() AND f.ativo IS TRUE AND lower(trim(f.role)) = 'master'));
REVOKE ALL ON public.profession_careness_rules, public.profession_careness_mapping_state, public.patient_profession_careness FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profession_careness_rules TO authenticated;
GRANT SELECT ON public.patient_profession_careness TO authenticated;

CREATE OR REPLACE FUNCTION public.is_master_for_careness()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT EXISTS (SELECT 1 FROM public.funcionarios f
    WHERE f.auth_user_id = auth.uid() AND f.ativo IS TRUE AND lower(trim(f.role)) = 'master')
$function$;
REVOKE ALL ON FUNCTION public.is_master_for_careness() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.profession_careness_catalog()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'profession_key',x.profession_key,'suggested_name',x.suggested_name,
    'source_values',x.source_values,'professional_count',x.professional_count
  ) ORDER BY x.suggested_name),'[]'::jsonb)
  FROM (
    SELECT public.normalize_profession(f.profissao) AS profession_key,
      CASE public.normalize_profession(f.profissao)
        WHEN 'fonoaudiologo' THEN 'Fonoaudiólogo(a)'
        WHEN 'medico' THEN 'Médico(a)'
        WHEN 'odontologo' THEN 'Odontólogo(a)'
        WHEN 'psicologo' THEN 'Psicólogo(a)'
        WHEN 'assistente social' THEN 'Assistente Social'
        ELSE initcap(min(trim(f.profissao))) END AS suggested_name,
      array_agg(DISTINCT trim(f.profissao) ORDER BY trim(f.profissao)) AS source_values,
      count(*)::integer AS professional_count
    FROM public.funcionarios f
    WHERE nullif(trim(f.profissao),'') IS NOT NULL
      AND public.normalize_profession(f.profissao) IS NOT NULL
    GROUP BY public.normalize_profession(f.profissao)
  ) x
$function$;
REVOKE ALL ON FUNCTION public.profession_careness_catalog() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.confirm_profession_careness_mapping(p_signature text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_staff public.funcionarios%ROWTYPE; v_current text;
BEGIN
  SELECT * INTO v_staff FROM public.funcionarios f WHERE f.auth_user_id=auth.uid() AND f.ativo IS TRUE AND lower(trim(f.role))='master';
  IF NOT FOUND THEN RAISE EXCEPTION 'Somente Master pode confirmar o De-Para' USING ERRCODE='42501'; END IF;
  v_current := md5(public.profession_careness_catalog()::text);
  IF p_signature IS DISTINCT FROM v_current THEN RAISE EXCEPTION 'A lista de profissões mudou. Atualize e revise o De-Para novamente.'; END IF;
  UPDATE public.profession_careness_mapping_state SET confirmed_signature=v_current,confirmed_at=now(),confirmed_by=v_staff.id::text WHERE id IS TRUE;
  INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,detalhes)
  VALUES(v_staff.id::text,v_staff.nome,v_staff.role,coalesce(v_staff.unidade_id,''),'depara_profissoes_confirmado',
    'profession_careness_mapping','active',jsonb_build_object('signature',v_current,'professions',public.profession_careness_catalog()));
  RETURN jsonb_build_object('confirmed',true,'signature',v_current);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.confirm_profession_careness_mapping(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.careness_release_date(p_date date, p_value integer, p_unit text)
RETURNS date LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $function$
  SELECT CASE WHEN p_unit = 'months'
    THEN (p_date + make_interval(months => p_value))::date
    ELSE p_date + p_value END
$function$;

CREATE OR REPLACE FUNCTION public.apply_profession_careness_for_discharge(p_discharge_id uuid, p_force boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_discharge record;
  v_profession text;
  v_key text;
  v_name text;
  v_rule public.profession_careness_rules%ROWTYPE;
  v_release date;
BEGIN
  SELECT d.id, d.patient_id, d.cycle_id, d.professional_id, d.discharge_date, d.tipo_alta,
         c.professional_id AS cycle_professional_id, c.unit_id
    INTO v_discharge
    FROM public.patient_discharges d
    JOIN public.treatment_cycles c ON c.id = d.cycle_id
   WHERE d.id = p_discharge_id;
  IF NOT FOUND OR v_discharge.tipo_alta <> 'conclusao' THEN
    RETURN jsonb_build_object('created', false, 'reason', 'not_conclusion');
  END IF;

  SELECT f.profissao INTO v_profession FROM public.funcionarios f
   WHERE f.id::text = v_discharge.cycle_professional_id;
  v_key := public.normalize_profession(coalesce(v_profession, ''));
  IF v_key IS NULL THEN RETURN jsonb_build_object('created', false, 'reason', 'profession_missing'); END IF;

  SELECT r.* INTO v_rule FROM public.profession_careness_rules r
   WHERE r.profession_key = v_key AND (r.enabled OR p_force);
  IF NOT FOUND THEN RETURN jsonb_build_object('created', false, 'reason', 'rule_disabled'); END IF;

  IF EXISTS (
    SELECT 1 FROM public.treatment_cycles other_cycle
    JOIN public.funcionarios other_prof ON other_prof.id::text = other_cycle.professional_id
    WHERE other_cycle.patient_id = v_discharge.patient_id
      AND other_cycle.id <> v_discharge.cycle_id
      AND other_cycle.professional_id <> v_discharge.cycle_professional_id
      AND other_cycle.status IN ('em_andamento','ativo')
      AND public.normalize_profession(coalesce(other_prof.profissao,'')) = v_key
  ) THEN
    RETURN jsonb_build_object('created', false, 'reason', 'other_active_treatment');
  END IF;

  v_release := public.careness_release_date(v_discharge.discharge_date, v_rule.duration_value, v_rule.duration_unit);
  INSERT INTO public.patient_profession_careness (
    patient_id, profession_key, profession_name, discharge_id, source_professional_id,
    source_unit_id, discharge_date, release_date, scope
  ) VALUES (
    v_discharge.patient_id, v_key, v_rule.profession_name, p_discharge_id,
    v_discharge.cycle_professional_id, coalesce(v_discharge.unit_id,''),
    v_discharge.discharge_date, v_release, v_rule.scope
  ) ON CONFLICT (discharge_id) DO UPDATE SET
      profession_key=EXCLUDED.profession_key, profession_name=EXCLUDED.profession_name,
      source_professional_id=EXCLUDED.source_professional_id, source_unit_id=EXCLUDED.source_unit_id,
      discharge_date=EXCLUDED.discharge_date, release_date=EXCLUDED.release_date, scope=EXCLUDED.scope,
      released_at=NULL, release_reason=''
    WHERE p_force AND public.patient_profession_careness.released_at IS NOT NULL
      AND public.patient_profession_careness.release_reason='regra desativada';
  RETURN jsonb_build_object('created', EXISTS (SELECT 1 FROM public.patient_profession_careness pc
      WHERE pc.discharge_id=p_discharge_id AND pc.released_at IS NULL AND pc.annulled_at IS NULL),
    'profession', v_rule.profession_name, 'release_date', v_release, 'scope', v_rule.scope);
END;
$function$;
REVOKE ALL ON FUNCTION public.apply_profession_careness_for_discharge(uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_profession_careness_from_discharge()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.patient_profession_careness
       SET annulled_at = now(), release_reason = 'alta cancelada/ciclo removido'
     WHERE discharge_id = OLD.id AND annulled_at IS NULL;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND (
       NEW.tipo_alta IS DISTINCT FROM OLD.tipo_alta OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
       OR NEW.cycle_id IS DISTINCT FROM OLD.cycle_id OR NEW.discharge_date IS DISTINCT FROM OLD.discharge_date
       OR NEW.professional_id IS DISTINCT FROM OLD.professional_id
     ) THEN
    UPDATE public.patient_profession_careness
       SET annulled_at = now(), release_reason = 'alta corrigida'
     WHERE discharge_id = OLD.id AND annulled_at IS NULL;
  END IF;
  PERFORM public.apply_profession_careness_for_discharge(NEW.id, false);
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS patient_discharge_careness_sync ON public.patient_discharges;
CREATE TRIGGER patient_discharge_careness_sync
AFTER INSERT OR UPDATE OR DELETE ON public.patient_discharges
FOR EACH ROW EXECUTE FUNCTION public.sync_profession_careness_from_discharge();
REVOKE ALL ON FUNCTION public.sync_profession_careness_from_discharge() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_patient_profession_careness(p_patient_id text, p_professional_id text, p_unit_id text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_key text; v_name text; v_until date; v_scope text;
BEGIN
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
REVOKE ALL ON FUNCTION public.check_patient_profession_careness(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_patient_profession_careness(text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_patient_profession_careness()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_check jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.paciente_id IS NOT DISTINCT FROM OLD.paciente_id
     AND NEW.profissional_id IS NOT DISTINCT FROM OLD.profissional_id
     AND NEW.unidade_id IS NOT DISTINCT FROM OLD.unidade_id
     AND NEW.data IS NOT DISTINCT FROM OLD.data THEN RETURN NEW; END IF;
  IF current_setting('app.profession_careness_override', true) = 'on' THEN RETURN NEW; END IF;
  v_check := public.check_patient_profession_careness(NEW.paciente_id, NEW.profissional_id, NEW.unidade_id);
  IF coalesce((v_check->>'blocked')::boolean, false) THEN
    RAISE EXCEPTION '%', v_check->>'message' USING ERRCODE = 'P0001', DETAIL = v_check::text;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_guard_patient_profession_careness ON public.agendamentos;
CREATE TRIGGER trg_guard_patient_profession_careness
BEFORE INSERT OR UPDATE ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.guard_patient_profession_careness();
REVOKE ALL ON FUNCTION public.guard_patient_profession_careness() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_profession_careness_setup()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_result jsonb; v_catalog jsonb; v_signature text; v_confirmed text;
BEGIN
  IF NOT public.is_master_for_careness() THEN RAISE EXCEPTION 'Somente Master pode configurar carência' USING ERRCODE='42501'; END IF;
  v_catalog := public.profession_careness_catalog();
  v_signature := md5(v_catalog::text);
  SELECT confirmed_signature INTO v_confirmed FROM public.profession_careness_mapping_state WHERE id IS TRUE;
  SELECT jsonb_agg(p.value || jsonb_build_object(
    'profession_name',coalesce(r.profession_name,p.value->>'suggested_name'),
    'enabled',coalesce(r.enabled,false),'duration_value',coalesce(r.duration_value,30),
    'duration_unit',coalesce(r.duration_unit,'days'),'scope',coalesce(r.scope,'global')
  ) ORDER BY p.value->>'suggested_name') INTO v_result
    FROM jsonb_array_elements(v_catalog) p(value)
    LEFT JOIN public.profession_careness_rules r ON r.profession_key=p.value->>'profession_key';
  RETURN jsonb_build_object('professions',coalesce(v_result,'[]'::jsonb),'mapping_signature',v_signature,
    'mapping_confirmed',coalesce(v_confirmed,'')=v_signature);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.list_profession_careness_setup() TO authenticated;

CREATE OR REPLACE FUNCTION public.preview_profession_careness_retroactive(
  p_profession_key text, p_duration_value integer, p_duration_unit text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_total integer; v_expired integer; v_blocked integer;
BEGIN
  IF NOT public.is_master_for_careness() THEN RAISE EXCEPTION 'Somente Master pode visualizar impacto' USING ERRCODE='42501'; END IF;
  IF p_duration_value NOT BETWEEN 1 AND 3650 OR p_duration_unit NOT IN ('days','months') THEN RAISE EXCEPTION 'Período de carência inválido'; END IF;
  WITH eligible AS (
    SELECT DISTINCT d.id, public.careness_release_date(d.discharge_date,p_duration_value,p_duration_unit) AS release_date
      FROM public.patient_discharges d
      JOIN public.treatment_cycles c ON c.id=d.cycle_id
      JOIN public.funcionarios f ON f.id::text=c.professional_id
     WHERE d.tipo_alta='conclusao' AND public.normalize_profession(f.profissao)=p_profession_key
       AND NOT EXISTS (SELECT 1 FROM public.patient_profession_careness pc WHERE pc.discharge_id=d.id AND pc.annulled_at IS NULL
           AND (pc.released_at IS NULL OR pc.release_reason <> 'regra desativada'))
       AND NOT EXISTS (
         SELECT 1 FROM public.treatment_cycles oc JOIN public.funcionarios ofp ON ofp.id::text=oc.professional_id
          WHERE oc.patient_id=d.patient_id AND oc.id<>c.id AND oc.professional_id<>c.professional_id
            AND oc.status IN ('em_andamento','ativo') AND public.normalize_profession(ofp.profissao)=p_profession_key
       )
  ) SELECT count(*)::integer, count(*) FILTER (WHERE release_date < current_date)::integer,
           count(*) FILTER (WHERE release_date > current_date)::integer
      INTO v_total,v_expired,v_blocked FROM eligible;
  RETURN jsonb_build_object('total',coalesce(v_total,0),'expired',coalesce(v_expired,0),'blocked_now',coalesce(v_blocked,0));
END;
$function$;
GRANT EXECUTE ON FUNCTION public.preview_profession_careness_retroactive(text,integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_profession_careness_rule(
  p_profession_key text, p_profession_name text, p_enabled boolean,
  p_duration_value integer, p_duration_unit text, p_scope text, p_apply_retroactive boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_staff public.funcionarios%ROWTYPE; v_preview jsonb; v_rows integer := 0;
  v_existing record; v_release date;
BEGIN
  SELECT * INTO v_staff FROM public.funcionarios f WHERE f.auth_user_id=auth.uid() AND f.ativo IS TRUE AND lower(trim(f.role))='master';
  IF NOT FOUND THEN RAISE EXCEPTION 'Somente Master pode configurar carência' USING ERRCODE='42501'; END IF;
  IF p_profession_key IS NULL OR p_profession_key <> public.normalize_profession(p_profession_key)
     OR nullif(trim(p_profession_name),'') IS NULL THEN RAISE EXCEPTION 'Profissão consolidada inválida'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.profession_careness_catalog()) p(value)
      WHERE p.value->>'profession_key'=p_profession_key) THEN RAISE EXCEPTION 'Profissão não encontrada no cadastro atual'; END IF;
  IF p_enabled AND NOT EXISTS (SELECT 1 FROM public.profession_careness_mapping_state WHERE id IS TRUE
       AND confirmed_signature=md5(public.profession_careness_catalog()::text)) THEN
    RAISE EXCEPTION 'Confirme primeiro a lista consolidada de profissões.';
  END IF;
  IF p_duration_value NOT BETWEEN 1 AND 3650 OR p_duration_unit NOT IN ('days','months') OR p_scope NOT IN ('global','unit') THEN
    RAISE EXCEPTION 'Período ou escopo inválido';
  END IF;
  INSERT INTO public.profession_careness_rules(profession_key,profession_name,enabled,duration_value,duration_unit,scope,updated_by,updated_at)
  VALUES(p_profession_key,trim(p_profession_name),p_enabled,p_duration_value,p_duration_unit,p_scope,v_staff.id::text,now())
  ON CONFLICT(profession_key) DO UPDATE SET profession_name=EXCLUDED.profession_name,enabled=EXCLUDED.enabled,
    duration_value=EXCLUDED.duration_value,duration_unit=EXCLUDED.duration_unit,scope=EXCLUDED.scope,
    updated_by=EXCLUDED.updated_by,updated_at=now();

  IF p_apply_retroactive AND p_enabled THEN
    v_preview := public.preview_profession_careness_retroactive(p_profession_key,p_duration_value,p_duration_unit);
    FOR v_existing IN
      SELECT d.id, d.patient_id, d.cycle_id, d.discharge_date, c.professional_id, c.unit_id
      FROM public.patient_discharges d JOIN public.treatment_cycles c ON c.id=d.cycle_id
      JOIN public.funcionarios f ON f.id::text=c.professional_id
      WHERE d.tipo_alta='conclusao' AND public.normalize_profession(f.profissao)=p_profession_key
        AND NOT EXISTS (SELECT 1 FROM public.patient_profession_careness pc WHERE pc.discharge_id=d.id AND pc.annulled_at IS NULL
            AND (pc.released_at IS NULL OR pc.release_reason <> 'regra desativada'))
    LOOP
      IF coalesce((public.apply_profession_careness_for_discharge(v_existing.id,true)->>'created')::boolean,false) THEN
        v_rows := v_rows + 1;
      END IF;
    END LOOP;
    UPDATE public.patient_profession_careness pc SET
      release_date=public.careness_release_date(pc.discharge_date,p_duration_value,p_duration_unit),
      scope=p_scope, profession_name=trim(p_profession_name)
    WHERE pc.profession_key=p_profession_key AND pc.released_at IS NULL AND pc.annulled_at IS NULL
      AND EXISTS (SELECT 1 FROM public.patient_discharges d WHERE d.id=pc.discharge_id AND d.tipo_alta='conclusao');
    INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,detalhes)
    VALUES(v_staff.id::text,v_staff.nome,v_staff.role,coalesce(v_staff.unidade_id,''),'carencia_retroativa_aplicada',
      'profession_careness_rule',p_profession_key,jsonb_build_object('preview',v_preview,'novos_registros',v_rows));
  END IF;
  IF NOT p_enabled THEN
    UPDATE public.patient_profession_careness SET released_at=now(),release_reason='regra desativada'
     WHERE profession_key=p_profession_key AND released_at IS NULL AND annulled_at IS NULL;
  END IF;
  INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,detalhes)
  VALUES(v_staff.id::text,v_staff.nome,v_staff.role,coalesce(v_staff.unidade_id,''),'regra_carencia_atualizada',
    'profession_careness_rule',p_profession_key,jsonb_build_object('enabled',p_enabled,'duration_value',p_duration_value,
      'duration_unit',p_duration_unit,'scope',p_scope,'retroactive',p_apply_retroactive));
  RETURN jsonb_build_object('saved',true,'retroactive',coalesce(v_preview,'{}'::jsonb),'created',v_rows);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.save_profession_careness_rule(text,text,boolean,integer,text,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_patient_profession_careness(p_patient_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária' USING ERRCODE='42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('profession',c.profession_name,'discharge_date',c.discharge_date,
      'release_date',c.release_date,'source_unit_id',c.source_unit_id,'scope',c.scope))
    FROM public.patient_profession_careness c
    JOIN public.profession_careness_rules r ON r.profession_key=c.profession_key AND r.enabled IS TRUE
    WHERE c.patient_id=p_patient_id AND c.released_at IS NULL AND c.annulled_at IS NULL AND c.release_date>current_date), '[]'::jsonb);
END;
$function$;
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
GRANT EXECUTE ON FUNCTION public.list_active_profession_careness() TO authenticated;

CREATE OR REPLACE FUNCTION public.release_profession_careness_for_medical_referral(
  p_patient_id text,p_specialty text,p_source text DEFAULT 'patient_referral',p_source_id text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_staff public.funcionarios%ROWTYPE; v_key text; v_count integer := 0;
BEGIN
  SELECT * INTO v_staff FROM public.funcionarios f WHERE f.auth_user_id=auth.uid() AND f.ativo IS TRUE;
  IF NOT FOUND OR public.unaccent(lower(coalesce(v_staff.profissao,''))) !~ '^medic' THEN
    RETURN jsonb_build_object('released',0,'authorized',false);
  END IF;
  v_key := public.normalize_profession(p_specialty);
  IF v_key IS NULL THEN RETURN jsonb_build_object('released',0,'authorized',true); END IF;
  UPDATE public.patient_profession_careness SET released_at=now(),release_reason='nova prescrição médica'
   WHERE patient_id=p_patient_id AND profession_key=v_key AND released_at IS NULL AND annulled_at IS NULL AND release_date>current_date;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count>0 THEN
    INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,detalhes)
    VALUES(v_staff.id::text,v_staff.nome,v_staff.role,coalesce(v_staff.unidade_id,''),'carencia_liberada_nova_prescricao',
      'patient_profession_careness',coalesce(p_source_id,p_patient_id),jsonb_build_object('patient_id',p_patient_id,
      'profession',p_specialty,'source',p_source,'released_count',v_count,'reason','nova prescrição médica'));
  END IF;
  RETURN jsonb_build_object('released',v_count,'authorized',true);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.release_profession_careness_for_medical_referral(text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_careness_from_patient_referral()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_staff public.funcionarios%ROWTYPE; v_result jsonb;
BEGIN
  SELECT * INTO v_staff FROM public.funcionarios f WHERE f.auth_user_id=NEW.professional_id AND f.ativo IS TRUE;
  IF FOUND AND public.unaccent(lower(coalesce(v_staff.profissao,''))) ~ '^medic' AND NEW.status='ativo' THEN
    UPDATE public.patient_profession_careness SET released_at=now(),release_reason='nova prescrição médica'
     WHERE patient_id=NEW.patient_id AND profession_key=public.normalize_profession(NEW.especialidade_destino)
       AND released_at IS NULL AND annulled_at IS NULL AND release_date>current_date;
    IF FOUND THEN
      INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,detalhes)
      VALUES(v_staff.id::text,v_staff.nome,v_staff.role,coalesce(v_staff.unidade_id,''),'carencia_liberada_nova_prescricao',
        'patient_referral',NEW.id::text,jsonb_build_object('patient_id',NEW.patient_id,'profession',NEW.especialidade_destino,'reason','nova prescrição médica'));
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS patient_referral_releases_profession_careness ON public.patient_referrals;
CREATE TRIGGER patient_referral_releases_profession_careness
AFTER INSERT OR UPDATE OF status,especialidade_destino,professional_id ON public.patient_referrals
FOR EACH ROW EXECUTE FUNCTION public.release_careness_from_patient_referral();
REVOKE ALL ON FUNCTION public.release_careness_from_patient_referral() FROM PUBLIC, anon, authenticated;

-- Shared manual discharge transaction: this also returns any newly generated
-- carence end date to the UI. Only conclusion creates a carence event.
CREATE OR REPLACE FUNCTION public.register_treatment_discharge(
  p_cycle_id uuid,p_tipo_alta public.tipo_alta,p_reason text,p_final_notes text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_staff record; v_role text; v_permission boolean; v_cycle record; v_discharge_id uuid;
  v_appointment_ids text[] := ARRAY[]::text[]; v_removed_sessions integer := 0; v_removed_appointments integer := 0; v_careness jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE='42501'; END IF;
  IF nullif(btrim(coalesce(p_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'Informe o motivo da alta'; END IF;
  SELECT f.id,f.role,f.usuario,f.unidade_id INTO v_staff FROM public.funcionarios f
   WHERE f.auth_user_id=auth.uid() AND f.ativo IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário ativo não encontrado' USING ERRCODE='42501'; END IF;
  v_role:=lower(trim(v_staff.role));
  v_role:=CASE v_role WHEN 'gestão' THEN 'gestao' WHEN 'gestor' THEN 'gestao' WHEN 'coordenacao' THEN 'gestao'
    WHEN 'coordenador' THEN 'gestao' WHEN 'recepção' THEN 'recepcao' WHEN 'tecnico' THEN 'triagem'
    WHEN 'tecnico_enfermagem' THEN 'enfermagem' ELSE v_role END;
  SELECT c.id,c.patient_id,c.professional_id,c.unit_id,c.status,c.total_sessions,c.sessions_done
    INTO v_cycle FROM public.treatment_cycles c WHERE c.id=p_cycle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo de tratamento não encontrado'; END IF;
  IF v_cycle.status NOT IN ('em_andamento','ativo') AND NOT (v_cycle.status='concluido'
      AND v_cycle.total_sessions>0 AND v_cycle.sessions_done>=v_cycle.total_sessions) THEN
    RAISE EXCEPTION 'Este ciclo não está disponível para alta'; END IF;
  IF EXISTS(SELECT 1 FROM public.patient_discharges d WHERE d.cycle_id=p_cycle_id) THEN RAISE EXCEPTION 'Este ciclo já possui alta registrada'; END IF;
  IF v_role<>'master' AND NOT (v_role='profissional' AND v_cycle.professional_id=v_staff.id::text) THEN
    SELECT chosen.can_delete INTO v_permission FROM (
      SELECT pu.can_delete,1 rank FROM public.permissoes_usuario pu WHERE pu.user_id=v_staff.id::text AND pu.modulo='tratamento'
        AND pu.unidade_id=coalesce(v_staff.unidade_id,'') AND coalesce(v_staff.unidade_id,'')<>''
      UNION ALL SELECT pu.can_delete,2 FROM public.permissoes_usuario pu WHERE pu.user_id=v_staff.id::text AND pu.modulo='tratamento' AND pu.unidade_id=''
      UNION ALL SELECT p.can_delete,3 FROM public.permissoes p WHERE p.perfil IN(v_role,lower(trim(v_staff.role))) AND p.modulo='tratamento'
        AND p.unidade_id=coalesce(v_staff.unidade_id,'') AND coalesce(v_staff.unidade_id,'')<>''
      UNION ALL SELECT p.can_delete,4 FROM public.permissoes p WHERE p.perfil IN(v_role,lower(trim(v_staff.role))) AND p.modulo='tratamento' AND p.unidade_id=''
    ) chosen ORDER BY chosen.rank LIMIT 1;
    IF v_permission IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Sem permissão para registrar alta deste tratamento' USING ERRCODE='42501'; END IF;
  END IF;
  IF v_role<>'master' AND v_staff.usuario IS DISTINCT FROM 'admin.sms' AND nullif(v_staff.unidade_id,'') IS NOT NULL
     AND v_cycle.unit_id IS DISTINCT FROM v_staff.unidade_id THEN RAISE EXCEPTION 'Ciclo fora do escopo da unidade' USING ERRCODE='42501'; END IF;
  IF v_role<>'master' AND v_staff.usuario IS DISTINCT FROM 'admin.sms' AND nullif(v_staff.unidade_id,'') IS NULL AND v_role<>'profissional' THEN
    RAISE EXCEPTION 'Unidade do funcionário não identificada' USING ERRCODE='42501'; END IF;
  SELECT coalesce(array_agg(s.appointment_id) FILTER(WHERE s.appointment_id IS NOT NULL),ARRAY[]::text[]) INTO v_appointment_ids
    FROM public.treatment_sessions s WHERE s.cycle_id=p_cycle_id AND s.scheduled_date>=CURRENT_DATE AND s.status IN('pendente_agendamento','agendada');
  INSERT INTO public.patient_discharges(cycle_id,patient_id,professional_id,discharge_date,reason,final_notes,tipo_alta)
    VALUES(v_cycle.id,v_cycle.patient_id,v_staff.id::text,CURRENT_DATE,btrim(p_reason),coalesce(p_final_notes,''),p_tipo_alta)
    RETURNING id INTO v_discharge_id;
  DELETE FROM public.treatment_sessions s WHERE s.cycle_id=p_cycle_id AND s.scheduled_date>=CURRENT_DATE AND s.status IN('pendente_agendamento','agendada');
  GET DIAGNOSTICS v_removed_sessions=ROW_COUNT;
  IF cardinality(v_appointment_ids)>0 THEN
    DELETE FROM public.agendamentos a WHERE a.id=ANY(v_appointment_ids) AND a.paciente_id=v_cycle.patient_id
      AND a.profissional_id=v_cycle.professional_id AND a.unidade_id=v_cycle.unit_id
      AND a.status NOT IN('cancelado','falta','remarcado','realizado','atendido','concluido');
    GET DIAGNOSTICS v_removed_appointments=ROW_COUNT;
  END IF;
  UPDATE public.treatment_cycles SET status='finalizado_alta',updated_at=now() WHERE id=p_cycle_id;
  SELECT public.apply_profession_careness_for_discharge(v_discharge_id,false) INTO v_careness;
  RETURN jsonb_build_object('discharge_id',v_discharge_id,'removed_sessions',v_removed_sessions,
    'removed_appointments',v_removed_appointments,'careness',coalesce(v_careness,'{}'::jsonb));
END;
$function$;
REVOKE ALL ON FUNCTION public.register_treatment_discharge(uuid,public.tipo_alta,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_treatment_discharge(uuid,public.tipo_alta,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_internal_appointment_with_policy_override(
  p_payload jsonb,p_override_reason text,p_bypass_careness boolean,p_capacity_override boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_staff public.funcionarios%ROWTYPE; v_check jsonb; v_careness jsonb; v_row public.agendamentos%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_staff FROM public.funcionarios WHERE auth_user_id=auth.uid() AND ativo IS TRUE;
  IF NOT FOUND OR lower(trim(v_staff.role))<>'master' THEN RAISE EXCEPTION 'Somente Master pode autorizar esta exceção' USING ERRCODE='42501'; END IF;
  IF v_staff.usuario IS DISTINCT FROM 'admin.sms' AND v_staff.unidade_id IS DISTINCT FROM p_payload->>'unidade_id' THEN
    RAISE EXCEPTION 'Master sem acesso à unidade do agendamento' USING ERRCODE='42501'; END IF;
  IF length(btrim(coalesce(p_override_reason,'')))<3 THEN RAISE EXCEPTION 'Informe o motivo da exceção'; END IF;
  IF coalesce(p_payload->>'origem','')='externo' THEN RAISE EXCEPTION 'Origem externa não permitida nesta função'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended((p_payload->>'profissional_id')||'|'||(p_payload->>'unidade_id')||'|'||(p_payload->>'data'),0));
  v_check:=public.check_internal_slot_availability(p_payload->>'profissional_id',p_payload->>'unidade_id',(p_payload->>'data')::date,p_payload->>'hora');
  IF NOT coalesce((v_check->>'available')::boolean,false) AND NOT (
      p_capacity_override AND v_check->>'reason'='external_reservation') THEN
    RAISE EXCEPTION 'Encaixe Master não permitido: %',coalesce(v_check->>'reason','indisponível'); END IF;
  v_careness:=public.check_patient_profession_careness(p_payload->>'paciente_id',p_payload->>'profissional_id',p_payload->>'unidade_id');
  IF coalesce((v_careness->>'blocked')::boolean,false) AND NOT p_bypass_careness THEN
    RAISE EXCEPTION '%',v_careness->>'message' USING ERRCODE='P0001'; END IF;
  IF p_bypass_careness AND NOT coalesce((v_careness->>'blocked')::boolean,false) THEN
    RAISE EXCEPTION 'Não há carência ativa para ignorar'; END IF;
  IF p_capacity_override THEN PERFORM set_config('app.master_capacity_override','on',true); END IF;
  IF p_bypass_careness THEN PERFORM set_config('app.profession_careness_override','on',true); END IF;
  INSERT INTO public.agendamentos(id,paciente_id,paciente_nome,unidade_id,sala_id,setor_id,profissional_id,profissional_nome,data,hora,status,tipo,observacoes,origem,criado_por,prioridade_perfil)
  VALUES(p_payload->>'id',p_payload->>'paciente_id',p_payload->>'paciente_nome',p_payload->>'unidade_id',
    coalesce(p_payload->>'sala_id',''),coalesce(p_payload->>'setor_id',''),p_payload->>'profissional_id',p_payload->>'profissional_nome',
    (p_payload->>'data')::date,p_payload->>'hora',coalesce(p_payload->>'status','confirmado'),p_payload->>'tipo',
    coalesce(p_payload->>'observacoes',''),coalesce(p_payload->>'origem','recepcao'),v_staff.id::text,'normal') RETURNING * INTO v_row;
  PERFORM set_config('app.master_capacity_override','off',true);
  PERFORM set_config('app.profession_careness_override','off',true);
  INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,detalhes,agendamento_id,paciente_id,profissional_id)
  VALUES(v_staff.id::text,v_staff.nome,v_staff.role,v_row.unidade_id,'encaixe_master_excecao_carencia','agendamento',v_row.id,
    jsonb_build_object('motivo',btrim(p_override_reason),'bypass_careness',p_bypass_careness,'capacity_override',p_capacity_override,
      'carencia',v_careness,'capacity',v_check),v_row.id,v_row.paciente_id,v_row.profissional_id);
  RETURN jsonb_build_object('id',v_row.id,'created',true);
END;
$function$;
REVOKE ALL ON FUNCTION public.create_internal_appointment_with_policy_override(jsonb,text,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_internal_appointment_with_policy_override(jsonb,text,boolean,boolean) TO authenticated;

-- Inline referrals stored in the existing storage workflow also release via a
-- server-verified medical-professional RPC (never trust the browser role).
REVOKE ALL ON FUNCTION public.release_profession_careness_for_medical_referral(text,text,text,text) FROM PUBLIC,anon;

COMMIT;
