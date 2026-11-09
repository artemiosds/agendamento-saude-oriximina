-- Tighten external professional access to patient data and make patient cancellation atomic.
-- External users no longer read or mutate the pacientes table directly; they use
-- narrowly-scoped RPCs for scheduling demographics only.

DROP POLICY IF EXISTS "External read pacientes" ON public.pacientes;
DROP POLICY IF EXISTS "External update pacientes" ON public.pacientes;
DROP POLICY IF EXISTS "External insert pacientes" ON public.pacientes;

CREATE OR REPLACE FUNCTION public.cancel_external_appointment(p_agendamento_id text, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user public.profissionais_externos%ROWTYPE;
  v_staff public.funcionarios%ROWTYPE;
  v_patient public.pacientes%ROWTYPE;
  v_appt public.agendamentos%ROWTYPE;
  v_aux public.agendamentos_externos%ROWTYPE;
  v_quota public.quotas_externas%ROWTYPE;
  v_uuid uuid;
  v_actor_id text;
  v_actor_name text;
  v_actor_role text;
  v_profile text;
  v_authorized boolean := false;
  v_is_patient boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  IF coalesce(length(btrim(p_motivo)), 0) < 3 THEN RAISE EXCEPTION 'Informe o motivo do cancelamento'; END IF;

  SELECT * INTO v_user FROM public.profissionais_externos
    WHERE auth_user_id = auth.uid() AND ativo = true;
  SELECT * INTO v_staff FROM public.funcionarios
    WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1;
  SELECT * INTO v_appt FROM public.agendamentos WHERE id = p_agendamento_id FOR UPDATE;
  IF NOT FOUND OR v_appt.origem <> 'externo' THEN
    RAISE EXCEPTION 'Agendamento externo não encontrado';
  END IF;

  IF v_user.id IS NOT NULL AND v_appt.agendado_por_externo = v_user.id::text THEN
    v_actor_id := v_user.id::text;
    v_actor_name := v_user.nome;
    v_actor_role := 'externo';
    v_authorized := true;
  ELSE
    SELECT * INTO v_patient FROM public.pacientes
      WHERE id = v_appt.paciente_id AND auth_user_id = auth.uid()
      LIMIT 1;
    IF FOUND THEN
      v_actor_id := auth.uid()::text;
      v_actor_name := v_patient.nome;
      v_actor_role := 'paciente';
      v_authorized := true;
      v_is_patient := true;
    ELSIF v_staff.id IS NOT NULL THEN
      v_profile := CASE lower(btrim(v_staff.role))
        WHEN 'coordenador' THEN 'gestao' WHEN 'coordenacao' THEN 'gestao'
        WHEN 'gestor' THEN 'gestao' WHEN 'gestão' THEN 'gestao'
        WHEN 'recepção' THEN 'recepcao' ELSE lower(btrim(v_staff.role)) END;
      IF v_profile = 'master' THEN
        v_authorized := true;
      ELSIF v_staff.unidade_id = v_appt.unidade_id THEN
        SELECT coalesce(
          (SELECT pu.can_edit FROM public.permissoes_usuario pu
           WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'agenda'
             AND pu.unidade_id IN ('', v_appt.unidade_id)
           ORDER BY (pu.unidade_id = v_appt.unidade_id) DESC LIMIT 1),
          (SELECT p.can_edit FROM public.permissoes p
           WHERE p.perfil IN (v_profile, lower(btrim(v_staff.role))) AND p.modulo = 'agenda'
             AND p.unidade_id IN ('', v_appt.unidade_id)
           ORDER BY (p.unidade_id = v_appt.unidade_id) DESC,
                    (p.perfil = v_profile) DESC LIMIT 1), false)
        INTO v_authorized;
      END IF;
      v_actor_id := v_staff.id::text;
      v_actor_name := v_staff.nome;
      v_actor_role := v_staff.role;
    END IF;
  END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Sem permissão para cancelar este agendamento externo nesta unidade';
  END IF;
  IF v_is_patient AND v_appt.status NOT IN ('pendente', 'confirmado') THEN
    RAISE EXCEPTION 'O paciente só pode cancelar o próprio agendamento antes da chegada';
  END IF;
  IF p_agendamento_id !~ '^ag_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Vínculo externo inválido; solicite revisão ao Master';
  END IF;
  v_uuid := substring(p_agendamento_id FROM 4)::uuid;
  SELECT * INTO v_aux FROM public.agendamentos_externos WHERE id = v_uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vínculo externo ausente; solicite revisão ao Master'; END IF;
  IF v_aux.profissional_externo_id::text IS DISTINCT FROM v_appt.agendado_por_externo
     OR v_aux.profissional_externo_id::text IS DISTINCT FROM v_appt.criado_por
     OR v_aux.paciente_id IS DISTINCT FROM v_appt.paciente_id
     OR v_aux.profissional_interno_id::text IS DISTINCT FROM v_appt.profissional_id
     OR v_aux.unidade_id IS DISTINCT FROM v_appt.unidade_id
     OR v_aux.data IS DISTINCT FROM v_appt.data
     OR v_aux.horario IS DISTINCT FROM v_appt.hora::time THEN
    RAISE EXCEPTION 'Vínculo externo divergente; solicite revisão ao Master';
  END IF;
  IF v_appt.status = 'cancelado' AND v_aux.status = 'cancelado' THEN
    RETURN jsonb_build_object('id', v_appt.id, 'already_cancelled', true);
  END IF;
  SELECT * INTO v_quota FROM public.quotas_externas WHERE id = v_aux.cota_id FOR UPDATE;
  IF NOT FOUND OR v_quota.profissional_externo_id IS DISTINCT FROM v_aux.profissional_externo_id OR
     v_quota.profissional_interno_id IS DISTINCT FROM v_aux.profissional_interno_id OR
     v_quota.unidade_id IS DISTINCT FROM v_aux.unidade_id THEN
    RAISE EXCEPTION 'Cota vinculada divergente; solicite revisão ao Master';
  END IF;
  IF v_appt.status NOT IN ('pendente', 'confirmado', 'confirmado_chegada')
     OR v_aux.status = 'cancelado' THEN
    RAISE EXCEPTION 'Estado incompatível com cancelamento; solicite revisão ao Master';
  END IF;
  IF v_quota.vagas_usadas <= 0 THEN RAISE EXCEPTION 'Contador da cota divergente; solicite revisão ao Master'; END IF;

  PERFORM set_config('app.external_booking_rpc', 'cancel', true);
  UPDATE public.agendamentos SET status = 'cancelado' WHERE id = v_appt.id;
  UPDATE public.agendamentos_externos SET status = 'cancelado' WHERE id = v_aux.id;
  UPDATE public.quotas_externas SET vagas_usadas = vagas_usadas - 1 WHERE id = v_quota.id;
  INSERT INTO public.action_logs (user_id, user_nome, role, unidade_id, acao, entidade,
    entidade_id, modulo, agendamento_id, paciente_id, profissional_id, before, after, detalhes)
  VALUES (v_actor_id, v_actor_name, v_actor_role, v_quota.unidade_id,
    'cancelar_agendamento_externo', 'agendamento', v_appt.id, 'agenda', v_appt.id,
    v_appt.paciente_id, v_appt.profissional_id,
    jsonb_build_object('status', v_appt.status, 'vagas_usadas', v_quota.vagas_usadas),
    jsonb_build_object('status', 'cancelado', 'vagas_usadas', v_quota.vagas_usadas - 1),
    jsonb_build_object('cota_id', v_quota.id, 'profissional_externo_id', v_aux.profissional_externo_id,
      'motivo_alteracao', btrim(p_motivo)));
  RETURN jsonb_build_object('id', v_appt.id, 'already_cancelled', false);
END;
$$;

-- Search returns only the identity and contact fields needed to locate a patient.
-- Sensitive clinical data and free-form clinical notes are never exposed here.
CREATE OR REPLACE FUNCTION public.external_patient_search(p_query text, p_unidade_id text)
RETURNS TABLE (
  id text,
  nome text,
  cpf text,
  cns text,
  data_nascimento text,
  telefone text,
  email text,
  endereco text,
  nome_mae text,
  municipio text,
  can_edit boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_external_id uuid;
  v_query text := btrim(coalesce(p_query, ''));
  v_digits text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  SELECT pe.id INTO v_external_id
    FROM public.profissionais_externos pe
    WHERE pe.auth_user_id = auth.uid() AND pe.ativo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profissional externo inativo ou não encontrado'; END IF;
  IF coalesce(btrim(p_unidade_id), '') = '' OR NOT EXISTS (
    SELECT 1 FROM public.quotas_externas q
    JOIN public.unidades u ON u.id = q.unidade_id AND u.ativo = true
    WHERE q.profissional_externo_id = v_external_id
      AND q.unidade_id = p_unidade_id AND q.ativo = true
  ) THEN
    RAISE EXCEPTION 'Unidade sem cota ativa para este profissional';
  END IF;
  IF length(v_query) < 2 THEN RAISE EXCEPTION 'Informe ao menos dois caracteres para pesquisar'; END IF;
  v_digits := regexp_replace(v_query, '[^0-9]', '', 'g');

  RETURN QUERY
  SELECT p.id, p.nome, p.cpf, p.cns, p.data_nascimento, p.telefone,
    CASE WHEN (p.unidade_id = p_unidade_id OR EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.paciente_id = p.id AND a.unidade_id = p_unidade_id
    )) THEN p.email ELSE NULL END,
    CASE WHEN (p.unidade_id = p_unidade_id OR EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.paciente_id = p.id AND a.unidade_id = p_unidade_id
    )) THEN p.endereco ELSE NULL END,
    CASE WHEN (p.unidade_id = p_unidade_id OR EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.paciente_id = p.id AND a.unidade_id = p_unidade_id
    )) THEN p.nome_mae ELSE NULL END,
    CASE WHEN (p.unidade_id = p_unidade_id OR EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.paciente_id = p.id AND a.unidade_id = p_unidade_id
    )) THEN p.municipio ELSE NULL END,
    (p.unidade_id = p_unidade_id OR EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.paciente_id = p.id AND a.unidade_id = p_unidade_id
    )) AS can_edit
  FROM public.pacientes p
  WHERE p.nome ILIKE '%' || v_query || '%'
     OR (length(v_digits) >= 3 AND regexp_replace(coalesce(p.cpf, ''), '[^0-9]', '', 'g') LIKE '%' || v_digits || '%')
     OR (length(v_digits) >= 3 AND regexp_replace(coalesce(p.cns, ''), '[^0-9]', '', 'g') LIKE '%' || v_digits || '%')
  ORDER BY lower(p.nome), p.id
  LIMIT 20;
