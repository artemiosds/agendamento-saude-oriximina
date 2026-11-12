CREATE OR REPLACE FUNCTION public.external_create_patient(p_unidade_id text, p_nome text, p_cpf text DEFAULT NULL::text, p_cns text DEFAULT NULL::text, p_data_nascimento text DEFAULT NULL::text, p_telefone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_endereco text DEFAULT NULL::text, p_nome_mae text DEFAULT NULL::text, p_municipio text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_external_id uuid;
  v_patient_id text;
  v_cpf_digits text := regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g');
  v_cns_digits text := regexp_replace(coalesce(p_cns, ''), '[^0-9]', '', 'g');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  SELECT pe.id INTO v_external_id
    FROM public.profissionais_externos pe
    WHERE pe.auth_user_id = auth.uid() AND pe.ativo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profissional externo inativo ou não encontrado'; END IF;
  IF coalesce(btrim(p_nome), '') = '' THEN RAISE EXCEPTION 'Nome do paciente é obrigatório'; END IF;
  IF coalesce(btrim(p_unidade_id), '') = '' OR NOT EXISTS (
    SELECT 1 FROM public.quotas_externas q
    JOIN public.unidades u ON u.id = q.unidade_id AND u.ativo = true
    WHERE q.profissional_externo_id = v_external_id
      AND q.unidade_id = p_unidade_id AND q.ativo = true
  ) THEN
    RAISE EXCEPTION 'Unidade sem cota ativa para este profissional';
  END IF;
  IF length(v_cpf_digits) > 0 AND EXISTS (
    SELECT 1 FROM public.pacientes p
    WHERE regexp_replace(coalesce(p.cpf, ''), '[^0-9]', '', 'g') = v_cpf_digits
  ) THEN RAISE EXCEPTION 'Já existe paciente cadastrado com este CPF; pesquise antes de cadastrar'; END IF;
  IF length(v_cns_digits) > 0 AND EXISTS (
    SELECT 1 FROM public.pacientes p
    WHERE regexp_replace(coalesce(p.cns, ''), '[^0-9]', '', 'g') = v_cns_digits
  ) THEN RAISE EXCEPTION 'Já existe paciente cadastrado com este CNS; pesquise antes de cadastrar'; END IF;

  v_patient_id := 'pac_' || gen_random_uuid()::text;
  INSERT INTO public.pacientes (
    id, nome, cpf, cns, data_nascimento, telefone, email, endereco,
    nome_mae, municipio, unidade_id
  ) VALUES (
    v_patient_id, btrim(p_nome), coalesce(btrim(p_cpf), ''), coalesce(btrim(p_cns), ''),
    coalesce(btrim(p_data_nascimento), ''), coalesce(btrim(p_telefone), ''),
    coalesce(btrim(p_email), ''), coalesce(btrim(p_endereco), ''),
    coalesce(btrim(p_nome_mae), ''), coalesce(btrim(p_municipio), ''), p_unidade_id
  );

  RETURN jsonb_build_object(
    'id', v_patient_id, 'nome', btrim(p_nome),
    'cpf', nullif(btrim(p_cpf), ''), 'cns', nullif(btrim(p_cns), ''),
    'data_nascimento', nullif(btrim(p_data_nascimento), ''),
    'telefone', nullif(btrim(p_telefone), ''), 'email', nullif(btrim(p_email), ''),
    'endereco', nullif(btrim(p_endereco), ''), 'nome_mae', nullif(btrim(p_nome_mae), ''),
    'municipio', nullif(btrim(p_municipio), ''), 'can_edit', true
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.external_update_patient(p_paciente_id text, p_unidade_id text, p_nome text, p_cpf text DEFAULT NULL::text, p_cns text DEFAULT NULL::text, p_data_nascimento text DEFAULT NULL::text, p_telefone text DEFAULT NULL::text, p_endereco text DEFAULT NULL::text, p_nome_mae text DEFAULT NULL::text, p_municipio text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_external_id uuid;
  v_patient public.pacientes%ROWTYPE;
  v_cpf_digits text := regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g');
  v_cns_digits text := regexp_replace(coalesce(p_cns, ''), '[^0-9]', '', 'g');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  SELECT pe.id INTO v_external_id
    FROM public.profissionais_externos pe
    WHERE pe.auth_user_id = auth.uid() AND pe.ativo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profissional externo inativo ou não encontrado'; END IF;
  IF coalesce(btrim(p_nome), '') = '' THEN RAISE EXCEPTION 'Nome do paciente é obrigatório'; END IF;
  IF coalesce(btrim(p_unidade_id), '') = '' OR NOT EXISTS (
    SELECT 1 FROM public.quotas_externas q
    JOIN public.unidades u ON u.id = q.unidade_id AND u.ativo = true
    WHERE q.profissional_externo_id = v_external_id
      AND q.unidade_id = p_unidade_id AND q.ativo = true
  ) THEN
    RAISE EXCEPTION 'Unidade sem cota ativa para este profissional';
  END IF;

  SELECT p.* INTO v_patient
  FROM public.pacientes p
  WHERE p.id = p_paciente_id
    AND (p.unidade_id = p_unidade_id OR EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.paciente_id = p.id AND a.unidade_id = p_unidade_id
    ))
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente vinculado a outra unidade; cadastro disponível somente para consulta';
  END IF;
  IF length(v_cpf_digits) > 0 AND EXISTS (
    SELECT 1 FROM public.pacientes p
    WHERE p.id <> p_paciente_id
      AND regexp_replace(coalesce(p.cpf, ''), '[^0-9]', '', 'g') = v_cpf_digits
  ) THEN RAISE EXCEPTION 'Este CPF já está vinculado a outro paciente'; END IF;
  IF length(v_cns_digits) > 0 AND EXISTS (
    SELECT 1 FROM public.pacientes p
    WHERE p.id <> p_paciente_id
      AND regexp_replace(coalesce(p.cns, ''), '[^0-9]', '', 'g') = v_cns_digits
  ) THEN RAISE EXCEPTION 'Este CNS já está vinculado a outro paciente'; END IF;

  UPDATE public.pacientes SET
    nome = btrim(p_nome),
    cpf = coalesce(btrim(p_cpf), ''),
    cns = coalesce(btrim(p_cns), ''),
    data_nascimento = coalesce(btrim(p_data_nascimento), ''),
    telefone = coalesce(btrim(p_telefone), ''),
    endereco = coalesce(btrim(p_endereco), ''),
    nome_mae = coalesce(btrim(p_nome_mae), ''),
    municipio = coalesce(btrim(p_municipio), '')
  WHERE id = p_paciente_id;

  RETURN jsonb_build_object(
    'id', v_patient.id, 'nome', btrim(p_nome),
    'cpf', nullif(btrim(p_cpf), ''), 'cns', nullif(btrim(p_cns), ''),
    'data_nascimento', nullif(btrim(p_data_nascimento), ''),
    'telefone', nullif(btrim(p_telefone), ''), 'email', v_patient.email,
    'endereco', nullif(btrim(p_endereco), ''), 'nome_mae', nullif(btrim(p_nome_mae), ''),
    'municipio', nullif(btrim(p_municipio), ''), 'can_edit', true
  );
END;
$function$;