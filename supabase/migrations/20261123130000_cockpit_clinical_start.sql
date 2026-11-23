-- Persist only explicit starts. No historical backfill, new tables, columns or policies.
create or replace function public.start_clinical_attendance(
  p_agendamento_id text, p_patient_id text, p_room_id text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
  a public.agendamentos%rowtype;
  t public.atendimentos%rowtype;
  f public.fila_espera%rowtype;
  actor public.funcionarios%rowtype;
  v_room text;
  v_now timestamptz := statement_timestamp();
  v_hour text;
  v_before jsonb;
begin
  if auth.uid() is null or not public.is_staff_member() then
    raise exception 'Sessão não autorizada.' using errcode = '42501';
  end if;
  select * into actor from public.funcionarios where auth_user_id=auth.uid() and ativo is true;
  if not found then raise exception 'Funcionário ativo não encontrado.' using errcode='42501'; end if;
  select * into a from public.agendamentos where id=p_agendamento_id for update;
  if not found or (public.is_global_owner() or (
    actor.unidade_id=a.unidade_id and (lower(btrim(actor.role))='master'
      or (lower(btrim(actor.role))='profissional' and actor.id::text=a.profissional_id))
  )) is not true then raise exception 'Este atendimento está fora do seu escopo.' using errcode='42501'; end if;
  if a.paciente_id is distinct from p_patient_id then
    raise exception 'O paciente do agendamento mudou. Atualize a Agenda.' using errcode='23514';
  end if;
  if a.data > (v_now at time zone 'America/Sao_Paulo')::date then
    raise exception 'Não é possível iniciar atendimento antes da data agendada.' using errcode='23514';
  end if;
  select * into t from public.atendimentos where agendamento_id=a.id order by criado_em desc, id limit 1 for update;
  if found then
    if t.unidade_id is distinct from a.unidade_id or t.paciente_id is distinct from a.paciente_id
      or t.profissional_id is distinct from a.profissional_id or t.data is distinct from a.data then
      raise exception 'O atendimento vinculado diverge do agendamento.' using errcode='23514';
    end if;
    if a.status='em_atendimento' and t.status='em_atendimento' then
      return jsonb_build_object('status',a.status,'already_processed',true,'agendamento',to_jsonb(a),
        'hora_inicio',t.hora_inicio,'iniciado_em',a.iniciado_em,'atendimento_id',t.id);
    end if;
    raise exception 'Já existe um atendimento vinculado. Atualize a Agenda antes de continuar.' using errcode='23514';
  end if;
  if a.status not in ('apto_atendimento','aguardando_atendimento') then
    raise exception 'Este agendamento ainda não está liberado para iniciar atendimento.' using errcode='23514';
  end if;
  v_room := case when p_room_id is null then coalesce(a.sala_id,'') else btrim(p_room_id) end;
  if v_room<>'' and not exists(select 1 from public.salas where id=v_room and unidade_id=a.unidade_id and ativo is true) then
    raise exception 'Selecione uma sala ativa desta unidade.' using errcode='23514';
  end if;
  select * into f from public.fila_espera where id=a.id for update;
  if found and (f.unidade_id is distinct from a.unidade_id or f.paciente_id is distinct from a.paciente_id) then
    raise exception 'O vínculo da fila diverge do agendamento.' using errcode='23514';
  end if;
  v_before := jsonb_build_object('status',a.status,'sala_id',a.sala_id,'iniciado_em',a.iniciado_em);
  v_hour := to_char(v_now at time zone 'America/Sao_Paulo','HH24:MI');
  insert into public.atendimentos(id,agendamento_id,paciente_id,paciente_nome,profissional_id,profissional_nome,
    unidade_id,sala_id,setor,procedimento,observacoes,data,hora_inicio,hora_fim,status)
  values(gen_random_uuid(),a.id,a.paciente_id,a.paciente_nome,a.profissional_id,a.profissional_nome,
    a.unidade_id,v_room,coalesce(actor.setor,''),a.tipo,'',a.data,v_hour,'','em_atendimento') returning * into t;
  update public.agendamentos set status='em_atendimento',sala_id=v_room,iniciado_em=v_now where id=a.id returning * into a;
  if not found then raise exception 'Não foi possível iniciar o atendimento.' using errcode='40001'; end if;
  if f.id is not null then
    update public.fila_espera set status='em_atendimento' where id=f.id;
    if not found then raise exception 'Não foi possível atualizar a fila.' using errcode='40001'; end if;
  end if;
  insert into public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,
    agendamento_id,paciente_id,profissional_id,"before","after",detalhes)
  values(actor.id::text,actor.nome,actor.role,a.unidade_id,'atendimento_iniciado','atendimento',t.id::text,'atendimento',
    a.id,a.paciente_id,a.profissional_id,v_before,jsonb_build_object('status',a.status,'sala_id',v_room,'iniciado_em',v_now),
    jsonb_build_object('operacao_atomica',true,'local_confirmado',v_room<>''));
  return jsonb_build_object('status',a.status,'already_processed',false,'agendamento',to_jsonb(a),
    'hora_inicio',v_hour,'iniciado_em',v_now,'atendimento_id',t.id);
