import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const migration = name => readFileSync(new URL("../migrations/" + name, import.meta.url), "utf8");
const call = (id, unit = "u1", reason = "Encaixe autorizado", override = true) => db.query(
  "select public.create_internal_appointment_with_policy_override($1::jsonb,$2,false,$3)",
  [JSON.stringify({ id, profissional_id: "prof1", paciente_id: "patient1", unidade_id: unit,
    paciente_nome: "TESTE", profissional_nome: "TESTE", data: "2026-11-24", hora: "13:15", tipo: "Consulta" }), reason, override],
);
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns text language sql stable as
      $$select nullif(current_setting('test.actor',true),'')$$;
    create table public.funcionarios(id text,auth_user_id text,ativo boolean,role text,usuario text,unidade_id text,nome text);
    create table public.agendamentos(id text primary key,paciente_id text,paciente_nome text,unidade_id text,sala_id text,
      setor_id text,profissional_id text,profissional_nome text,data date,hora text,status text,tipo text,observacoes text,
      origem text,criado_por text,prioridade_perfil text,procedimento_sigtap text,nome_procedimento text,custom_data jsonb);
    create table public.action_logs(user_id text,user_nome text,role text,unidade_id text,acao text,entidade text,
      entidade_id text,detalhes jsonb,agendamento_id text,paciente_id text,profissional_id text);
    create function public.check_internal_slot_availability(text,text,date,text) returns jsonb language sql as
      $$select jsonb_build_object('available',false,'reason',current_setting('test.reason',true))$$;
    create function public.check_patient_profession_careness(text,text,text) returns jsonb language sql as
      $$select '{"blocked":false}'::jsonb$$;
    insert into public.funcionarios values ('master','local',true,'master','master.u1','u1','MASTER TESTE'),
      ('global','global',true,'master','admin.sms','','MASTER GLOBAL'),
      ('staff','reception',true,'recepcao','recepcao','u1','RECEPCAO');
  `);
  await db.exec(migration("20260930213000_restore_agenda_master_capacity_override.sql"));
  await db.exec(migration("20261119183000_agendamento_sigtap_override.sql"));
  await db.exec(migration("20261122223000_agenda_master_free_time.sql"));
  await db.query("select set_config('test.actor','local',false)");
  for (const reason of ["no_availability", "outside_grid", "availability_conflict", "day_full", "hour_full", "turno_full", "external_reservation"]) {
    await db.query("select set_config('test.reason',$1,false)", [reason]);
    await call(reason);
  }
  assert.equal((await db.query("select count(*)::int as n from public.agendamentos")).rows[0].n, 7);
  assert.equal((await db.query("select count(*)::int as n from public.action_logs where detalhes->>'motivo_alteracao'='Encaixe autorizado'")).rows[0].n, 7);
  await db.query("select set_config('test.reason','date_blocked',false)");
  await assert.rejects(call("holiday"), /Encaixe Master não permitido/);
  await db.query("select set_config('test.reason','no_availability',false)");
  await assert.rejects(call("other-unit", "u2"), /Master sem acesso/);
  await assert.rejects(call("short", "u1", "ab"), /Informe o motivo/);
  await assert.rejects(call("no-override", "u1", "Justificado", false), /Encaixe Master não permitido/);
  await db.query("select set_config('test.actor','reception',false)");
  await assert.rejects(call("reception"), /Somente Master/);
  await db.query("select set_config('test.actor','',false)");
  await assert.rejects(call("anonymous"), /Autenticação necessária/);
  await db.query("select set_config('test.actor','global',false)");
  await call("global-other-unit", "u2");
  assert.equal((await db.query("select count(*)::int as n from public.agendamentos")).rows[0].n, 8);
  assert.equal((await db.query("select has_function_privilege('anon','public.create_internal_appointment_with_policy_override(jsonb,text,boolean,boolean)','EXECUTE') as allowed")).rows[0].allowed, false);
  console.log("PASS: encaixe Master sem grade, auditoria, isolamento, justificativa, recepção e feriados.");
} finally {
  await db.close();
}
