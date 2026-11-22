import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Isolated PostgreSQL, using only synthetic patients, cycles and staff.
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const sql = (file) => readFileSync(new URL(file, import.meta.url), "utf8");
const owner = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const admin = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const localMaster = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const colleague = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const inactive = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const actor = (id) => db.query("select set_config('test.auth_uid', $1, false)", [id]);
const revert = (label, reason = "Correção clínica de teste") => db.query(
  "select public.revert_completed_treatment_session(md5($1)::uuid, $2) as result",
  [label, reason],
);
const snapshot = async (label) => (await db.query(`
  select s.status, s.clinical_notes, s.procedure_done, s.absence_type, s.tipo_falta,
         s.falta_justificativa, s.appointment_id, s.scheduled_date, c.sessions_done, c.status as cycle_status
  from public.treatment_sessions s join public.treatment_cycles c on c.id = s.cycle_id
  where s.id = md5($1)::uuid
`, [label])).rows[0];

try {
  await db.exec(sql("./fixtures/treatment_integrity_schema.sql"));
  await db.exec(`
    grant usage on schema auth to authenticated;
    grant select on public.funcionarios to authenticated;
    grant select, update on public.treatment_sessions, public.treatment_cycles to authenticated;
    grant insert on public.action_logs to authenticated;
    create function public.is_staff_member() returns boolean language sql stable security definer set search_path = '' as
    $$select exists(select 1 from public.funcionarios where auth_user_id = auth.uid() and ativo)$$;
    create function public.is_global_owner() returns boolean language sql stable security definer set search_path = '' as
    $$select exists(select 1 from public.funcionarios where auth_user_id = auth.uid() and ativo and usuario='admin.sms')$$;
    alter table public.treatment_cycles enable row level security;
    alter table public.treatment_sessions enable row level security;
    alter table public.action_logs enable row level security;
    create policy staff on public.treatment_cycles to authenticated using (public.is_staff_member());
    create policy staff on public.treatment_sessions to authenticated using (public.is_staff_member());
    create policy staff on public.action_logs for insert to authenticated
    with check (public.is_staff_member() and entidade_id <> md5('falha-auditoria')::uuid::text);

    insert into public.funcionarios(id, auth_user_id, nome, usuario, email, role, unidade_id, ativo) values
      ('33333333-3333-3333-3333-333333333333', '${localMaster}', 'Master local', 'master-local', 'master@example.invalid', 'master', 'u', true),
      ('44444444-4444-4444-4444-444444444444', '${colleague}', 'Colega', 'colega', 'colega@example.invalid', 'profissional', 'u', true),
      ('55555555-5555-5555-5555-555555555555', '${inactive}', 'Inativo', 'inativo', 'inativo@example.invalid', 'master', 'u', false);

    insert into public.treatment_cycles(id, patient_id, professional_id, unit_id, total_sessions, sessions_done, status)
    select md5(label || '-ciclo')::uuid, 'patient', '22222222-2222-2222-2222-222222222222',
      case when label = 'outra-unidade' then 'outra-unidade' else 'u' end, 2, 90,
      case when label = 'alta' then 'finalizado_alta' when label = 'concluido' then 'concluido' else 'em_andamento' end
    from unnest(array['normal','alta','concluido','outra-unidade','pendente','falha-ciclo','falha-auditoria']) cases(label);

    insert into public.treatment_sessions(id, cycle_id, patient_id, professional_id, session_number, total_sessions,
      scheduled_date, status, clinical_notes, procedure_done, absence_type, tipo_falta, falta_justificativa, appointment_id)
    select md5(label)::uuid, md5(label || '-ciclo')::uuid, 'patient', '22222222-2222-2222-2222-222222222222', 1, 2,
      date '2030-05-01', case when label='pendente' then 'agendada' else 'realizada' end,
      'Evolução fictícia', 'Procedimento fictício', 'justificada', 'justificada', 'Teste', 'agenda-ficticia'
    from unnest(array['normal','alta','concluido','outra-unidade','pendente','falha-ciclo','falha-auditoria']) cases(label);

    insert into public.treatment_sessions(cycle_id, patient_id, professional_id, session_number, total_sessions, scheduled_date, status)
    values (md5('normal-ciclo')::uuid, 'patient', '22222222-2222-2222-2222-222222222222', 2, 2, date '2030-05-08', 'realizada');

    create function public.test_reject_cycle_update() returns trigger language plpgsql as
    $$begin raise exception 'Rejeição simulada do ciclo' using errcode='42501'; end$$;
    create trigger test_reject_update before update on public.treatment_cycles for each row
    when (old.id = md5('falha-ciclo-ciclo')::uuid) execute function public.test_reject_cycle_update();
  `);
  await db.exec(sql("../migrations/20261122160000_revert_completed_treatment_session.sql"));
  await db.exec("set role anon");
  await assert.rejects(revert("normal"), { code: "42501" });
  await db.exec("reset role; set role authenticated");
  for (const userId of ["", inactive, colleague]) {
    await actor(userId);
    await assert.rejects(revert("normal"), { code: "42501" });
  }
  await actor(localMaster);
  const otherUnitBefore = await snapshot("outra-unidade");
  await assert.rejects(revert("outra-unidade"), { code: "42501" });
  assert.deepEqual(await snapshot("outra-unidade"), otherUnitBefore);
  assert.equal((await revert("alta")).rows[0].result.success, true);
  assert.equal((await snapshot("alta")).cycle_status, "finalizado_alta");
  await actor(admin);
  assert.equal((await revert("outra-unidade")).rows[0].result.success, true);
  assert.equal((await revert("concluido")).rows[0].result.success, true);
  assert.equal((await snapshot("concluido")).cycle_status, "concluido");

  await actor(owner);
  const original = await snapshot("normal");
  await assert.rejects(revert("normal", " \n\t "), { code: "22023" });
  assert.deepEqual(await snapshot("normal"), original);
  await assert.rejects(revert("pendente"), { code: "23514" });
  const { rows: [{ result }] } = await revert("normal", "  Ajuste clínico confirmado  ");
  assert.equal(result.success, true);
  assert.equal(result.new_sessions_done, 1);
  const reversed = await snapshot("normal");
  assert.deepEqual(reversed, { ...original, status: "agendada", clinical_notes: "", procedure_done: "",
    absence_type: null, tipo_falta: null, falta_justificativa: null, sessions_done: 1 });
  await assert.rejects(revert("normal"), { code: "23514" });
  for (const label of ["falha-ciclo", "falha-auditoria"]) {
    const before = await snapshot(label);
    await assert.rejects(revert(label), { code: "42501" });
    assert.deepEqual(await snapshot(label), before);
  }

  await db.exec("reset role");
  const { rows: logs } = await db.query(
    "select entidade_id, user_id, detalhes from public.action_logs where acao='limpar_sessao_realizada'",
  );
  assert.equal(logs.length, 4);
  const audit = logs.find((entry) => entry.entidade_id === result.session_id);
  assert.equal(audit.user_id, "22222222-2222-2222-2222-222222222222");
  assert.equal(audit.detalhes.motivo_alteracao, "Ajuste clínico confirmado");
  assert.equal(audit.detalhes.sessoes_realizadas_novo, 1);
  console.log("PASS: escopo, justificativa, contador exato, auditoria e rollback por falha no ciclo ou no log.");
} finally {
  await db.close();
}
