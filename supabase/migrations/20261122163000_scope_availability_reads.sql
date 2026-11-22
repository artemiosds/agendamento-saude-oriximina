-- Direct reads of the operational schedule are scoped by role.
drop policy if exists "Authenticated read disponibilidades" on public.disponibilidades;
drop policy if exists "External read disponibilidades" on public.disponibilidades;

create policy "Staff read scoped disponibilidades"
on public.disponibilidades
for select
to authenticated
using (
  (select public.is_global_owner())
  or exists (
    select 1
    from public.funcionarios f
    where f.auth_user_id = (select auth.uid())
      and f.ativo is true
      and nullif(btrim(f.unidade_id), '') is not null
      and f.unidade_id = disponibilidades.unidade_id
  )
);

create policy "External read quota scoped disponibilidades"
on public.disponibilidades
for select
to authenticated
using (
  (select public.is_external_professional())
  and exists (
    select 1
    from public.quotas_externas q
    join public.profissionais_externos e on e.id = q.profissional_externo_id
    cross join lateral (
      select greatest(q.periodo_inicio, disponibilidades.data_inicio, (now() at time zone 'America/Sao_Paulo')::date) as inicio,
             least(q.periodo_fim, disponibilidades.data_fim) as fim
    ) janela
    where e.auth_user_id = (select auth.uid())
      and e.ativo is true
      and q.ativo is true
      and q.vagas_usadas >= 0 and q.vagas_usadas < q.vagas_total
      and q.unidade_id = disponibilidades.unidade_id
      and q.profissional_interno_id::text = disponibilidades.profissional_id
      and (
        q.turno = 'integral'
        or (
          q.turno in ('manha', 'tarde', 'noite', 'personalizado')
          and q.horario_inicio < q.horario_fim
          and left(disponibilidades.hora_inicio, 5) < left(q.horario_fim::text, 5)
          and case when coalesce(disponibilidades.vagas_por_hora, 0) = 0
            then left(disponibilidades.hora_inicio, 5) >= left(q.horario_inicio::text, 5)
            else left(disponibilidades.hora_fim, 5) > left(q.horario_inicio::text, 5)
          end
        )
      )
      and exists (
        select 1
        from generate_series(0, least(6, janela.fim - janela.inicio)) as dias(deslocamento)
        where extract(dow from janela.inicio + dias.deslocamento)::integer = any(disponibilidades.dias_semana)
          and (q.dia_semana is null or q.dia_semana = extract(dow from janela.inicio + dias.deslocamento)::integer)
      )
  )
);
