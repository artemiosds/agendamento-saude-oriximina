// Run with CARE_FLOW_TEST_DATABASE_URL pointing to a disposable *_test PostgreSQL database.
// Uses real transactions and two independent connections; never run against production.
import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
const target = process.env.CARE_FLOW_TEST_DATABASE_URL;
if (!target) throw new Error('Set CARE_FLOW_TEST_DATABASE_URL to a disposable local *_test database.');
const url = new URL(target);
if (!['127.0.0.1','localhost'].includes(url.hostname) || !url.pathname.endsWith('_test')) throw new Error('Refusing to run destructive fixtures outside a local *_test database.');
const db = postgres(target, { max: 8, onnotice: () => {} });
const reception = '00000000-0000-4000-8000-000000000001';
const reception2 = '00000000-0000-4000-8000-000000000002';
const triage = '00000000-0000-4000-8000-000000000003';
const globalMaster = '00000000-0000-4000-8000-000000000004';
const unitMaster = '00000000-0000-4000-8000-000000000005';
const today = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";
async function asActor(actor, fn, failure) {
  return db.begin(async tx => {
    await tx.unsafe('SET LOCAL ROLE authenticated');
    await tx`select set_config('request.jwt.claim.sub',${actor},true)`;
    if (failure) await tx`select set_config('care_flow.test_failure',${failure},true)`;
    return fn(tx);
  });
}
const arrival = (tx, id = 'ag1', actor = reception, reconcile = false, unit = 'u1') => tx`select public.confirmar_chegada_atendimento(${id},${actor},'NOME FORJADO',${unit},'08:00',${reconcile},'p1') as result`.then(r => r[0].result);
const finish = (tx, data = { peso: 63, altura: 156 }, nursing = false) => tx`select public.concluir_triagem_atendimento('ag1',${triage},${tx.json(data)},${nursing}) as result`.then(r => r[0].result);
const code = c => e => e.code === c;
async function state() {
  return (await db`select a.status, f.status as fila_status, (select count(*)::int from public.action_logs) as logs, (select count(*)::int from public.triage_records) as charts from public.agendamentos a left join public.fila_espera f on f.id=a.id where a.id='ag1'`)[0];
}
before(async () => {
  const schema = await readFile(new URL('./care_flow_schema.sql', import.meta.url), 'utf8');
  await db.unsafe(schema.replace('CREATE ROLE authenticated;', () => "DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$;").replace('CREATE ROLE anon;', () => "DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; END $$;"));
  const migrationConnection = await db.reserve();
  try { await migrationConnection.unsafe(await readFile(new URL('../../supabase/migrations/20261023035237_atomic_reception_triage.sql', import.meta.url), 'utf8')); } finally { migrationConnection.release(); }
  await db.unsafe(`CREATE FUNCTION public.fail_care_flow_test_step() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('care_flow.test_failure',true)=TG_TABLE_NAME THEN RAISE EXCEPTION 'Forced test failure' USING ERRCODE='P0001'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER force_queue_failure BEFORE INSERT OR UPDATE ON public.fila_espera FOR EACH ROW EXECUTE FUNCTION public.fail_care_flow_test_step();
    CREATE TRIGGER force_audit_failure BEFORE INSERT ON public.action_logs FOR EACH ROW EXECUTE FUNCTION public.fail_care_flow_test_step();`);
});
beforeEach(async () => {
  await db.unsafe('TRUNCATE public.action_logs, public.triage_records, public.triage_settings, public.fila_espera, public.agendamentos, public.funcionarios, public.pacientes, public.permissoes, public.permissoes_usuario');
  await db`insert into public.funcionarios(id,auth_user_id,ativo,nome,usuario,role,unidade_id) values
    (${reception},${reception},true,'RECEPÇÃO 1','r1','recepcao','u1'),(${reception2},${reception2},true,'RECEPÇÃO 2','r2','recepcao','u1'),
    (${triage},${triage},true,'TRIAGEM','t1','triagem','u1'),(${globalMaster},${globalMaster},true,'GLOBAL','admin.sms','master',''),(${unitMaster},${unitMaster},true,'MASTER UNIDADE','m1','master','u2')`;
  await db`insert into public.pacientes values ('p1','u1',3,2,'BLOQUEADO')`;
  await db.unsafe(`insert into public.agendamentos(id,paciente_id,paciente_nome,unidade_id,profissional_id,data,hora,status,observacoes) values('ag1','p1','PACIENTE TESTE','u1','prof1',${today},'08:00','confirmado','Preservar observação')`);
});
after(async () => db.end());

