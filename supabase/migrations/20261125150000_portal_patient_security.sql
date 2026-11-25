-- Portal do Paciente: autorização e cancelamento auditado. Nenhum dado é alterado pela migration.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_portal_patient_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_id text;
  v_count integer;
  v_config jsonb;
  v_flags jsonb;
  v_blocked boolean := false;
  v_active boolean := false;
  v_key text;
  v_perms jsonb := '{}'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('allowed',false,'portal_ativo',false,'paciente_bloqueado',false,'paciente_id',null,'permissoes','{}'::jsonb);
  END IF;
  SELECT count(*), min(id) INTO v_count, v_patient_id
    FROM public.pacientes WHERE auth_user_id = auth.uid();
  SELECT configuracoes->'portalPaciente' INTO v_config FROM public.system_config WHERE id = 'default';
  -- Ausência da configuração usa o padrão legado; valor inválido é negado.
  v_active := CASE WHEN v_config IS NULL OR v_config = 'null'::jsonb THEN true
    WHEN jsonb_typeof(v_config) <> 'object' THEN false
    WHEN NOT (v_config ? 'permitirPortal') THEN true
    ELSE v_config->'permitirPortal' = 'true'::jsonb END;
  IF v_config ? 'pacientesBloqueados' THEN
    IF jsonb_typeof(v_config->'pacientesBloqueados') = 'array' THEN
      v_blocked := coalesce((v_config->'pacientesBloqueados') @> jsonb_build_array(v_patient_id), false);
    ELSE
      v_active := false;
    END IF;
  END IF;
  v_flags := v_config->'permissoes';
  FOREACH v_key IN ARRAY ARRAY['verProximas','verHistorico','verFila','editarDados','cancelar','imprimirComprovante'] LOOP
    v_perms := v_perms || jsonb_build_object(v_key,
      CASE WHEN v_flags IS NULL OR v_flags = 'null'::jsonb THEN true
        WHEN jsonb_typeof(v_flags) <> 'object' THEN false
        WHEN NOT (v_flags ? v_key) THEN true
        ELSE v_flags->v_key = 'true'::jsonb END);
  END LOOP;
  RETURN jsonb_build_object('allowed',v_count = 1 AND v_active AND NOT v_blocked,
    'portal_ativo',v_active,'paciente_bloqueado',v_blocked,
    'paciente_id',CASE WHEN v_count = 1 THEN v_patient_id ELSE NULL END,'permissoes',v_perms);
END;
$$;
REVOKE ALL ON FUNCTION public.get_portal_patient_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_portal_patient_status() TO authenticated;

