// Disposable PostgreSQL only. Synthetic fixtures; never connects to Lovable Cloud.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const prof='11111111-1111-4111-8111-111111111111', master='22222222-2222-4222-8222-222222222222';
const global='33333333-3333-4333-8333-333333333333', other='44444444-4444-4444-8444-444444444444';
const triage='55555555-5555-4555-8555-555555555555', inactive='66666666-6666-4666-8666-666666666666';
let checks=0;
const actor = async id => { await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); };
const start = async (id,room='s1',patient='p1') => (await db.query('select public.start_clinical_attendance($1,$2,$3) result',[id,patient,room])).rows[0].result;
const expectCode = async (fn,code) => { await assert.rejects(fn,e=>e.code===code); checks++; };
try {
  await db.exec(readFileSync('tests/sql/care_flow_schema.sql','utf8'));
  await db.exec(`alter table public.funcionarios add column setor text default '';
    create table public.salas(id text primary key,nome text,unidade_id text,ativo boolean);
    create table public.atendimentos(id uuid primary key,agendamento_id text,paciente_id text,paciente_nome text,
      profissional_id text,profissional_nome text,unidade_id text,sala_id text,setor text,procedimento text,observacoes text,
      data date,hora_inicio text,hora_fim text,status text,criado_em timestamptz default now(),duracao_minutos integer);
    create function public.is_staff_member() returns boolean language sql stable security definer set search_path='' as
      $$select exists(select 1 from public.funcionarios where auth_user_id=auth.uid() and ativo)$$;
    create function public.is_global_owner() returns boolean language sql stable security definer set search_path='' as
      $$select exists(select 1 from public.funcionarios where auth_user_id=auth.uid() and ativo and usuario='admin.sms')$$;
    grant select on public.funcionarios,public.salas to authenticated;
    grant select,insert,update on public.agendamentos,public.atendimentos,public.fila_espera,public.triage_records,public.action_logs to authenticated;
    alter table public.atendimentos enable row level security;
    create policy staff on public.atendimentos to authenticated using(public.is_staff_member());
    insert into public.funcionarios(id,auth_user_id,ativo,nome,usuario,unidade_id,role) values
      ('${prof}','${prof}',true,'Profissional teste','prof','u1','profissional'),
      ('${master}','${master}',true,'Master local','master','u1','master'),
      ('${global}','${global}',true,'Global','admin.sms','','master'),
      ('${other}','${other}',true,'Outro profissional','outro','u2','profissional'),
      ('${triage}','${triage}',true,'Triagem teste','triagem','u1','triagem'),
      ('${inactive}','${inactive}',false,'Inativo','inativo','u1','profissional');
    insert into public.salas values('s1','Sala 1','u1',true),('s2','Sala 2','u2',true),('inativa','Inativa','u1',false);
    insert into public.agendamentos(id,paciente_id,paciente_nome,unidade_id,profissional_id,data,status)
    select id,'p1','Pessoa teste',case when id='outra-unidade' then 'u2' else 'u1' end,'${prof}',
      (now() at time zone 'America/Sao_Paulo')::date + case when id='futuro' then 1 else 0 end,
      case when id='triagem' then 'confirmado_chegada' else 'apto_atendimento' end
    from unnest(array['normal','falha','sem-sala','outra-unidade','futuro','triagem','bloqueio-rls','fila-divergente']) id;
    insert into public.fila_espera(id,paciente_id,unidade_id,status,hora_chegada)
    select id,paciente_id,unidade_id,status,'08:00' from public.agendamentos;
    update public.fila_espera set paciente_id='outro' where id='fila-divergente';`);
  await db.exec(readFileSync('supabase/migrations/20261023035237_atomic_reception_triage.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261123130000_cockpit_clinical_start.sql','utf8'));
  await db.exec('set role authenticated');
  await actor(prof);
  let r=await start('normal');
  assert.equal(r.status,'em_atendimento'); assert.equal(r.agendamento.sala_id,'s1'); assert.ok(r.iniciado_em); checks++;
  const repeated=await start('normal','s2');
  assert.equal(repeated.already_processed,true); assert.equal(repeated.atendimento_id,r.atendimento_id); assert.equal(repeated.agendamento.sala_id,'s1'); checks++;
  await expectCode(()=>start('sem-sala','s2'),'23514');
  await expectCode(()=>start('sem-sala','inativa'),'23514');
  await expectCode(()=>start('sem-sala','s1','paciente-errado'),'23514');
  await expectCode(()=>start('outra-unidade'),'42501');
  await expectCode(()=>start('futuro'),'23514');
  await expectCode(()=>start('triagem'),'23514');
  await expectCode(()=>start('fila-divergente'),'23514');
  await actor(other); await expectCode(()=>start('sem-sala'),'42501');
  await actor(inactive); await expectCode(()=>start('sem-sala'),'42501');
  await actor(''); await expectCode(()=>start('sem-sala'),'42501');
  await actor(master); r=await start('sem-sala',''); assert.equal(r.agendamento.sala_id,''); checks++;
  await expectCode(()=>start('outra-unidade','s2'),'42501');
  await actor(global); r=await start('outra-unidade','s2'); assert.equal(r.agendamento.unidade_id,'u2'); checks++;
  await db.exec('reset role');
  await db.exec(`create function public.force_start_failure() returns trigger language plpgsql as $$begin
    if new.agendamento_id='falha' then raise exception 'Forced audit failure'; end if; return new; end$$;
    create trigger force_start_failure before insert on public.action_logs for each row execute function public.force_start_failure();`);
  await db.exec('set role authenticated'); await actor(prof);
  await expectCode(()=>start('falha'),'P0001');
  let state=(await db.query("select a.status,(select count(*) from public.atendimentos where agendamento_id=a.id)::int total from public.agendamentos a where id='falha'")).rows[0];
  assert.equal(state.status,'apto_atendimento'); assert.equal(state.total,0); checks++;
  await db.exec('reset role');
  await db.exec(`create policy reject_start on public.atendimentos as restrictive for insert to authenticated with check(agendamento_id<>'bloqueio-rls');`);
  await db.exec('set role authenticated'); await actor(prof);
  await expectCode(()=>start('bloqueio-rls'),'42501');
  state=(await db.query("select status from public.agendamentos where id='bloqueio-rls'")).rows[0]; assert.equal(state.status,'apto_atendimento'); checks++;
  await actor(triage);
  const begin=()=>db.query('select public.iniciar_triagem_atendimento($1,$2,$3) result',['triagem',triage,'p1']);
  r=(await begin()).rows[0].result; assert.equal(r.status,'aguardando_triagem'); checks++;
  let record=(await db.query("select iniciado_em,confirmado_em,peso from public.triage_records where agendamento_id='triagem'")).rows[0];
  assert.ok(record.iniciado_em); assert.equal(record.confirmado_em,null); assert.equal(record.peso,null); checks++;
  const oldStart=record.iniciado_em.toISOString();
  await db.query("select public.salvar_rascunho_triagem_atendimento('triagem',$1,'{\"peso\":63,\"altura\":170}')",[triage]);
  await begin();
  record=(await db.query("select iniciado_em,peso from public.triage_records where agendamento_id='triagem'")).rows[0];
  assert.equal(record.iniciado_em.toISOString(),oldStart); assert.equal(Number(record.peso),63); checks++;
  await db.query("select public.concluir_triagem_atendimento('triagem',$1,'{\"peso\":63,\"altura\":170}',false)",[triage]);
  await expectCode(begin,'23514');
  await db.exec('reset role');
  await db.exec(`create table public.treatment_cycles(id uuid primary key,unit_id text,patient_id text,professional_id text,
    sessions_done integer,updated_at timestamptz,status text);
    create table public.treatment_sessions(id uuid primary key,appointment_id text,cycle_id uuid,patient_id text,
      professional_id text,scheduled_date date,status text);
    grant select,update on public.treatment_cycles,public.treatment_sessions to authenticated;`);
  await db.exec(readFileSync('supabase/migrations/20261122133000_sync_cycle_counter_on_attendance_completion.sql','utf8'));
  await db.exec('set role authenticated'); await actor(prof);
  const finished=(await db.query("select public.complete_clinical_attendance('normal','10:30',30,'u1',$1) result",[prof])).rows[0].result;
  assert.equal(finished.status,'concluido');
  state=(await db.query("select a.status,t.status attendance from public.agendamentos a join public.atendimentos t on t.agendamento_id=a.id where a.id='normal'")).rows[0];
  assert.equal(state.status,'concluido'); assert.equal(state.attendance,'finalizado'); checks++;
  console.log(`${checks} verificações PostgreSQL passaram: escopo, atomicidade, idempotência e início real da triagem.`);
} finally { await db.close(); }
