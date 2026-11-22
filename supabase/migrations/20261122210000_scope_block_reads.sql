-- Keep write policies intact. A restrictive SELECT policy also constrains the
-- existing FOR ALL policy, which otherwise grants staff network-wide reads.
drop policy if exists "Auth users read bloqueios" on public.bloqueios;
drop policy if exists "Anon read bloqueios" on public.bloqueios;
drop policy if exists "External read bloqueios" on public.bloqueios;

create policy "Authorized actors read bloqueios"
on public.bloqueios for select to authenticated
using ((select public.is_staff_member()) or (select public.is_external_professional()));

create policy "Enforce scoped read bloqueios"
on public.bloqueios as restrictive for select to authenticated
using (
  (select public.is_global_owner())
  or exists (
    select 1 from public.funcionarios f
    where f.auth_user_id = (select auth.uid()) and f.ativo is true
      and nullif(btrim(f.unidade_id), '') is not null
      and (
        -- General holidays apply to every unit.
        (coalesce(bloqueios.unidade_id, '') = '' and coalesce(bloqueios.profissional_id, '') = '')
        or (bloqueios.unidade_id = f.unidade_id and coalesce(bloqueios.profissional_id, '') = '')
        -- Professional-level blocks apply wherever this professional works.
        or exists (
          select 1 from public.funcionarios titular
          where titular.id::text = bloqueios.profissional_id and titular.unidade_id = f.unidade_id
        )
        or exists (
          select 1 from public.disponibilidades d
          where d.profissional_id = bloqueios.profissional_id and d.unidade_id = f.unidade_id
        )
      )
  )
  or (
    (select public.is_external_professional())
    and exists (
      select 1 from public.quotas_externas q
      join public.profissionais_externos e on e.id = q.profissional_externo_id
      cross join lateral (
        select greatest(q.periodo_inicio, bloqueios.data_inicio, (now() at time zone 'America/Sao_Paulo')::date) as inicio,
               least(q.periodo_fim, bloqueios.data_fim) as fim
      ) janela
      where e.auth_user_id = (select auth.uid()) and e.ativo is true
        and q.ativo is true and q.vagas_usadas >= 0 and q.vagas_usadas < q.vagas_total
        and (
          bloqueios.profissional_id = q.profissional_interno_id::text
          or (coalesce(bloqueios.profissional_id, '') = '' and
            (coalesce(bloqueios.unidade_id, '') = '' or bloqueios.unidade_id = q.unidade_id))
        )
        and (
          bloqueios.dia_inteiro is true or coalesce(bloqueios.hora_inicio, '') = ''
          or q.turno = 'integral'
          or (q.horario_inicio is not null and q.horario_fim is not null
            and left(bloqueios.hora_inicio, 5) < left(q.horario_fim::text, 5)
            and coalesce(nullif(left(bloqueios.hora_fim, 5), ''), '23:59') > left(q.horario_inicio::text, 5))
        )
        and exists (
          select 1 from generate_series(0, least(6, janela.fim - janela.inicio)) as dias(deslocamento)
          where q.dia_semana is null or q.dia_semana = extract(dow from janela.inicio + dias.deslocamento)::integer
        )
    )
  )
);
