-- Atomic reception/triage operations. No historical reconciliation or new tables.
BEGIN;

-- Called only from the guarded RPCs below. Identity always comes from auth.uid().
CREATE FUNCTION public.assert_care_flow_actor(p_unit text, p_actor text, p_module text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_staff public.funcionarios%ROWTYPE; v_role text; v_permission boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão expirada. Entre novamente.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_staff FROM public.funcionarios WHERE auth_user_id=auth.uid() AND ativo IS TRUE;
  IF NOT FOUND OR v_staff.id::text IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'Usuário não autorizado para esta operação.' USING ERRCODE='42501';
  END IF;
  IF nullif(p_unit,'') IS NULL OR (v_staff.usuario IS DISTINCT FROM 'admin.sms' AND (nullif(v_staff.unidade_id,'') IS NULL OR v_staff.unidade_id IS DISTINCT FROM p_unit)) THEN
    RAISE EXCEPTION 'Operação fora da sua unidade.' USING ERRCODE='42501';
  END IF;
  v_role := lower(btrim(v_staff.role));
  v_role := CASE v_role WHEN 'gestão' THEN 'gestao' WHEN 'gestor' THEN 'gestao' WHEN 'coordenacao' THEN 'gestao' WHEN 'coordenador' THEN 'gestao' WHEN 'recepção' THEN 'recepcao' WHEN 'tecnico' THEN 'triagem' WHEN 'tecnico_enfermagem' THEN 'enfermagem' ELSE v_role END;
  IF nullif(v_role,'') IS NULL THEN RAISE EXCEPTION 'Perfil não identificado.' USING ERRCODE='42501'; END IF;
  IF v_role <> 'master' THEN
    SELECT allowed INTO v_permission FROM (
      SELECT pu.can_execute AS allowed, 1 AS rank FROM public.permissoes_usuario pu WHERE pu.user_id=v_staff.id::text AND pu.modulo=p_module AND pu.unidade_id=v_staff.unidade_id AND coalesce(v_staff.unidade_id,'')<>''
      UNION ALL SELECT pu.can_execute,2 FROM public.permissoes_usuario pu WHERE pu.user_id=v_staff.id::text AND pu.modulo=p_module AND pu.unidade_id=''
      UNION ALL SELECT p.can_execute,3 FROM public.permissoes p WHERE p.perfil IN (v_role,lower(btrim(v_staff.role))) AND p.modulo=p_module AND p.unidade_id=v_staff.unidade_id AND coalesce(v_staff.unidade_id,'')<>''
      UNION ALL SELECT p.can_execute,4 FROM public.permissoes p WHERE p.perfil IN (v_role,lower(btrim(v_staff.role))) AND p.modulo=p_module AND p.unidade_id=''
    ) permissions ORDER BY rank LIMIT 1;
    -- Same defaults used by PermissionsContext when no override/profile row exists.
    IF NOT FOUND THEN
      v_permission := (p_module='agenda' AND v_role IN ('recepcao','gestao','profissional')) OR (p_module='triagem' AND v_role IN ('triagem','enfermagem','gestao'));
    END IF;
    IF v_permission IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Sem permissão para executar esta ação.' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN to_jsonb(v_staff) || jsonb_build_object('normalized_role',v_role);
END $$;
REVOKE ALL ON FUNCTION public.assert_care_flow_actor(text,text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.confirmar_chegada_atendimento(
 p_agendamento_id text, p_usuario_id text, p_usuario_nome text, p_unidade_id text,
 p_hora_chegada text, p_reconciliar boolean DEFAULT false, p_paciente_id_esperado text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.agendamentos%ROWTYPE; f public.fila_espera%ROWTYPE; v_actor jsonb;
 v_enabled boolean := false; v_status text; v_queue_status text; v_previous text; v_before_queue jsonb; v_hour text;
BEGIN
  v_actor := public.assert_care_flow_actor(p_unidade_id,p_usuario_id,'agenda');
  SELECT * INTO a FROM public.agendamentos WHERE id=p_agendamento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado. Atualize a Agenda.' USING ERRCODE='23503'; END IF;
  IF a.unidade_id IS DISTINCT FROM p_unidade_id OR (v_actor->>'normalized_role'='profissional' AND a.profissional_id IS DISTINCT FROM p_usuario_id) THEN
    RAISE EXCEPTION 'Agendamento fora do seu escopo.' USING ERRCODE='42501';
  END IF;
  IF p_paciente_id_esperado IS NOT NULL AND a.paciente_id IS DISTINCT FROM p_paciente_id_esperado THEN
    RAISE EXCEPTION 'O paciente do agendamento mudou. Atualize a Agenda antes de confirmar a chegada.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO f FROM public.fila_espera WHERE id=a.id FOR UPDATE;
  v_before_queue := CASE WHEN FOUND THEN to_jsonb(f) ELSE NULL END;
  IF f.id IS NOT NULL AND (f.unidade_id IS DISTINCT FROM a.unidade_id OR f.paciente_id IS DISTINCT FROM a.paciente_id) THEN
    RAISE EXCEPTION 'A fila possui um vínculo divergente. Solicite revisão.' USING ERRCODE='23514';
  END IF;
  IF p_reconciliar THEN
    IF v_actor->>'normalized_role' NOT IN ('recepcao','master') THEN RAISE EXCEPTION 'Somente Recepção ou Master pode sincronizar a triagem.' USING ERRCODE='42501'; END IF;
    IF a.data IS DISTINCT FROM (now() AT TIME ZONE 'America/Sao_Paulo')::date OR a.status NOT IN ('confirmado_chegada','chegada_confirmada','aguardando_triagem') THEN
      RAISE EXCEPTION 'A sincronização é permitida apenas para chegadas pendentes de triagem de hoje.' USING ERRCODE='23514';
    END IF;
    IF f.id IS NOT NULL AND f.status <> 'excluido_da_fila_triagem' THEN
      RETURN jsonb_build_object('already_processed',true,'reconciled',false,'status',a.status,'agendamento',to_jsonb(a),'fila',to_jsonb(f));
    END IF;
    IF EXISTS(SELECT 1 FROM public.triage_records WHERE agendamento_id=a.id AND confirmado_em IS NOT NULL) THEN
      RAISE EXCEPTION 'A triagem já foi concluída. Solicite revisão do atendimento.' USING ERRCODE='23514';
    END IF;
  ELSIF a.status IN ('confirmado_chegada','chegada_confirmada','aguardando_triagem','triagem_concluida','aguardando_enfermagem','aguardando_atendimento','apto_atendimento','chamado','em_atendimento','concluido','finalizado','atendido','atendimento_encerrado','prontuario_finalizado') OR EXISTS(SELECT 1 FROM public.triage_records WHERE agendamento_id=a.id AND confirmado_em IS NOT NULL) THEN
    RETURN jsonb_build_object('already_processed',true,'reconciled',false,'status',a.status,'agendamento',to_jsonb(a),'fila',v_before_queue);
  ELSIF a.status NOT IN ('pendente','confirmado','confirmada','agendado','atraso','falta') THEN
    RAISE EXCEPTION 'Este agendamento não permite confirmação de chegada.' USING ERRCODE='23514';
  END IF;
  IF f.id IS NOT NULL AND f.status IN ('apto_atendimento','aguardando_enfermagem','aguardando_atendimento','em_atendimento','concluido','atendido') THEN
    RAISE EXCEPTION 'O paciente já avançou na fila. Atualize a Agenda antes de continuar.' USING ERRCODE='23514';
  END IF;
  -- Professional override wins, including enabled=false. Global configuration is fallback only.
  SELECT enabled INTO v_enabled FROM public.triage_settings WHERE profissional_id=a.profissional_id AND (unidade_id=a.unidade_id OR nullif(unidade_id,'') IS NULL)
    ORDER BY (unidade_id=a.unidade_id) DESC NULLS LAST,updated_at DESC NULLS LAST,id LIMIT 1;
  IF NOT FOUND THEN
    SELECT enabled INTO v_enabled FROM public.triage_settings WHERE profissional_id IS NULL AND (unidade_id=a.unidade_id OR nullif(unidade_id,'') IS NULL)
      ORDER BY (unidade_id=a.unidade_id) DESC NULLS LAST,updated_at DESC NULLS LAST,id LIMIT 1;
  END IF;
  v_enabled := coalesce(v_enabled,false);
  v_previous := a.status;
  v_status := CASE WHEN v_enabled THEN 'confirmado_chegada' ELSE 'apto_atendimento' END;
  v_queue_status := CASE WHEN v_enabled THEN 'chegada_confirmada' ELSE 'apto_atendimento' END;
  v_hour := coalesce(nullif(f.hora_chegada,''),nullif(p_hora_chegada,''),to_char(now() AT TIME ZONE 'America/Sao_Paulo','HH24:MI'));
  IF v_hour !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'Horário de chegada inválido.' USING ERRCODE='23514'; END IF;
  UPDATE public.agendamentos SET status=v_status WHERE id=a.id RETURNING * INTO a;
  INSERT INTO public.fila_espera(id,paciente_id,paciente_nome,unidade_id,profissional_id,status,hora_chegada,observacoes,prioridade_perfil,posicao,criado_por)
    VALUES(a.id,a.paciente_id,a.paciente_nome,a.unidade_id,a.profissional_id,v_queue_status,v_hour,a.observacoes,a.prioridade_perfil,
      coalesce((SELECT max(posicao)+1 FROM public.fila_espera WHERE unidade_id=a.unidade_id),1),v_actor->>'nome')
    ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,profissional_id=EXCLUDED.profissional_id,hora_chegada=EXCLUDED.hora_chegada,observacoes=EXCLUDED.observacoes
    WHERE public.fila_espera.paciente_id=EXCLUDED.paciente_id AND public.fila_espera.unidade_id=EXCLUDED.unidade_id
      AND public.fila_espera.status NOT IN ('apto_atendimento','aguardando_enfermagem','aguardando_atendimento','em_atendimento','concluido','atendido')
    RETURNING * INTO f;
  IF NOT FOUND THEN RAISE EXCEPTION 'A fila foi alterada por outro terminal. Atualize antes de continuar.' USING ERRCODE='23514'; END IF;
  IF v_enabled AND NOT p_reconciliar THEN
    -- Reset only this patient's counters in this unit. Do not run the legacy helper,
    -- which also changes unrelated historical BLOQUEIO_FALTA queue rows.
    UPDATE public.pacientes SET total_faltas=0,faltas_consecutivas=0,status_falta='REGULAR'
      WHERE id=a.paciente_id AND unidade_id=a.unidade_id;
  END IF;
  INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,agendamento_id,paciente_id,profissional_id,"before","after",detalhes)
    VALUES(v_actor->>'id',v_actor->>'nome',v_actor->>'role',a.unidade_id,
      CASE WHEN p_reconciliar THEN 'sincronizar_triagem' ELSE 'confirmar_chegada' END,'agendamento',a.id,'agenda',a.id,a.paciente_id,a.profissional_id,
      jsonb_build_object('status',v_previous,'fila',v_before_queue),jsonb_build_object('status',a.status,'fila',to_jsonb(f)),
      jsonb_build_object('triagem_habilitada',v_enabled,'hora_chegada',v_hour,'motivo',CASE WHEN p_reconciliar THEN 'Correção manual de chegada de hoje sem fila ativa de triagem' ELSE 'Confirmação de chegada' END));
  RETURN jsonb_build_object('already_processed',false,'reconciled',p_reconciliar,'status',a.status,'agendamento',to_jsonb(a),'fila',to_jsonb(f));
END $$;
REVOKE ALL ON FUNCTION public.confirmar_chegada_atendimento(text,text,text,text,text,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirmar_chegada_atendimento(text,text,text,text,text,boolean,text) TO authenticated;

-- Validate before assignment to constrained numeric columns. No implicit grams conversion.
CREATE FUNCTION public.validar_sinais_triagem(p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_key text; v_raw text; v numeric; v_min numeric; v_max numeric; v_values jsonb := '{}'; v_imc numeric;
BEGIN
  IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Dados de triagem inválidos.' USING ERRCODE='23514'; END IF;
  FOREACH v_key IN ARRAY ARRAY['peso','altura','temperatura','frequencia_cardiaca','saturacao_oxigenio','glicemia'] LOOP
    v_raw := nullif(btrim(p_data->>v_key),'');
    IF v_raw IS NULL THEN v_values := v_values || jsonb_build_object(v_key,NULL); CONTINUE; END IF;
    IF length(v_raw)>32 OR replace(v_raw,',','.') !~ '^[0-9]+([.][0-9]+)?$' THEN RAISE EXCEPTION 'Valor inválido no campo %.',v_key USING ERRCODE='23514'; END IF;
    v := replace(v_raw,',','.')::numeric;
    v_min := CASE v_key WHEN 'peso' THEN 0.5 WHEN 'altura' THEN 20 ELSE 0 END;
    v_max := CASE v_key WHEN 'peso' THEN 400 WHEN 'altura' THEN 260 WHEN 'temperatura' THEN 60 WHEN 'frequencia_cardiaca' THEN 350 WHEN 'saturacao_oxigenio' THEN 100 ELSE 9999.99 END;
    IF v<v_min OR v>v_max OR (v_key IN ('frequencia_cardiaca','saturacao_oxigenio') AND trunc(v)<>v) THEN
      RAISE EXCEPTION 'Valor inválido no campo %. Informe entre % e %.',v_key,v_min,v_max USING ERRCODE='23514';
    END IF;
    v_values := v_values || jsonb_build_object(v_key,v);
  END LOOP;
  IF v_values->>'peso' IS NOT NULL AND v_values->>'altura' IS NOT NULL THEN
    v_imc := round((v_values->>'peso')::numeric / power((v_values->>'altura')::numeric/100,2),2);
    IF v_imc>999.99 THEN RAISE EXCEPTION 'Confira peso e altura: o IMC calculado excede o limite suportado.' USING ERRCODE='23514'; END IF;
  END IF;
  IF length(coalesce(p_data->>'pressao_arterial',''))>20 THEN RAISE EXCEPTION 'Pressão arterial inválida. Use o formato 120/80.' USING ERRCODE='23514'; END IF;
  IF p_data ? 'custom_data' AND jsonb_typeof(p_data->'custom_data') <> 'object' THEN RAISE EXCEPTION 'Campos adicionais de triagem inválidos.' USING ERRCODE='23514'; END IF;
  FOREACH v_key IN ARRAY ARRAY['alergias','medicamentos'] LOOP
    IF p_data ? v_key AND (jsonb_typeof(p_data->v_key) <> 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_data->v_key)='array' THEN p_data->v_key ELSE '[]' END) e WHERE jsonb_typeof(e)<>'string')) THEN
      RAISE EXCEPTION 'Lista de % inválida.',v_key USING ERRCODE='23514';
    END IF;
  END LOOP;
  RETURN p_data || v_values || jsonb_build_object('imc',v_imc);
END $$;
REVOKE ALL ON FUNCTION public.validar_sinais_triagem(jsonb) FROM PUBLIC,anon,authenticated;

-- Shared implementation also protects drafts against overwriting a concurrently confirmed chart.
CREATE FUNCTION public.gravar_triagem_atendimento(p_agendamento_id text,p_tecnico_id text,p_dados jsonb,p_confirmar boolean,p_enfermagem boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.agendamentos%ROWTYPE; f public.fila_espera%ROWTYPE; t public.triage_records%ROWTYPE;
 v_actor jsonb; d jsonb; v_status text; v_before jsonb; v_before_fila jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão expirada. Entre novamente.' USING ERRCODE='42501'; END IF;
  SELECT * INTO a FROM public.agendamentos WHERE id=p_agendamento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado. Atualize a fila.' USING ERRCODE='23503'; END IF;
  v_actor := public.assert_care_flow_actor(a.unidade_id,p_tecnico_id,'triagem');
  IF p_dados ? 'paciente_id_esperado' AND a.paciente_id IS DISTINCT FROM p_dados->>'paciente_id_esperado' THEN RAISE EXCEPTION 'O paciente do agendamento mudou. Atualize a fila antes de continuar.' USING ERRCODE='23514'; END IF;
  SELECT * INTO f FROM public.fila_espera WHERE id=a.id FOR UPDATE;
  IF NOT FOUND OR f.unidade_id IS DISTINCT FROM a.unidade_id OR f.paciente_id IS DISTINCT FROM a.paciente_id THEN
    RAISE EXCEPTION 'A fila não corresponde a este agendamento. Peça à Recepção para sincronizar com a Triagem.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO t FROM public.triage_records WHERE agendamento_id=a.id FOR UPDATE;
  IF t.confirmado_em IS NOT NULL THEN
    IF p_confirmar THEN RETURN jsonb_build_object('already_processed',true,'status',a.status,'triage_id',t.id,'agendamento',to_jsonb(a),'fila',to_jsonb(f)); END IF;
    RAISE EXCEPTION 'Esta triagem já foi concluída. O rascunho não pode substituí-la.' USING ERRCODE='23514';
  END IF;
  IF a.status NOT IN ('confirmado_chegada','chegada_confirmada','aguardando_triagem') OR f.status NOT IN ('confirmado_chegada','chegada_confirmada','aguardando_triagem') THEN
    RAISE EXCEPTION 'O paciente não está aguardando triagem. Atualize a fila.' USING ERRCODE='23514';
  END IF;
  d := public.validar_sinais_triagem(p_dados);
  v_before := jsonb_build_object('agendamento_status',a.status,'triagem',to_jsonb(t));
  v_before_fila := to_jsonb(f);
  INSERT INTO public.triage_records(agendamento_id,tecnico_id,peso,altura,imc,pressao_arterial,temperatura,frequencia_cardiaca,saturacao_oxigenio,glicemia,alergias,medicamentos,queixa,classificacao_risco,observacoes,custom_data,iniciado_em,confirmado_em)
    VALUES(a.id,p_tecnico_id,(d->>'peso')::numeric,(d->>'altura')::numeric,(d->>'imc')::numeric,nullif(d->>'pressao_arterial',''),(d->>'temperatura')::numeric,(d->>'frequencia_cardiaca')::numeric::integer,(d->>'saturacao_oxigenio')::numeric::integer,(d->>'glicemia')::numeric,
      ARRAY(SELECT jsonb_array_elements_text(coalesce(d->'alergias','[]'))),ARRAY(SELECT jsonb_array_elements_text(coalesce(d->'medicamentos','[]'))),nullif(d->>'queixa',''),coalesce(d->>'classificacao_risco',''),coalesce(d->>'observacoes',''),coalesce(d->'custom_data','{}'),coalesce(t.iniciado_em,now()),CASE WHEN p_confirmar THEN now() ELSE NULL END)
    ON CONFLICT(agendamento_id) DO UPDATE SET tecnico_id=EXCLUDED.tecnico_id,peso=EXCLUDED.peso,altura=EXCLUDED.altura,imc=EXCLUDED.imc,pressao_arterial=EXCLUDED.pressao_arterial,temperatura=EXCLUDED.temperatura,frequencia_cardiaca=EXCLUDED.frequencia_cardiaca,saturacao_oxigenio=EXCLUDED.saturacao_oxigenio,glicemia=EXCLUDED.glicemia,alergias=EXCLUDED.alergias,medicamentos=EXCLUDED.medicamentos,queixa=EXCLUDED.queixa,classificacao_risco=EXCLUDED.classificacao_risco,observacoes=EXCLUDED.observacoes,custom_data=EXCLUDED.custom_data,confirmado_em=EXCLUDED.confirmado_em
    RETURNING * INTO t;
  IF p_confirmar THEN
    v_status := CASE WHEN p_enfermagem THEN 'aguardando_enfermagem' ELSE 'apto_atendimento' END;
    UPDATE public.agendamentos SET status=v_status WHERE id=a.id RETURNING * INTO a;
    UPDATE public.fila_espera SET status=v_status WHERE id=a.id RETURNING * INTO f;
  END IF;
  INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,agendamento_id,paciente_id,profissional_id,"before","after",detalhes)
    VALUES(v_actor->>'id',v_actor->>'nome',v_actor->>'role',a.unidade_id,CASE WHEN p_confirmar THEN 'finalizar_triagem' ELSE 'salvar_rascunho_triagem' END,'agendamento',a.id,'triagem',a.id,a.paciente_id,a.profissional_id,
      v_before || jsonb_build_object('fila',v_before_fila),jsonb_build_object('agendamento_status',a.status,'fila',to_jsonb(f),'triagem',to_jsonb(t)),jsonb_build_object('triage_id',t.id,'encaminhamento',CASE WHEN p_enfermagem THEN 'enfermagem' ELSE 'direto' END,'operacao_atomica',true));
  RETURN jsonb_build_object('already_processed',false,'status',a.status,'triage_id',t.id,'agendamento',to_jsonb(a),'fila',to_jsonb(f));
END $$;
REVOKE ALL ON FUNCTION public.gravar_triagem_atendimento(text,text,jsonb,boolean,boolean) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.concluir_triagem_atendimento(p_agendamento_id text,p_tecnico_id text,p_dados_triagem jsonb,p_encaminhar_enfermagem boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
 SELECT public.gravar_triagem_atendimento(p_agendamento_id,p_tecnico_id,p_dados_triagem,true,p_encaminhar_enfermagem);
$$;
REVOKE ALL ON FUNCTION public.concluir_triagem_atendimento(text,text,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.concluir_triagem_atendimento(text,text,jsonb,boolean) TO authenticated;
CREATE FUNCTION public.salvar_rascunho_triagem_atendimento(p_agendamento_id text,p_tecnico_id text,p_dados_triagem jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
 SELECT public.gravar_triagem_atendimento(p_agendamento_id,p_tecnico_id,p_dados_triagem,false,false);
$$;
REVOKE ALL ON FUNCTION public.salvar_rascunho_triagem_atendimento(text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.salvar_rascunho_triagem_atendimento(text,text,jsonb) TO authenticated;

-- Starting triage follows the same lock order as completion: appointment, queue, chart.
CREATE FUNCTION public.iniciar_triagem_atendimento(p_agendamento_id text,p_tecnico_id text,p_paciente_id_esperado text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.agendamentos%ROWTYPE; f public.fila_espera%ROWTYPE; v_actor jsonb; v_before jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão expirada. Entre novamente.' USING ERRCODE='42501'; END IF;
  SELECT * INTO a FROM public.agendamentos WHERE id=p_agendamento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado.' USING ERRCODE='23503'; END IF;
  v_actor := public.assert_care_flow_actor(a.unidade_id,p_tecnico_id,'triagem');
  IF p_paciente_id_esperado IS NOT NULL AND a.paciente_id IS DISTINCT FROM p_paciente_id_esperado THEN RAISE EXCEPTION 'O paciente do agendamento mudou. Atualize a fila antes de continuar.' USING ERRCODE='23514'; END IF;
  SELECT * INTO f FROM public.fila_espera WHERE id=a.id FOR UPDATE;
  IF NOT FOUND OR f.unidade_id IS DISTINCT FROM a.unidade_id OR f.paciente_id IS DISTINCT FROM a.paciente_id THEN
    RAISE EXCEPTION 'Fila divergente. Peça à Recepção para sincronizar com a Triagem.' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.triage_records WHERE agendamento_id=a.id AND confirmado_em IS NOT NULL) THEN
    RAISE EXCEPTION 'Esta triagem já foi concluída. Atualize a fila.' USING ERRCODE='23514';
  END IF;
  IF a.status NOT IN ('confirmado_chegada','chegada_confirmada','aguardando_triagem') OR f.status NOT IN ('confirmado_chegada','chegada_confirmada','aguardando_triagem') THEN
    RAISE EXCEPTION 'O paciente já avançou no atendimento. Atualize a fila.' USING ERRCODE='23514';
  END IF;
  IF a.status='aguardando_triagem' AND f.status='aguardando_triagem' THEN
    RETURN jsonb_build_object('already_processed',true,'status',a.status,'agendamento',to_jsonb(a),'fila',to_jsonb(f));
  END IF;
  v_before := jsonb_build_object('agendamento_status',a.status,'fila_status',f.status);
  UPDATE public.agendamentos SET status='aguardando_triagem' WHERE id=a.id RETURNING * INTO a;
  UPDATE public.fila_espera SET status='aguardando_triagem' WHERE id=a.id RETURNING * INTO f;
  INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,agendamento_id,paciente_id,profissional_id,"before","after",detalhes)
    VALUES(v_actor->>'id',v_actor->>'nome',v_actor->>'role',a.unidade_id,'iniciar_triagem','agendamento',a.id,'triagem',a.id,a.paciente_id,a.profissional_id,v_before,jsonb_build_object('agendamento_status',a.status,'fila_status',f.status),jsonb_build_object('operacao_atomica',true));
  RETURN jsonb_build_object('already_processed',false,'status',a.status,'agendamento',to_jsonb(a),'fila',to_jsonb(f));
END $$;
REVOKE ALL ON FUNCTION public.iniciar_triagem_atendimento(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.iniciar_triagem_atendimento(text,text,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