-- Mantém a lógica existente de cotas e dos funcionários, fechando apenas
-- o caminho de cancelamento direto pelo paciente quando o portal o proíbe.
CREATE OR REPLACE FUNCTION public.cancel_external_appointment(p_agendamento_id text, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF v_is_patient AND NOT coalesce((public.get_portal_patient_status()->>'allowed')::boolean AND (public.get_portal_patient_status()->'permissoes'->>'cancelar')::boolean, false) THEN
    RAISE EXCEPTION 'Cancelamento pelo portal desativado. Procure a unidade.';
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
$function$;

CREATE OR REPLACE FUNCTION public.cancel_portal_appointment(
  p_agendamento_id text,
  p_motivo text DEFAULT 'Cancelamento solicitado pelo próprio paciente no Portal'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access jsonb;
  v_patient public.pacientes%ROWTYPE;
  v_appt public.agendamentos%ROWTYPE;
  v_motivo text := btrim(coalesce(p_motivo, ''));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  IF length(v_motivo) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Informe um motivo válido'; END IF;
  v_access := public.get_portal_patient_status();
  IF NOT coalesce((v_access->>'allowed')::boolean AND (v_access->'permissoes'->>'cancelar')::boolean, false) THEN
    RAISE EXCEPTION 'Cancelamento pelo portal desativado. Procure a unidade.';
  END IF;
  SELECT * INTO v_patient FROM public.pacientes
    WHERE id = v_access->>'paciente_id' AND auth_user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Paciente não vinculado'; END IF;
  SELECT * INTO v_appt FROM public.agendamentos
    WHERE id = p_agendamento_id AND paciente_id = v_patient.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado ou não autorizado'; END IF;
  IF v_appt.status NOT IN ('pendente','confirmado') THEN
    RAISE EXCEPTION 'Somente consultas pendentes ou confirmadas podem ser canceladas antes da chegada';
  END IF;
  IF v_appt.origem = 'externo' THEN
    RETURN public.cancel_external_appointment(p_agendamento_id, v_motivo);
  END IF;
  UPDATE public.agendamentos SET status = 'cancelado',
    observacoes = concat_ws(E'\n',nullif(observacoes,''),v_motivo)
    WHERE id = v_appt.id;
  -- Em sessão de funcionário que também possui ficha de paciente, a RPC audita explicitamente.
  IF public.is_staff_member() THEN
    INSERT INTO public.action_logs (user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,
      modulo,origem,paciente_id,paciente_nome,agendamento_id,profissional_id,profissional_nome,before,after,detalhes)
    VALUES (v_patient.id,v_patient.nome,'paciente',v_appt.unidade_id,'cancelamento_portal','agendamentos',v_appt.id,
      'portal_paciente','portal_paciente',v_patient.id,v_patient.nome,v_appt.id,v_appt.profissional_id,v_appt.profissional_nome,
      jsonb_build_object('status',v_appt.status),jsonb_build_object('status','cancelado'),
      jsonb_build_object('data',v_appt.data,'hora',v_appt.hora,'profissional_nome',v_appt.profissional_nome,'motivo',v_motivo,'origem','portal_paciente'));
  END IF;
  RETURN jsonb_build_object('id',v_appt.id,'status','cancelado');
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_portal_appointment(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_portal_appointment(text,text) TO authenticated;

-- Compatibilidade segura com o frontend antigo (VPS com publicação manual).
-- A política legada permanece estritamente limitada pelo gatilho abaixo:
-- mesmo a chamada direta é validada e auditada atomicamente.
-- Após atualização de todos os clientes, a política pode ser removida em migration própria.
CREATE OR REPLACE FUNCTION public.guard_portal_patient_cancellation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_access jsonb;
  v_patient public.pacientes%ROWTYPE;
  v_motivo text;
  v_prefix text;
BEGIN
  IF auth.uid() IS NULL OR public.is_staff_member() THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pacientes WHERE auth_user_id = auth.uid()) THEN RETURN NEW; END IF;
  -- O fluxo externo mantém seu próprio guard e auditoria transacional.
  IF OLD.origem = 'externo' THEN RETURN NEW; END IF;
  v_access := public.get_portal_patient_status();
  IF NOT coalesce((v_access->>'allowed')::boolean AND (v_access->'permissoes'->>'cancelar')::boolean,false)
    OR OLD.paciente_id IS DISTINCT FROM v_access->>'paciente_id' THEN
    RAISE EXCEPTION 'Cancelamento não autorizado pelo portal';
  END IF;
  IF OLD.status NOT IN ('pendente','confirmado') OR NEW.status <> 'cancelado' THEN
    RAISE EXCEPTION 'Somente consultas pendentes ou confirmadas podem ser canceladas antes da chegada';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status','observacoes','atualizado_em']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','observacoes','atualizado_em']) THEN
    RAISE EXCEPTION 'O paciente só pode cancelar o próprio agendamento';
  END IF;
  v_prefix := CASE WHEN coalesce(OLD.observacoes,'') = '' THEN '' ELSE OLD.observacoes || E'\n' END;
  IF NEW.observacoes IS NOT DISTINCT FROM OLD.observacoes THEN
    v_motivo := 'Cancelamento solicitado pelo próprio paciente no Portal do Paciente';
  ELSIF left(NEW.observacoes,length(v_prefix)) = v_prefix THEN
    v_motivo := btrim(substr(NEW.observacoes,length(v_prefix)+1));
  END IF;
  IF v_motivo IS NULL OR length(v_motivo) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'Motivo de cancelamento inválido';
  END IF;
  SELECT * INTO STRICT v_patient FROM public.pacientes WHERE id = OLD.paciente_id AND auth_user_id = auth.uid();
  NEW.observacoes := v_prefix || v_motivo;
  INSERT INTO public.action_logs (user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,
    modulo,origem,paciente_id,paciente_nome,agendamento_id,profissional_id,profissional_nome,before,after,detalhes)
  VALUES (v_patient.id,v_patient.nome,'paciente',OLD.unidade_id,'cancelamento_portal','agendamentos',OLD.id,
    'portal_paciente','portal_paciente',v_patient.id,v_patient.nome,OLD.id,OLD.profissional_id,OLD.profissional_nome,
    jsonb_build_object('status',OLD.status),jsonb_build_object('status','cancelado'),
    jsonb_build_object('data',OLD.data,'hora',OLD.hora,'profissional_nome',OLD.profissional_nome,'motivo',v_motivo,'origem','portal_paciente'));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_portal_patient_cancellation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_portal_patient_cancel_guard ON public.agendamentos;
CREATE TRIGGER trg_portal_patient_cancel_guard BEFORE UPDATE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.guard_portal_patient_cancellation();

ALTER POLICY "Pacientes cancel own agendamentos" ON public.agendamentos
  USING (origem <> 'externo' AND paciente_id = (SELECT CASE WHEN (s->>'allowed')::boolean AND (s->'permissoes'->>'cancelar')::boolean THEN s->>'paciente_id' END FROM public.get_portal_patient_status() s))
  WITH CHECK (origem <> 'externo' AND status = 'cancelado' AND paciente_id = (SELECT CASE WHEN (s->>'allowed')::boolean AND (s->'permissoes'->>'cancelar')::boolean THEN s->>'paciente_id' END FROM public.get_portal_patient_status() s));
ALTER POLICY "Pacientes read own agendamentos" ON public.agendamentos
  USING (paciente_id = (SELECT CASE WHEN (s->>'allowed')::boolean THEN s->>'paciente_id' END FROM public.get_portal_patient_status() s));
ALTER POLICY "Pacientes read own data" ON public.pacientes
  USING (auth_user_id = (SELECT auth.uid()) AND id = (SELECT CASE WHEN (s->>'allowed')::boolean THEN s->>'paciente_id' END FROM public.get_portal_patient_status() s));
ALTER POLICY "Pacientes read own fila" ON public.fila_espera
  USING (paciente_id = (SELECT CASE WHEN (s->>'allowed')::boolean AND (s->'permissoes'->>'verFila')::boolean THEN s->>'paciente_id' END FROM public.get_portal_patient_status() s));
COMMIT;
