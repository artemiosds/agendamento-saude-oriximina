BEGIN;
SET LOCAL lock_timeout = '5s';

-- Seed and install the trigger without a concurrent write slipping between them.
LOCK TABLE public.pacientes IN SHARE ROW EXCLUSIVE MODE;

CREATE SCHEMA IF NOT EXISTS patient_identity;
REVOKE ALL ON SCHEMA patient_identity FROM PUBLIC, anon, authenticated;

-- Keep a count for each legacy CPF, even if more than one ficha already uses it.
-- The unique key serializes new claims at the database level.
CREATE TABLE patient_identity.cpf_claims (
  digits text PRIMARY KEY,
  reference_count bigint NOT NULL CHECK (reference_count > 0)
);
REVOKE ALL ON TABLE patient_identity.cpf_claims FROM PUBLIC, anon, authenticated;

INSERT INTO patient_identity.cpf_claims (digits, reference_count)
SELECT digits, count(*)
FROM (
  SELECT regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g') AS digits
  FROM public.pacientes
) AS normalized
WHERE length(digits) = 11
GROUP BY digits;

CREATE FUNCTION patient_identity.guard_patient_cpf()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  old_digits text := '';
  new_digits text := '';
  raw_cpf text;
  total integer;
  prefix_length integer;
  i integer;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_digits := pg_catalog.regexp_replace(coalesce(OLD.cpf, ''), '[^0-9]', '', 'g');
  END IF;

  IF TG_WHEN = 'BEFORE' THEN
    raw_cpf := pg_catalog.btrim(coalesce(NEW.cpf, ''));
    new_digits := pg_catalog.regexp_replace(raw_cpf, '[^0-9]', '', 'g');

    -- Permit unrelated edits and reformatting of existing values without
    -- retrospectively imposing validation on legacy fichas.
    IF TG_OP = 'UPDATE' AND old_digits = new_digits AND
      (NEW.cpf IS NOT DISTINCT FROM OLD.cpf OR (raw_cpf = '' OR raw_cpf ~ '^[0-9. -]+$')) THEN
      RETURN NEW;
    END IF;

    IF raw_cpf = '' THEN
      IF TG_OP <> 'INSERT' OR (NEW.custom_data->'semCpf') IS DISTINCT FROM 'true'::jsonb
        OR NOT public.is_staff_member() THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CPF do paciente é obrigatório.';
      END IF;
    ELSE
      IF raw_cpf !~ '^([0-9]{11}|[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2})$'
        OR new_digits = pg_catalog.repeat(pg_catalog.left(new_digits, 1), 11) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CPF do paciente inválido.';
      END IF;
      FOREACH prefix_length IN ARRAY ARRAY[9, 10] LOOP
        total := 0;
        FOR i IN 1..prefix_length LOOP
          total := total + pg_catalog.substr(new_digits, i, 1)::integer * (prefix_length + 2 - i);
        END LOOP;
        IF ((total * 10) % 11) % 10 <> pg_catalog.substr(new_digits, prefix_length + 1, 1)::integer THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CPF do paciente inválido.';
        END IF;
      END LOOP;

      NEW.cpf := new_digits;
    END IF;
    RETURN NEW;
  END IF;

  -- Only claim CPFs for rows actually written, including with ON CONFLICT.
  IF TG_OP <> 'DELETE' THEN
    new_digits := pg_catalog.regexp_replace(coalesce(NEW.cpf, ''), '[^0-9]', '', 'g');
    IF TG_OP = 'UPDATE' AND old_digits = new_digits THEN RETURN NULL; END IF;
    IF length(new_digits) = 11 THEN
      INSERT INTO patient_identity.cpf_claims (digits, reference_count) VALUES (new_digits, 1)
      ON CONFLICT (digits) DO NOTHING;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Já existe paciente cadastrado com este CPF.';
      END IF;
    END IF;
  END IF;

  IF length(old_digits) = 11 THEN
    PERFORM 1 FROM patient_identity.cpf_claims WHERE digits = old_digits FOR UPDATE;
    DELETE FROM patient_identity.cpf_claims WHERE digits = old_digits AND reference_count = 1;
    IF NOT FOUND THEN
      UPDATE patient_identity.cpf_claims SET reference_count = reference_count - 1 WHERE digits = old_digits;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION patient_identity.guard_patient_cpf() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_patient_cpf
BEFORE INSERT OR UPDATE OF cpf ON public.pacientes
FOR EACH ROW EXECUTE FUNCTION patient_identity.guard_patient_cpf();

CREATE TRIGGER claim_patient_cpf
AFTER INSERT OR UPDATE OF cpf OR DELETE ON public.pacientes
FOR EACH ROW EXECUTE FUNCTION patient_identity.guard_patient_cpf();

COMMIT;
