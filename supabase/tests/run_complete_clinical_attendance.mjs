// Isolated PostgreSQL with synthetic records. Set PGLITE_MODULE to an installed PGlite module if needed.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const owner = '11111111-1111-1111-1111-111111111111';

const complete = (id, unit = 'unidade-a', hour = '09:30') => db.query(
  'select public.complete_clinical_attendance($1, $2, 30, $3, $4) as result',
  [id, hour, unit, owner],
);

const snapshot = async (id) => (await db.query(`
  select a.status as agenda, t.status as atendimento, t.hora_fim, t.duracao_minutos,
         array(select s.status from public.treatment_sessions s where s.appointment_id = a.id order by s.id) as sessoes
  from public.agendamentos a left join public.atendimentos t on t.agendamento_id = a.id
  where a.id = $1
`, [id])).rows[0];

const actor = (id) => db.query("select set_config('test.auth_uid', $1, false)", [id]);

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    grant usage on schema auth to authenticated;
    create function auth.uid() returns uuid language sql stable as
    $$select nullif(current_setting('test.auth_uid', true), '')::uuid$$;
    create table public.funcionarios(id uuid primary key, auth_user_id uuid, ativo boolean, unidade_id text, role text, usuario text);
    create function public.is_staff_member() returns boolean language sql stable security definer set search_path = '' as
    $$select exists(select 1 from public.funcionarios where auth_user_id = auth.uid() and ativo)$$;
    create function public.is_global_owner() returns boolean language sql stable security definer set search_path = '' as
    $$select exists(select 1 from public.funcionarios where auth_user_id = auth.uid() and ativo and usuario = 'admin.sms')$$;
    create table public.agendamentos(id text primary key, unidade_id text, profissional_id text, paciente_id text, status text, data date, concluido_em timestamptz);
    create table public.atendimentos(id uuid primary key default gen_random_uuid(), agendamento_id text,
      unidade_id text, profissional_id text, paciente_id text, status text, hora_fim text, duracao_minutos integer);
    create table public.treatment_sessions(id uuid primary key default gen_random_uuid(), appointment_id text,
      patient_id text, professional_id text, scheduled_date date, status text);

    grant select on public.funcionarios to authenticated;
    grant select, update on public.agendamentos, public.atendimentos, public.treatment_sessions to authenticated;
    alter table public.agendamentos enable row level security;
    alter table public.atendimentos enable row level security;
    alter table public.treatment_sessions enable row level security;
    create policy staff on public.agendamentos to authenticated using (public.is_staff_member());
    create policy staff on public.atendimentos to authenticated using (public.is_staff_member());
    create policy staff on public.treatment_sessions to authenticated using (public.is_staff_member());

    insert into public.funcionarios values
      ('${owner}', '${owner}', true, 'unidade-a', 'profissional', 'titular'),
      ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', true, 'unidade-a', 'profissional', 'colega'),
      ('33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', true, 'unidade-a', 'master', 'master-local'),
      ('44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', true, 'unidade-a', 'master', 'admin.sms'),
      ('55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', false, 'unidade-a', 'profissional', 'inativo');
    insert into public.agendamentos
    select id, case when id = 'outra-unidade' then 'unidade-b' else 'unidade-a' end,
      '${owner}', 'paciente-teste', 'em_atendimento', date '2030-05-01', null
    from unnest(array['normal', 'falha-agenda', 'falha-sessao', 'sem-atendimento',
      'sem-sessao', 'outra-unidade', 'ambiguo', 'ja-realizada', 'legado']) as ids(id);
    insert into public.atendimentos(agendamento_id, unidade_id, profissional_id, paciente_id, status)
    select id, unidade_id, profissional_id, paciente_id, status from public.agendamentos where id <> 'sem-atendimento';
    update public.atendimentos set status = 'finalizado', hora_fim = '09:15', duracao_minutos = 15 where agendamento_id = 'legado';
    insert into public.treatment_sessions(appointment_id, patient_id, professional_id, scheduled_date, status)
    select id, paciente_id, profissional_id, data,
      case when id = 'ja-realizada' then 'realizada' else 'agendada' end
    from public.agendamentos where id in ('normal', 'falha-agenda', 'falha-sessao', 'ambiguo', 'ja-realizada');
    insert into public.treatment_sessions(appointment_id, patient_id, professional_id, scheduled_date, status) values
      ('normal', 'paciente-teste', '${owner}', '2030-06-01', 'agendada'),
      ('ambiguo', 'paciente-teste', '${owner}', '2030-05-01', 'pendente_agendamento');
    create function public.test_falha_agenda() returns trigger language plpgsql as
    $$begin raise exception 'falha simulada da Agenda' using errcode = 'P0001'; end$$;
    create trigger test_falha_agenda before update on public.agendamentos
    for each row when (old.id = 'falha-agenda') execute function public.test_falha_agenda();
    create function public.test_sessao_nao_gravada() returns trigger language plpgsql as
    $$begin return null; end$$;
    create trigger test_sessao_nao_gravada before update on public.treatment_sessions
    for each row when (old.appointment_id = 'falha-sessao') execute function public.test_sessao_nao_gravada();
  `);
  await db.exec(readFileSync(new URL('../migrations/20261122120000_complete_clinical_attendance.sql', import.meta.url), 'utf8'));

  await db.exec('set role anon');
  await assert.rejects(complete('normal'), { code: '42501' });
  await db.exec('reset role; set role authenticated');
  await assert.rejects(complete('normal'), { code: '42501' });
  await actor('55555555-5555-5555-5555-555555555555');
  await assert.rejects(complete('normal'), { code: '42501' });
  await actor('22222222-2222-2222-2222-222222222222');
  await assert.rejects(complete('normal'), { code: '42501' });
  await actor('33333333-3333-3333-3333-333333333333');
  await assert.rejects(complete('outra-unidade', 'unidade-b'), { code: '42501' });
  await complete('sem-sessao');
  assert.equal((await snapshot('sem-sessao')).agenda, 'concluido');
  await actor('44444444-4444-4444-4444-444444444444');
  await complete('outra-unidade', 'unidade-b');
  assert.equal((await snapshot('outra-unidade')).agenda, 'concluido');
  console.log('PASS: autenticação, titularidade e escopo dos Masters.');

  await actor(owner);
  assert.deepEqual((await complete('normal')).rows[0].result, {
    status: 'concluido', hora_fim: '09:30', duracao_minutos: 30,
  });
  const finished = await snapshot('normal');
  assert.equal(finished.agenda, 'concluido');
  assert.equal(finished.atendimento, 'finalizado');
  assert.equal(finished.hora_fim, '09:30');
  assert.equal(finished.duracao_minutos, 30);
  assert.deepEqual(finished.sessoes.toSorted(), ['agendada', 'realizada']);
  assert.equal((await complete('normal', 'unidade-a', '09:45')).rows[0].result.hora_fim, '09:30');
  assert.deepEqual(await snapshot('normal'), finished);
  await complete('ja-realizada');
  assert.deepEqual((await snapshot('ja-realizada')).sessoes, ['realizada']);
  await complete('legado');
  const repaired = await snapshot('legado');
  assert.equal(repaired.agenda, 'concluido');
  assert.equal(repaired.hora_fim, '09:15');
  assert.equal(repaired.duracao_minutos, 15);
  console.log('PASS: conclusão conjunta, vínculo exato, repetição e recuperação de estado parcial.');

  for (const [id, code] of [
    ['falha-agenda', 'P0001'], ['falha-sessao', '40001'], ['sem-atendimento', '23514'], ['ambiguo', '23514'],
  ]) {
    const before = await snapshot(id);
    await assert.rejects(complete(id), { code });
    assert.deepEqual(await snapshot(id), before);
  }
  console.log('PASS: rollback em falhas da Agenda, da sessão e dos vínculos obrigatórios.');
} finally {
  await db.close();
}
