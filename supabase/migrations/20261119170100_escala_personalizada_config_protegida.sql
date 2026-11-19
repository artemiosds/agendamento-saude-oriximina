-- Same table as the institutional settings, but a private row: the "default"
-- JSON is readable by all staff and is also rewritten by the settings UI.
drop policy if exists "Escalas existem somente via RPC" on public.system_config;
create policy "Escalas existem somente via RPC" on public.system_config
  as restrictive for all to public
  using (id <> 'escalas_personalizadas')
  with check (id <> 'escalas_personalizadas');

create or replace function public.listar_escalas_personalizadas(p_inicio date, p_fim date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $roster$
declare
  actor public.funcionarios%rowtype;
  global_admin boolean;
begin
  select * into actor from public.funcionarios where auth_user_id = auth.uid() and ativo is true;
  if actor.id is null then
    raise exception 'Funcionário ativo necessário para consultar a escala.' using errcode = '42501';
  end if;
  if p_inicio is null or p_fim is null or not isfinite(p_inicio) or not isfinite(p_fim)
    or p_fim < p_inicio or p_fim - p_inicio > 62 then
    raise exception 'Informe um período de consulta válido.' using errcode = '22023';
  end if;
  global_admin := actor.usuario is not distinct from 'admin.sms' and actor.role = 'master';
  return (
    select coalesce(jsonb_agg(e order by e->>'data', e->>'inicio'), '[]'::jsonb)
    from public.system_config c
    cross join lateral jsonb_array_elements(coalesce(c.configuracoes->'escalas_personalizadas', '[]'::jsonb)) e
    where c.id = 'escalas_personalizadas'
      and (global_admin or (nullif(actor.unidade_id, '') is not null and e->>'unidade' = actor.unidade_id))
      and (e->>'data')::date <= p_fim
      and ((e->>'data')::date >= p_inicio - 1 or e->>'semanal' = 'true')
  );
end
$roster$;

create or replace function public.salvar_escalas_personalizadas(
  p_profissional uuid, p_unidade text, p_local text, p_setor text,
  p_datas date[], p_inicio time, p_duracao integer, p_semanal boolean, p_origem uuid
)
returns integer
language plpgsql security definer set search_path = ''
as $roster$
declare
  actor public.funcionarios%rowtype;
  pessoa public.funcionarios%rowtype;
  global_admin boolean;
  unidade text;
  unidade_oficial text := nullif(p_unidade, '');
  local_nome text := nullif(btrim(p_local), '');
  setor_nome text := nullif(btrim(p_setor), '');
  datas date[];
  dia date;
  inicio_min integer;
  itens jsonb;
  outros jsonb;
  novos jsonb := '[]'::jsonb;
  fonte jsonb;
begin
  select * into actor from public.funcionarios where auth_user_id = auth.uid() and ativo is true;
  if actor.id is null or coalesce(actor.role, '') not in ('master', 'coordenador', 'gestao') then
    raise exception 'Seu perfil não pode cadastrar escalas informativas.' using errcode = '42501';
  end if;
  global_admin := actor.usuario is not distinct from 'admin.sms' and actor.role = 'master';
  select * into pessoa from public.funcionarios where id = p_profissional and ativo and role = 'profissional';
  if pessoa.id is null or (not global_admin and
       (nullif(actor.unidade_id, '') is null or pessoa.unidade_id is distinct from actor.unidade_id)) then
    raise exception 'Profissional fora do escopo da sua unidade.' using errcode = '42501';
  end if;
  unidade := coalesce(unidade_oficial, pessoa.unidade_id, '');
  if unidade_oficial is not null and
     (not exists (select 1 from public.unidades where id = unidade_oficial and ativo)
       or (not global_admin and unidade_oficial is distinct from actor.unidade_id)) then
    raise exception 'A unidade cadastrada está fora do seu escopo.' using errcode = '42501';
  end if;
  if local_nome is null or char_length(local_nome) > 100 or local_nome ~ '[[:cntrl:]]'
    or char_length(setor_nome) > 100 or setor_nome ~ '[[:cntrl:]]' then
    raise exception 'Informe o local e use até 100 caracteres em cada campo.' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_datas), 0) not between 1 and 90 or array_position(p_datas, null) is not null
    or p_inicio is null or p_inicio >= '24:00'::time or extract(second from p_inicio) <> 0
    or p_duracao is null or p_duracao not between 1 and 1440 or p_semanal is null then
    raise exception 'Selecione de 1 a 90 dias e informe um turno de até 24 horas.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_datas) as d(data) where not isfinite(d.data)) then
    raise exception 'Confira as datas selecionadas.' using errcode = '22023';
  end if;
  if p_semanal then
    select array_agg(selecionado order by selecionado) into datas from (
      select min(d.data) as selecionado from unnest(p_datas) as d(data) group by extract(dow from d.data)
    ) primeira_por_dia_semana;
  else
    select array_agg(distinct d.data order by d.data) into datas from unnest(p_datas) as d(data);
  end if;
  inicio_min := extract(epoch from p_inicio)::integer / 60;

  insert into public.system_config (id, configuracoes)
    values ('escalas_personalizadas', '{"escalas_personalizadas":[]}'::jsonb) on conflict (id) do nothing;
  select coalesce(configuracoes->'escalas_personalizadas', '[]'::jsonb) into itens
    from public.system_config where id = 'escalas_personalizadas' for update;
  select coalesce(jsonb_agg(e), '[]'::jsonb) into outros
    from jsonb_array_elements(itens) e where e->>'profissional' = p_profissional::text;
  if p_origem is not null then
    select e into fonte from jsonb_array_elements(outros) e
      where e->>'id' = p_origem::text and e->>'semanal' = 'true';
    if fonte is null or p_semanal
       or (not global_admin and fonte->>'unidade' is distinct from actor.unidade_id) then
      raise exception 'Selecione uma escala semanal válida para alterar ocorrências.' using errcode = '22023';
    end if;
  end if;
  -- The original informative entries remain readable; they also still prevent double shifts.
  if jsonb_typeof(pessoa.custom_data->'escala_informativa') = 'array' then
    outros := outros || (pessoa.custom_data->'escala_informativa');
  end if;

  foreach dia in array datas loop
    if p_origem is not null and
      (dia < (fonte->>'data')::date or extract(dow from dia) <> extract(dow from (fonte->>'data')::date)) then
      raise exception 'A data % não corresponde ao dia da escala original.', to_char(dia, 'DD/MM/YYYY') using errcode = '22023';
    end if;
    -- Examine only the preceding, selected and next dates; a shift spans at most 24h.
    if exists (
      select 1
      from public.disponibilidades d
      cross join generate_series(-1, 1) as n(delta)
      cross join lateral (select dia + n.delta as dia_grade) as a
      cross join lateral (select greatest(a.dia_grade, d.data_inicio) as inicio_periodo) as b
      where d.profissional_id = p_profissional::text
        and not (n.delta = 0 and d.unidade_id is not distinct from unidade_oficial
          and d.hora_inicio::time = p_inicio
          and extract(epoch from d.hora_fim::time - d.hora_inicio::time)::integer / 60 = p_duracao)
        and extract(dow from a.dia_grade)::int = any(d.dias_semana)
        and d.hora_inicio::time < d.hora_fim::time
        and n.delta * 1440 + extract(epoch from d.hora_inicio::time) / 60 < inicio_min + p_duracao
        and n.delta * 1440 + extract(epoch from d.hora_fim::time) / 60 > inicio_min
        and ((not p_semanal and a.dia_grade >= d.data_inicio and (d.data_fim is null or a.dia_grade <= d.data_fim))
          or (p_semanal and (d.data_fim is null or b.inicio_periodo +
               ((extract(dow from a.dia_grade)::int - extract(dow from b.inicio_periodo)::int + 7) % 7) <= d.data_fim)))
    ) then
      raise exception 'Conflito com a grade de atendimento em %. Nenhum dia foi salvo.', to_char(dia, 'DD/MM/YYYY');
    end if;
    if exists (
      select 1 from jsonb_array_elements(outros) e
      cross join generate_series(-1, 1) as n(delta)
      cross join lateral (select (e->>'data')::date as data,
        n.delta*1440 + extract(epoch from (e->>'inicio')::time)/60 as parte_inicio,
        coalesce((e->>'duracao')::int, extract(epoch from (e->>'fim')::time - (e->>'inicio')::time)::int / 60) as duracao) h
      where not ((e->>'id' = p_origem::text
               or (e->>'origem' = p_origem::text and h.data = dia)) is true)
        and h.parte_inicio < inicio_min + p_duracao and h.parte_inicio + h.duracao > inicio_min
        and extract(dow from h.data) = extract(dow from (dia + n.delta))
        and (h.data = dia + n.delta or (p_semanal and (h.data >= dia + n.delta or e->>'semanal' = 'true'))
          or (e->>'semanal' = 'true' and h.data <= dia + n.delta and not exists (
            select 1 from jsonb_array_elements(outros) x
             where x->>'origem' = e->>'id' and x->>'data' = (dia + n.delta)::text)))
    ) then
      raise exception 'Já existe uma escala nesse horário em %. Nenhum dia foi salvo.', to_char(dia, 'DD/MM/YYYY');
    end if;
    novos := novos || jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'profissional', p_profissional, 'unidade', unidade,
      'unidade_oficial', unidade_oficial, 'local', local_nome, 'setor', setor_nome,
      'data', dia, 'inicio', to_char(date '2000-01-01' + p_inicio, 'HH24:MI'),
      'fim', to_char(date '2000-01-01' + p_inicio + make_interval(mins => p_duracao), 'HH24:MI'),
      'duracao', p_duracao, 'semanal', p_semanal, 'origem', p_origem, 'autor', actor.id, 'criado_em', now()
    ));
  end loop;
  if p_origem is not null then
    select coalesce(jsonb_agg(e), '[]'::jsonb) into itens from jsonb_array_elements(itens) e
      where (e->>'origem' = p_origem::text and (e->>'data')::date = any(datas)) is not true;
  end if;
  update public.system_config set configuracoes = jsonb_set(configuracoes, '{escalas_personalizadas}', itens || novos)
    where id = 'escalas_personalizadas';
  insert into public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,profissional_id,detalhes)
  values(actor.id::text,actor.nome,actor.role,unidade,'salvar','escala_personalizada',novos->0->>'id','escalas_profissionais',
    p_profissional::text,jsonb_build_object('datas',datas,'local',local_nome,'setor',setor_nome,'inicio',p_inicio,
      'duracao_minutos',p_duracao,'semanal',p_semanal,'origem',p_origem));
  return cardinality(datas);
