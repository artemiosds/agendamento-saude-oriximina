create or replace function public.complete_clinical_attendance(
  p_agendamento_id text,
  p_hora_fim text,
  p_duracao_minutos integer,
  p_unidade_id text,
  p_profissional_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_agendamento public.agendamentos%rowtype;
  v_atendimento public.atendimentos%rowtype;
  v_atendimentos_abertos uuid[] := array[]::uuid[];
  v_tem_atendimento_finalizado boolean := false;
  v_hora_fim text;
  v_duracao_minutos integer;
  v_sessao public.treatment_sessions%rowtype;
  v_sessoes_pendentes uuid[] := array[]::uuid[];
  v_tem_sessao_realizada boolean := false;
  v_linhas integer;
begin
  if auth.uid() is null or not public.is_staff_member() then
    raise exception 'Acesso à finalização não autorizado.' using errcode = '42501';
  end if;

  if nullif(btrim(p_agendamento_id), '') is null
    or nullif(btrim(p_unidade_id), '') is null
    or nullif(btrim(p_profissional_id), '') is null
    or p_hora_fim is null or p_hora_fim !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Dados da finalização inválidos.' using errcode = '22023';
  end if;

  -- The appointment lock serializes competing completions and requests retried after a lost response.
  select a.* into v_agendamento
  from public.agendamentos a
  where a.id = p_agendamento_id
    and a.unidade_id = p_unidade_id
    and a.profissional_id = p_profissional_id
    and (
      public.is_global_owner() or exists (
        select 1
        from public.funcionarios f
        where f.auth_user_id = auth.uid()
          and f.ativo is true
          and f.unidade_id = a.unidade_id
          and (f.id::text = a.profissional_id or lower(btrim(f.role)) = 'master')
      )
    )
  for update of a;
  if not found then
    raise exception 'Acesso à finalização deste agendamento não autorizado.' using errcode = '42501';
  end if;

  for v_atendimento in
    select t.* from public.atendimentos t
    where t.agendamento_id = v_agendamento.id
    order by t.id
    for update
  loop
    if v_atendimento.unidade_id is distinct from v_agendamento.unidade_id
      or v_atendimento.profissional_id is distinct from v_agendamento.profissional_id
      or v_atendimento.paciente_id is distinct from v_agendamento.paciente_id
      or v_atendimento.status is null
      or v_atendimento.status not in ('em_atendimento', 'finalizado') then
      raise exception 'O atendimento vinculado diverge do agendamento.' using errcode = '23514';
    end if;
    if v_atendimento.status = 'em_atendimento' then
      v_atendimentos_abertos := array_append(v_atendimentos_abertos, v_atendimento.id);
    else
      v_tem_atendimento_finalizado := true;
      v_hora_fim := v_atendimento.hora_fim;
      v_duracao_minutos := v_atendimento.duracao_minutos;
    end if;
  end loop;

  if cardinality(v_atendimentos_abertos) = 0 and not v_tem_atendimento_finalizado then
    raise exception 'Nenhum atendimento iniciado foi encontrado.' using errcode = '23514';
  end if;

  if v_agendamento.status is null
    or (v_agendamento.status not in ('em_atendimento', 'concluido')
      and not (v_agendamento.status = 'apto_atendimento' and v_tem_atendimento_finalizado)) then
    raise exception 'O agendamento não está apto para esta finalização.' using errcode = '23514';
  end if;

  if v_agendamento.status = 'concluido' and cardinality(v_atendimentos_abertos) = 0 then
    return jsonb_build_object('status', 'concluido', 'hora_fim', v_hora_fim, 'duracao_minutos', v_duracao_minutos);
  end if;

  -- Old duplicate links may point at other dates. Consider only sessions matching this visit.
  for v_sessao in
    select s.* from public.treatment_sessions s
    where s.appointment_id = v_agendamento.id
      and s.patient_id = v_agendamento.paciente_id
      and s.professional_id = v_agendamento.profissional_id
      and s.scheduled_date = v_agendamento.data
      and s.status in ('agendada', 'pendente_agendamento', 'realizada')
    order by s.id
    for update
  loop
    if v_sessao.status = 'realizada' then
      v_tem_sessao_realizada := true;
    else
      v_sessoes_pendentes := array_append(v_sessoes_pendentes, v_sessao.id);
    end if;
  end loop;
  if not v_tem_sessao_realizada and cardinality(v_sessoes_pendentes) > 1 then
    raise exception 'Mais de uma sessão corresponde a este atendimento.' using errcode = '23514';
  end if;

  if cardinality(v_atendimentos_abertos) > 0 then
    v_hora_fim := p_hora_fim;
    v_duracao_minutos := greatest(0, p_duracao_minutos);
    update public.atendimentos
    set hora_fim = v_hora_fim,
        duracao_minutos = v_duracao_minutos,
        status = 'finalizado'
    where id = any(v_atendimentos_abertos);
    get diagnostics v_linhas = row_count;
    if v_linhas <> cardinality(v_atendimentos_abertos) then
      raise exception 'Não foi possível concluir todos os registros do atendimento.' using errcode = '40001';
    end if;
  end if;

  if v_agendamento.status <> 'concluido' then
    update public.agendamentos
    set status = 'concluido',
        concluido_em = coalesce(concluido_em, statement_timestamp())
    where id = v_agendamento.id;
    if not found then
      raise exception 'Não foi possível concluir o agendamento.' using errcode = '40001';
    end if;
  end if;

  if not v_tem_sessao_realizada and cardinality(v_sessoes_pendentes) = 1 then
    update public.treatment_sessions
    set status = 'realizada'
    where id = v_sessoes_pendentes[1];
    if not found then
      raise exception 'Não foi possível registrar a realização da sessão.' using errcode = '40001';
    end if;
  end if;

  return jsonb_build_object('status', 'concluido', 'hora_fim', v_hora_fim, 'duracao_minutos', v_duracao_minutos);
end;
$function$;

revoke all on function public.complete_clinical_attendance(text, text, integer, text, text) from public, anon;
grant execute on function public.complete_clinical_attendance(text, text, integer, text, text) to authenticated;