end;
$function$;
revoke all on function public.start_clinical_attendance(text,text,text) from public,anon;
grant execute on function public.start_clinical_attendance(text,text,text) to authenticated;

-- Keep the existing queue statuses/permissions; opening triage now also records its start.
create or replace function public.iniciar_triagem_atendimento(p_agendamento_id text,p_tecnico_id text,p_paciente_id_esperado text default null)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare a public.agendamentos%rowtype; f public.fila_espera%rowtype; v_actor jsonb; v_before jsonb; v_started boolean;
begin
  if auth.uid() is null then raise exception 'Sessão expirada. Entre novamente.' using errcode='42501'; end if;
  select * into a from public.agendamentos where id=p_agendamento_id for update;
  if not found then raise exception 'Agendamento não encontrado.' using errcode='23503'; end if;
  v_actor := public.assert_care_flow_actor(a.unidade_id,p_tecnico_id,'triagem');
  if p_paciente_id_esperado is not null and a.paciente_id is distinct from p_paciente_id_esperado then
    raise exception 'O paciente do agendamento mudou. Atualize a fila.' using errcode='23514'; end if;
  select * into f from public.fila_espera where id=a.id for update;
  if not found or f.unidade_id is distinct from a.unidade_id or f.paciente_id is distinct from a.paciente_id then
    raise exception 'Fila divergente. Peça à Recepção para sincronizar com a Triagem.' using errcode='23514'; end if;
  if exists(select 1 from public.triage_records where agendamento_id=a.id and confirmado_em is not null) then
    raise exception 'Esta triagem já foi concluída. Atualize a fila.' using errcode='23514'; end if;
  if a.status not in ('confirmado_chegada','chegada_confirmada','aguardando_triagem') or f.status not in ('confirmado_chegada','chegada_confirmada','aguardando_triagem') then
    raise exception 'O paciente já avançou no atendimento. Atualize a fila.' using errcode='23514'; end if;
  v_started := exists(select 1 from public.triage_records where agendamento_id=a.id and iniciado_em is not null);
  if v_started and a.status='aguardando_triagem' and f.status='aguardando_triagem' then
    return jsonb_build_object('already_processed',true,'status',a.status,'agendamento',to_jsonb(a),'fila',to_jsonb(f)); end if;
  v_before := jsonb_build_object('agendamento_status',a.status,'fila_status',f.status);
  insert into public.triage_records(agendamento_id,tecnico_id,iniciado_em) values(a.id,p_tecnico_id,statement_timestamp())
  on conflict(agendamento_id) do update set iniciado_em=coalesce(public.triage_records.iniciado_em,excluded.iniciado_em);
  update public.agendamentos set status='aguardando_triagem' where id=a.id returning * into a;
  update public.fila_espera set status='aguardando_triagem' where id=a.id returning * into f;
  insert into public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,agendamento_id,paciente_id,profissional_id,"before","after",detalhes)
  values(v_actor->>'id',v_actor->>'nome',v_actor->>'role',a.unidade_id,'iniciar_triagem','agendamento',a.id,'triagem',a.id,a.paciente_id,a.profissional_id,
    v_before,jsonb_build_object('agendamento_status',a.status,'fila_status',f.status),jsonb_build_object('operacao_atomica',true,'inicio_registrado',true));
  return jsonb_build_object('already_processed',false,'status',a.status,'agendamento',to_jsonb(a),'fila',to_jsonb(f));
end;
$function$;
revoke all on function public.iniciar_triagem_atendimento(text,text,text) from public,anon;
grant execute on function public.iniciar_triagem_atendimento(text,text,text) to authenticated;
notify pgrst,'reload schema';