end
$roster$;

create or replace function public.remover_escala_personalizada(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $roster$
declare
  actor public.funcionarios%rowtype;
  itens jsonb;
  alvo jsonb;
begin
  select * into actor from public.funcionarios where auth_user_id = auth.uid() and ativo is true;
  if actor.id is null or coalesce(actor.role, '') not in ('master', 'coordenador', 'gestao') then
    raise exception 'Seu perfil não pode remover escalas informativas.' using errcode = '42501';
  end if;
  select configuracoes->'escalas_personalizadas' into itens from public.system_config
    where id = 'escalas_personalizadas' for update;
  select e into alvo from jsonb_array_elements(itens) e
    where e->>'id' = p_id::text and (actor.usuario is not distinct from 'admin.sms' and actor.role = 'master'
      or (nullif(actor.unidade_id, '') is not null and e->>'unidade' = actor.unidade_id));
  if alvo is null then raise exception 'Escala não encontrada no seu escopo.' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(e), '[]'::jsonb) into itens from jsonb_array_elements(itens) e where e->>'id' <> p_id::text;
  update public.system_config set configuracoes = jsonb_set(configuracoes, '{escalas_personalizadas}', itens)
    where id = 'escalas_personalizadas';
  insert into public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,profissional_id,detalhes)
  values(actor.id::text,actor.nome,actor.role,alvo->>'unidade','remover','escala_personalizada',p_id::text,
    'escalas_profissionais',alvo->>'profissional',jsonb_build_object('escala_removida',alvo));
end
$roster$;

revoke all on function public.listar_escalas_personalizadas(date,date) from public, anon;
revoke all on function public.salvar_escalas_personalizadas(uuid,text,text,text,date[],time,integer,boolean,uuid) from public, anon;
revoke all on function public.remover_escala_personalizada(uuid) from public, anon;
grant execute on function public.listar_escalas_personalizadas(date,date) to authenticated;
grant execute on function public.salvar_escalas_personalizadas(uuid,text,text,text,date[],time,integer,boolean,uuid) to authenticated;
grant execute on function public.remover_escala_personalizada(uuid) to authenticated;
