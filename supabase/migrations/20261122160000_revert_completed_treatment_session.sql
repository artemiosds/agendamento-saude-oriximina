create or replace function public.revert_completed_treatment_session(
  p_session_id uuid,
  p_justificativa text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_actor record;
  v_session public.treatment_sessions%rowtype;
  v_cycle public.treatment_cycles%rowtype;
  v_justificativa text := regexp_replace(p_justificativa, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_new_sessions_done integer;
begin
  if auth.uid() is null or not public.is_staff_member() then
    raise exception 'Acesso não autorizado.' using errcode = '42501';
  end if;

  if p_session_id is null or nullif(v_justificativa, '') is null then
    raise exception 'Informe a sessão e a justificativa clínica.' using errcode = '22023';
  end if;

  select f.id, f.nome, f.usuario, lower(btrim(f.role)) as role, f.unidade_id
  into v_actor
  from public.funcionarios f
  where f.auth_user_id = auth.uid() and f.ativo is true
  order by (f.usuario = 'admin.sms') desc nulls last, f.id
  limit 1;

  if not found then
    raise exception 'Acesso não autorizado.' using errcode = '42501';
  end if;

  -- Follow the same session-then-cycle lock order as attendance completion.
  select s.* into v_session
  from public.treatment_sessions s
  where s.id = p_session_id
  for update;

  if not found then
    raise exception 'Sessão não encontrada.' using errcode = '02000';
  end if;

  select c.* into v_cycle
  from public.treatment_cycles c
  where c.id = v_session.cycle_id
    and (
      (v_actor.usuario = 'admin.sms' and public.is_global_owner())
      or (
        nullif(btrim(v_actor.unidade_id), '') is not null
        and v_actor.unidade_id = c.unit_id
        and (
          v_actor.role = 'master'
          or (v_actor.role = 'profissional' and v_actor.id::text = c.professional_id)
        )
      )
    )
  for no key update;

  if not found then
    raise exception 'Permissão negada para alterar o ciclo desta sessão.' using errcode = '42501';
  end if;

  if v_session.status is distinct from 'realizada' then
    raise exception 'Apenas sessões realizadas podem ser limpas.' using errcode = '23514';
  end if;

  if v_session.patient_id is distinct from v_cycle.patient_id
    or v_session.professional_id is distinct from v_cycle.professional_id then
    raise exception 'O vínculo entre a sessão e o ciclo precisa ser revisado.' using errcode = '23514';
  end if;

  update public.treatment_sessions
  set status = 'agendada',
      clinical_notes = '',
      procedure_done = '',
      absence_type = null,
      tipo_falta = null,
      falta_justificativa = null
  where id = v_session.id;

  if not found then
    raise exception 'Falha ao reverter a sessão.' using errcode = '40001';
  end if;

  select count(*) into v_new_sessions_done
  from public.treatment_sessions
  where cycle_id = v_cycle.id and status = 'realizada';

  update public.treatment_cycles
  set sessions_done = v_new_sessions_done,
      status = case when status in ('finalizado_alta', 'concluido') then status else 'em_andamento' end,
      updated_at = greatest(updated_at, statement_timestamp())
  where id = v_cycle.id;

  if not found then
    raise exception 'Falha ao sincronizar o contador do ciclo.' using errcode = '40001';
  end if;

  -- Save the reason in the same transaction without duplicating clinical notes.
  insert into public.action_logs (
    user_id, user_nome, role, unidade_id, acao, entidade, entidade_id,
    modulo, paciente_id, profissional_id, detalhes
  ) values (
    v_actor.id::text, v_actor.nome, v_actor.role, v_cycle.unit_id,
    'limpar_sessao_realizada', 'treatment_session', v_session.id::text,
    'tratamentos', v_cycle.patient_id, v_cycle.professional_id,
    jsonb_build_object(
      'motivo_alteracao', v_justificativa, 'usuario_autor', v_actor.usuario,
      'ciclo', v_cycle.id, 'sessao', v_session.session_number,
      'status_anterior', v_session.status, 'status_novo', 'agendada',
      'sessoes_realizadas_anterior', v_cycle.sessions_done, 'sessoes_realizadas_novo', v_new_sessions_done
    )
  );

  if not found then
    raise exception 'Falha ao gravar a auditoria da reversão.' using errcode = '40001';
  end if;

  return jsonb_build_object(
    'success', true,
    'session_id', v_session.id,
    'cycle_id', v_cycle.id,
    'new_sessions_done', v_new_sessions_done
  );
end;
$function$;

revoke all on function public.revert_completed_treatment_session(uuid, text) from public, anon;
grant execute on function public.revert_completed_treatment_session(uuid, text) to authenticated;
