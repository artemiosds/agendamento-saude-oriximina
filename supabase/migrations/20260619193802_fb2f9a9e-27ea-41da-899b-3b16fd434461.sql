
-- ============================================================
-- Proteção do tipo de relatório "alta_individual_fono_v1"
-- Aditivo: NÃO altera tabelas/colunas/políticas/dados existentes.
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_user_cbo_codigo()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT regexp_replace(coalesce(custom_data->>'cbo_codigo', ''), '\D', '', 'g')
    FROM public.funcionarios
   WHERE auth_user_id = auth.uid()
     AND ativo = true
   LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.current_user_cbo_codigo() TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.enforce_fono_avaliativo_cbo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cbo text;
  v_user text;
BEGIN
  IF NEW.tipo_registro IS DISTINCT FROM 'alta_individual_fono_v1' THEN
    RETURN NEW;
  END IF;

  -- admin global "admin.sms" sempre pode (necessário para manutenção/correção)
  SELECT usuario INTO v_user
    FROM public.funcionarios
   WHERE auth_user_id = auth.uid()
   LIMIT 1;
  IF v_user = 'admin.sms' THEN
    RETURN NEW;
  END IF;

  v_cbo := public.current_user_cbo_codigo();

  IF v_cbo IS NULL OR v_cbo <> '223810' THEN
    RAISE EXCEPTION 'Apenas profissionais com CBO 223810 (Fonoaudiólogo) podem criar ou alterar o Relatório Fonoaudiológico Avaliativo.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_fono_avaliativo_cbo ON public.prontuarios;
CREATE TRIGGER trg_enforce_fono_avaliativo_cbo
BEFORE INSERT OR UPDATE ON public.prontuarios
FOR EACH ROW
EXECUTE FUNCTION public.enforce_fono_avaliativo_cbo();
