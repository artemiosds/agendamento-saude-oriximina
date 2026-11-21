-- Save one availability group atomically, using the caller's existing RLS permissions.
create or replace function public.save_availability_group(
  p_previous_ids text[],
  p_profissional_id text,
  p_unidade_id text,
  p_data_inicio date,
  p_data_fim date,
  p_slots jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_previous_ids text[] := coalesce(p_previous_ids, array[]::text[]);
  v_previous public.disponibilidades%rowtype;
  v_expected_ids text[];
  v_current_ids text[];
  v_slot_count integer;
  v_written integer;
  v_lock bigint;
  v_target_lock bigint;
  v_previous_lock bigint;
begin
  if auth.uid() is null or not public.is_staff_member() then
    raise exception using errcode = '42501', message = 'Acesso à grade de disponibilidade não autorizado.';
  end if;

  if nullif(p_profissional_id, '') is null or nullif(p_unidade_id, '') is null
    or p_data_inicio is null or p_data_fim is null or p_data_inicio > p_data_fim
    or pg_catalog.jsonb_typeof(p_slots) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Profissional, unidade, período ou horários inválidos.';
  end if;
  v_slot_count := pg_catalog.jsonb_array_length(p_slots);
  if v_slot_count = 0 and pg_catalog.cardinality(v_previous_ids) = 0 then
    raise exception using errcode = '22023', message = 'Informe os horários da grade.';
  end if;

  v_target_lock := pg_catalog.hashtextextended(
    pg_catalog.jsonb_build_array('disponibilidades', p_profissional_id, p_unidade_id)::text, 0
  );
  v_previous_lock := v_target_lock;
  if pg_catalog.cardinality(v_previous_ids) > 0 then
    select d.* into v_previous from public.disponibilidades d where d.id = v_previous_ids[1];
    if not found then
      raise exception using errcode = '40001', message = 'Esta grade foi alterada. Atualize a página e tente novamente.';
    end if;
    v_previous_lock := pg_catalog.hashtextextended(
      pg_catalog.jsonb_build_array('disponibilidades', v_previous.profissional_id, v_previous.unidade_id)::text, 0
    );
  end if;

  if not public.is_global_owner() and (
    not exists (
      select 1 from public.funcionarios f
      where f.auth_user_id = auth.uid() and f.ativo is true and f.unidade_id = p_unidade_id
    ) or (
      v_previous.id is not null and not exists (
        select 1 from public.funcionarios f
        where f.auth_user_id = auth.uid() and f.ativo is true and f.unidade_id = v_previous.unidade_id
      )
    )
  ) then
    raise exception using errcode = '42501', message = 'Acesso à grade desta unidade não autorizado.';
  end if;

  -- An edit may move a group. Lock both pairs in a stable order.
  for v_lock in
    select distinct key from pg_catalog.unnest(array[v_previous_lock, v_target_lock]) as keys(key) order by key
  loop
    perform pg_catalog.pg_advisory_xact_lock(v_lock);
  end loop;

  if v_previous.id is not null then
    select pg_catalog.array_agg(expected.id order by expected.id) into v_expected_ids
    from pg_catalog.unnest(v_previous_ids) as expected(id);
    select pg_catalog.array_agg(d.id order by d.id) into v_current_ids
    from public.disponibilidades d
    where d.profissional_id = v_previous.profissional_id and d.unidade_id = v_previous.unidade_id
      and d.data_inicio = v_previous.data_inicio and d.data_fim = v_previous.data_fim;

    if v_expected_ids is distinct from v_current_ids then
      raise exception using errcode = '40001', message = 'Esta grade foi alterada. Atualize a página e tente novamente.';
    end if;
  end if;

  if v_slot_count > 0 and exists (
    select 1 from public.disponibilidades d
    where d.profissional_id = p_profissional_id and d.unidade_id = p_unidade_id
      and d.data_inicio <= p_data_fim and d.data_fim >= p_data_inicio
      and not (d.id = any(v_previous_ids))
  ) then
    raise exception using errcode = '23P01', message = 'Este profissional já possui disponibilidade neste período para esta unidade.';
  end if;

  if pg_catalog.cardinality(v_previous_ids) > 0 then
    delete from public.disponibilidades d where d.id = any(v_previous_ids);
    get diagnostics v_written = row_count;
    if v_written <> pg_catalog.cardinality(v_previous_ids) then
      raise exception using errcode = '40001', message = 'A grade original não pôde ser confirmada. Atualize a página e tente novamente.';
    end if;
  end if;

  if v_slot_count = 0 then
    return v_written;
  end if;

  insert into public.disponibilidades (
    id, profissional_id, unidade_id, data_inicio, data_fim, sala_id, hora_inicio, hora_fim,
    vagas_por_hora, vagas_por_dia, dias_semana, duracao_consulta
  )
  select 'd' || pg_catalog.gen_random_uuid()::text, p_profissional_id, p_unidade_id, p_data_inicio, p_data_fim,
    slot.sala_id, slot.hora_inicio, slot.hora_fim, slot.vagas_por_hora, slot.vagas_por_dia, slot.dias_semana, slot.duracao_consulta
  from pg_catalog.jsonb_to_recordset(p_slots) as slot(
    sala_id text, hora_inicio text, hora_fim text, vagas_por_hora integer, vagas_por_dia integer,
    dias_semana integer[], duracao_consulta integer
  );
  get diagnostics v_written = row_count;
  if v_written <> v_slot_count then
    raise exception using errcode = 'P0001', message = 'O banco não confirmou todos os horários da grade.';
  end if;
  return v_written;
end;
$function$;

revoke all on function public.save_availability_group(text[], text, text, date, date, jsonb) from public, anon;
grant execute on function public.save_availability_group(text[], text, text, date, date, jsonb) to authenticated;