END;
$$;

-- New registrations are attributed to the selected active quota unit.
-- The external role cannot set clinical or administrative patient fields.
CREATE OR REPLACE FUNCTION public.external_create_patient(
  p_unidade_id text,
  p_nome text,
  p_cpf text DEFAULT NULL,
  p_cns text DEFAULT NULL,
  p_data_nascimento text DEFAULT NULL,
  p_telefone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_endereco text DEFAULT NULL,
  p_nome_mae text DEFAULT NULL,
  p_municipio text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    v_patient_id, btrim(p_nome), nullif(btrim(p_cpf), ''), nullif(btrim(p_cns), ''),
    nullif(btrim(p_data_nascimento), ''), nullif(btrim(p_telefone), ''),
    nullif(btrim(p_email), ''), nullif(btrim(p_endereco), ''),
    nullif(btrim(p_nome_mae), ''), nullif(btrim(p_municipio), ''), p_unidade_id
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
$$;

-- Updates are limited to demographic/contact fields and only patients linked to
-- the professional's active quota unit. Login email and clinical fields are immutable here.
CREATE OR REPLACE FUNCTION public.external_update_patient(
  p_paciente_id text,
  p_unidade_id text,
  p_nome text,
  p_cpf text DEFAULT NULL,
  p_cns text DEFAULT NULL,
  p_data_nascimento text DEFAULT NULL,
  p_telefone text DEFAULT NULL,
  p_endereco text DEFAULT NULL,
  p_nome_mae text DEFAULT NULL,
  p_municipio text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    cpf = nullif(btrim(p_cpf), ''),
    cns = nullif(btrim(p_cns), ''),
    data_nascimento = nullif(btrim(p_data_nascimento), ''),
    telefone = nullif(btrim(p_telefone), ''),
    endereco = nullif(btrim(p_endereco), ''),
    nome_mae = nullif(btrim(p_nome_mae), ''),
    municipio = nullif(btrim(p_municipio), '')
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
$$;

-- Receipt access is restricted to a patient's record on an appointment created
-- by the authenticated external professional.
CREATE OR REPLACE FUNCTION public.external_patient_receipt_details(p_agendamento_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_external_id uuid;
  v_details jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  SELECT pe.id INTO v_external_id
    FROM public.profissionais_externos pe
    WHERE pe.auth_user_id = auth.uid() AND pe.ativo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profissional externo inativo ou não encontrado'; END IF;

  SELECT jsonb_build_object('nome', p.nome, 'cpf', p.cpf, 'cns', p.cns)
    INTO v_details
  FROM public.agendamentos a
  JOIN public.pacientes p ON p.id = a.paciente_id
  WHERE a.id = p_agendamento_id
    AND a.origem = 'externo'
    AND a.agendado_por_externo = v_external_id::text;
  IF v_details IS NULL THEN RAISE EXCEPTION 'Agendamento não pertence a este profissional'; END IF;
  RETURN v_details;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_external_appointment(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.external_patient_search(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.external_create_patient(text, text, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.external_update_patient(text, text, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.external_patient_receipt_details(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_external_appointment(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.external_patient_search(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.external_create_patient(text, text, text, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.external_update_patient(text, text, text, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.external_patient_receipt_details(text) TO authenticated;