test('professional disabled overrides globally enabled triage; direct route stays atomic', async () => {
  await db`insert into public.triage_settings(profissional_id,enabled) values(null,true),('prof1',false)`;
  const result = await asActor(reception, tx => arrival(tx));
  assert.equal(result.status,'apto_atendimento'); assert.equal(result.fila.status,'apto_atendimento');
  assert.equal((await state()).logs,1);
  assert.equal((await db`select total_faltas from pacientes`)[0].total_faltas,3);
});
test('global fallback/default opt-in, scoped settings, and narrow reset of patient counters', async () => {
  await db`insert into public.triage_settings(profissional_id,unidade_id,enabled) values(null,null,true),('prof1','u2',false)`;
  await asActor(reception, tx => arrival(tx));
  assert.equal((await state()).status,'confirmado_chegada'); assert.equal((await state()).fila_status,'chegada_confirmada');
  assert.equal((await db`select total_faltas from pacientes`)[0].total_faltas,0);
  const log=(await db`select user_nome,detalhes from action_logs`)[0]; assert.equal(log.user_nome,'RECEPÇÃO 1');
  assert.equal(log.detalhes.triagem_habilitada,true);
});
test('no triage configuration defaults to direct care', async () => {
  assert.equal((await asActor(reception, tx => arrival(tx))).status,'apto_atendimento');
});
test('two simultaneous receptions serialize; second call is idempotent with one audit', async () => {
  let locked, release;
  const ready = new Promise(r => locked=r); const gate = new Promise(r => release=r);
  const first = asActor(reception,async tx => { const result=await arrival(tx); locked(); await gate; return result; });
  await ready;
  let secondDone = false;
  const second = asActor(reception2, tx => arrival(tx,'ag1',reception2)).then(result => { secondDone=true; return result; });
  let waiting = false;
  for(let i=0;i<100;i++) {
    waiting = (await db`select exists(select 1 from pg_stat_activity where wait_event_type='Lock' and query like '%confirmar_chegada_atendimento%') as waiting`)[0].waiting;
    if(waiting) break; await new Promise(r => setTimeout(r,10));
  }
  try { assert.equal(waiting,true,'Second connection must actually wait on the row lock'); assert.equal(secondDone,false); } finally { release(); }
  const results=await Promise.all([first,second]); assert.deepEqual(results.map(r=>r.already_processed),[false,true]);
  assert.equal((await state()).logs,1); assert.equal((await db`select count(*)::int n from fila_espera`)[0].n,1);
});
test('forced queue failure rolls back appointment and queue together', async () => {
  await assert.rejects(asActor(reception, tx => arrival(tx), 'fila_espera'),code('P0001'));
  assert.deepEqual(await state(),{status:'confirmado',fila_status:null,logs:0,charts:0});
});
test('forced audit failure rolls back clinical mutations and patient counters', async () => {
  await db`insert into triage_settings(enabled) values(true)`;
  await assert.rejects(asActor(reception, tx => arrival(tx), 'action_logs'),code('P0001'));
  assert.deepEqual(await state(),{status:'confirmado',fila_status:null,logs:0,charts:0});
  assert.equal((await db`select total_faltas from pacientes`)[0].total_faltas,3);
});
test('authorization: anonymous, spoofed actor, wrong unit and scoped Master are refused', async () => {
  await assert.rejects(db`select confirmar_chegada_atendimento('ag1',${reception},'','u1','08:00')`,code('42501'));
  await assert.rejects(asActor(reception,tx=>arrival(tx,'ag1',reception2)),code('42501'));
  await assert.rejects(asActor(unitMaster,tx=>arrival(tx,'ag1',unitMaster)),code('42501'));
  await assert.rejects(asActor(reception,tx=>arrival(tx,'ag1',reception,false,'u2')),code('42501'));
  const anonymous=db.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE anon');return tx`select confirmar_chegada_atendimento('ag1',${reception},'','u1','08:00')`;});
  await assert.rejects(anonymous,code('42501'));
  assert.equal((await state()).logs,0);
  assert.equal((await asActor(globalMaster,tx=>arrival(tx,'ag1',globalMaster))).status,'apto_atendimento');
});
test('explicit permission denial wins over role defaults', async () => {
  await db`insert into permissoes_usuario values(${reception},'agenda','u1',false)`;
  await assert.rejects(asActor(reception,tx=>arrival(tx)),code('42501'));
});
async function prepareTriage() { await db`insert into triage_settings(enabled) values(true)`; await asActor(reception, tx=>arrival(tx)); }
test('triage validation rejects overflow before constrained column assignment', async () => {
  await prepareTriage();
  for(const invalid of [{peso:63000},{peso:9999},{altura:300},{temperatura:9999},{saturacao_oxigenio:101},{peso:400,altura:20},{frequencia_cardiaca:72.5}]) {
    await assert.rejects(asActor(triage,tx=>finish(tx,invalid)),code('23514'));
    assert.equal((await state()).charts,0); assert.equal((await state()).status,'confirmado_chegada');
  }
});
test('triage queue failure rolls back chart and both statuses; valid retry succeeds', async () => {
  await prepareTriage();
  await assert.rejects(asActor(triage,tx=>finish(tx), 'fila_espera'),code('P0001'));
  assert.deepEqual(await state(),{status:'confirmado_chegada',fila_status:'chegada_confirmada',logs:1,charts:0});
  const result=await asActor(triage,tx=>finish(tx)); assert.equal(result.status,'apto_atendimento');
  assert.equal((await state()).fila_status,'apto_atendimento'); assert.equal((await state()).logs,2);
});
test('triage audit failure also rolls back a preexisting draft without losing it', async () => {
  await prepareTriage();
  await asActor(triage,tx=>tx`select salvar_rascunho_triagem_atendimento('ag1',${triage},'{"peso":62}'::jsonb)`);
  await assert.rejects(asActor(triage,tx=>finish(tx), 'action_logs'),code('P0001'));
  const chart=(await db`select peso,confirmado_em from triage_records`)[0]; assert.equal(Number(chart.peso),62); assert.equal(chart.confirmado_em,null);
  assert.equal((await state()).status,'confirmado_chegada');
});
test('nursing route, repeated completion and stale draft preserve the confirmed chart', async () => {
  await prepareTriage();
  await asActor(triage,tx=>finish(tx,{peso:'63,0',altura:156},true));
  const second=await asActor(triage,tx=>finish(tx,{peso:99},false)); assert.equal(second.already_processed,true);
  assert.equal((await state()).status,'aguardando_enfermagem'); assert.equal((await state()).fila_status,'aguardando_enfermagem'); assert.equal((await state()).logs,2);
  await assert.rejects(asActor(triage,tx=>tx`select salvar_rascunho_triagem_atendimento('ag1',${triage},'{"peso":99}'::jsonb)`),code('23514'));
  assert.equal(Number((await db`select peso from triage_records`)[0].peso),63);
});
test('starting triage is atomic and repeatable without duplicate audit', async () => {
  await prepareTriage();
  const start=tx=>tx`select iniciar_triagem_atendimento('ag1',${triage}) as result`.then(r=>r[0].result);
  await assert.rejects(asActor(triage,start,'fila_espera'),code('P0001'));
  assert.equal((await state()).status,'confirmado_chegada');
  await asActor(triage,start); const repeat=await asActor(triage,start); assert.equal(repeat.already_processed,true);
  assert.equal((await state()).status,'aguardando_triagem'); assert.equal((await state()).fila_status,'aguardando_triagem'); assert.equal((await state()).logs,2);
});
test('manual reconciliation restores only a current missing/excluded queue, preserves metadata and audits once', async () => {
  await prepareTriage(); await db`update fila_espera set status='excluido_da_fila_triagem',prioridade='urgente',cid='M00'`;
  const result=await asActor(reception,tx=>arrival(tx,'ag1',reception,true)); assert.equal(result.reconciled,true);
  const row=(await db`select prioridade,cid,hora_chegada from fila_espera`)[0]; assert.deepEqual(row,{prioridade:'urgente',cid:'M00',hora_chegada:'08:00'});
  await asActor(reception,tx=>arrival(tx,'ag1',reception,true)); assert.equal((await state()).logs,2);
});
test('manual reconciliation refuses past dates, other roles and confirmed triage', async () => {
  await prepareTriage(); await db`delete from fila_espera`;
  await assert.rejects(asActor(triage,tx=>arrival(tx,'ag1',triage,true)),code('42501'));
  await db.unsafe(`update agendamentos set data=${today}-1`);
  await assert.rejects(asActor(reception,tx=>arrival(tx,'ag1',reception,true)),code('23514'));
  assert.equal((await state()).fila_status,null); assert.equal((await state()).logs,1);
});
test('server accepts equivalent integer decimals and recomputes IMC instead of trusting the client', async () => {
  await prepareTriage();
  await asActor(triage,tx=>finish(tx,{peso:'63.0',altura:156,frequencia_cardiaca:'72.0',saturacao_oxigenio:'98.0',imc:9999}));
  const chart=(await db`select imc,frequencia_cardiaca,saturacao_oxigenio from triage_records`)[0];
  assert.equal(Number(chart.imc),25.89);assert.equal(chart.frequencia_cardiaca,72);assert.equal(chart.saturacao_oxigenio,98);
});
test('a confirmed chart cannot be pushed back to triage by reconciliation', async () => {
  await prepareTriage();await asActor(triage,tx=>finish(tx));
  // Simulate a preexisting inconsistent legacy state only in this disposable fixture.
  await db`update agendamentos set status='confirmado_chegada'`;await db`delete from fila_espera`;
  await assert.rejects(asActor(reception,tx=>arrival(tx,'ag1',reception,true)),code('23514'));
  assert.equal((await state()).fila_status,null);assert.equal((await state()).logs,2);
});
test('conflicting queue identity is refused without overwriting its metadata', async () => {
  await db`insert into fila_espera(id,paciente_id,unidade_id,status,cid) values('ag1','other','u2','aguardando','X00')`;
  await assert.rejects(asActor(reception,tx=>arrival(tx)),code('23514'));
  assert.equal((await state()).status,'confirmado');assert.equal((await state()).logs,0);
  assert.equal((await db`select cid from fila_espera`)[0].cid,'X00');
});
test('a stale confirmation form cannot process an appointment reassigned to another patient',async()=>{
  await db`update agendamentos set paciente_id='p2'`;
  await assert.rejects(asActor(reception,tx=>arrival(tx)),code('23514'));
  assert.equal((await state()).status,'confirmado');assert.equal((await state()).logs,0);assert.equal((await state()).fila_status,null);
});
test('a clinical form cannot be recorded after reassignment to another patient',async()=>{
  await prepareTriage();await db`update agendamentos set paciente_id='p2'`;await db`update fila_espera set paciente_id='p2'`;
  await assert.rejects(asActor(triage,tx=>finish(tx,{peso:63,paciente_id_esperado:'p1'})),code('23514'));
  await assert.rejects(asActor(triage,tx=>tx`select iniciar_triagem_atendimento('ag1',${triage},'p1')`),code('23514'));
  assert.equal((await state()).charts,0);assert.equal((await state()).logs,1);
});
test('privileged internal functions are not directly callable and RPCs have a fixed search_path',async()=>{
  const functions=await db`select p.proname,p.proconfig,has_function_privilege('anon',p.oid,'execute') as anon,has_function_privilege('authenticated',p.oid,'execute') as staff from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('assert_care_flow_actor','validar_sinais_triagem','gravar_triagem_atendimento','confirmar_chegada_atendimento','concluir_triagem_atendimento','salvar_rascunho_triagem_atendimento','iniciar_triagem_atendimento')`;
  assert.equal(functions.length,7);
  for(const f of functions){assert.equal(f.anon,false);assert.ok(f.proconfig.includes('search_path=""'));assert.equal(f.staff,!['assert_care_flow_actor','validar_sinais_triagem','gravar_triagem_atendimento'].includes(f.proname));}
});
test('RPCs do not create any new application tables', async () => {
  const names=(await db`select tablename from pg_tables where schemaname='public' order by tablename`).map(r=>r.tablename);
  assert.deepEqual(names,['action_logs','agendamentos','fila_espera','funcionarios','pacientes','permissoes','permissoes_usuario','triage_records','triage_settings']);
});
