import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const login = (id) => db.query("select set_config('test.user', $1, false)", [id]);
const visible = async () => (await db.query("select id from public.disponibilidades order by id")).rows.map(row => row.id);

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    grant usage on schema auth to authenticated;
    create function auth.uid() returns text language sql stable as $$select current_setting('test.user', true)$$;
    create table public.funcionarios(auth_user_id text, usuario text, unidade_id text, ativo boolean);
    create table public.profissionais_externos(id text, auth_user_id text, ativo boolean);
    create table public.quotas_externas(profissional_externo_id text, profissional_interno_id text, unidade_id text,
      periodo_inicio date, periodo_fim date, ativo boolean, vagas_total integer, vagas_usadas integer, turno text,
      horario_inicio time, horario_fim time, dia_semana integer);
    create table public.disponibilidades(id text, profissional_id text, unidade_id text, data_inicio date, data_fim date,
      hora_inicio text, hora_fim text, vagas_por_hora integer, dias_semana integer[]);
    create function public.is_global_owner() returns boolean language sql stable security definer set search_path = '' as
    $$select exists(select 1 from public.funcionarios where auth_user_id=auth.uid() and usuario='admin.sms' and ativo)$$;
    create function public.is_staff_member() returns boolean language sql stable security definer set search_path = '' as
    $$select exists(select 1 from public.funcionarios where auth_user_id=auth.uid() and ativo)$$;
    create function public.is_external_professional() returns boolean language sql stable security definer set search_path = '' as
    $$select exists(select 1 from public.profissionais_externos where auth_user_id=auth.uid() and ativo)$$;
    grant select on public.funcionarios, public.profissionais_externos, public.quotas_externas to authenticated;
    grant select on public.disponibilidades to anon, authenticated;
    alter table public.disponibilidades enable row level security;
    alter table public.funcionarios enable row level security;
    alter table public.profissionais_externos enable row level security;
    alter table public.quotas_externas enable row level security;
    create policy staff on public.funcionarios for select to authenticated using (public.is_staff_member());
    create policy external on public.funcionarios for select to authenticated using (public.is_external_professional());
    create policy own_external on public.profissionais_externos for select to authenticated using (auth_user_id=auth.uid());
    create policy own_quota on public.quotas_externas for select to authenticated using
      (profissional_externo_id in (select id from public.profissionais_externos where auth_user_id=auth.uid()));
    create policy "Authenticated read disponibilidades" on public.disponibilidades for select to authenticated using (true);
    create policy "External read disponibilidades" on public.disponibilidades for select to authenticated using (public.is_external_professional());
    insert into public.funcionarios values ('staff-a','staff','a',true),('staff-b','staff','b',true),('admin','admin.sms','',true),('inactive','staff','a',false);
    insert into public.profissionais_externos values ('e1','external',true),('e2','other-external',true);
    insert into public.quotas_externas values
      ('e1','p1','a',current_date-1,current_date+30,true,5,1,'manha','08:00','12:00',null),
      ('e1','p2','a',current_date-1,current_date+30,true,5,5,'integral',null,null,null),
      ('e1','p3','b',current_date-30,current_date-15,true,5,1,'integral',null,null,null),
      ('e2','p1','b',current_date-1,current_date+30,true,5,1,'integral',null,null,null);
    insert into public.disponibilidades values
      ('morning','p1','a',current_date-1,current_date+20,'08:00','12:00',0,array[1,2,3,4,5]),
      ('afternoon','p1','a',current_date-1,current_date+20,'13:00','17:00',0,array[1,2,3,4,5]),
      ('other-unit','p1','b',current_date-1,current_date+20,'08:00','12:00',0,array[1,2,3,4,5]),
      ('full-quota','p2','a',current_date-1,current_date+20,'08:00','12:00',0,array[1,2,3,4,5]),
      ('expired-quota','p3','b',current_date-1,current_date+20,'08:00','12:00',0,array[1,2,3,4,5]);
  `);
  await db.exec(readFileSync(new URL("../migrations/20261122163000_scope_availability_reads.sql", import.meta.url), "utf8"));
  await db.exec("set role authenticated");
  for (const [user, expected] of [
    ["patient", []], ["inactive", []],
    ["staff-a", ["afternoon", "full-quota", "morning"]],
    ["staff-b", ["expired-quota", "other-unit"]],
    ["admin", ["afternoon", "expired-quota", "full-quota", "morning", "other-unit"]],
    ["external", ["morning"]],
    ["other-external", ["other-unit"]],
  ]) {
    await login(user);
    assert.deepEqual(await visible(), expected, user);
  }
  await db.exec("reset role; set role anon");
  assert.deepEqual(await visible(), []);
  console.log("PASS: disponibilidade isolada por unidade, cota, perfil e acesso anônimo.");
} finally {
  await db.close();
}
