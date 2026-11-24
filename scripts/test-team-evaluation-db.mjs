// Run with PGLITE_MODULE_PATH pointing to an installed @electric-sql/pglite module.
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.auth_uid',true),'')::uuid $$;
create table funcionarios(id uuid primary key,auth_user_id uuid,nome text,usuario text,role text,ativo boolean,unidade_id text,profissao text,cargo text);
create table prontuarios(id uuid primary key default gen_random_uuid(),paciente_id text,paciente_nome text,profissional_id text,profissional_nome text,unidade_id text,status text,queixa_principal text,anamnese text,soap_avaliacao text,conduta text,evolucao text,data_atendimento date,hora_atendimento text,tipo_registro text,custom_data jsonb);
create table action_logs(user_id text,user_nome text,role text,unidade_id text,acao text,entidade text,entidade_id text,modulo text,detalhes jsonb);
insert into funcionarios values('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','Solicitante','prof1','profissional',true,'U','Fisioterapeuta',''),('22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','Parecerista','prof2','profissional',true,'U','Nutricionista',''),('33333333-3333-4333-8333-333333333333','33333333-3333-4333-8333-333333333333','Recepção','recep','recepcao',true,'U','',''),('44444444-4444-4444-8444-444444444444','44444444-4444-4444-8444-444444444444','Outra unidade','prof4','profissional',true,'V','Nutricionista','');
insert into prontuarios(id,paciente_id,paciente_nome,unidade_id,status,data_atendimento,queixa_principal) values('55555555-5555-4555-8555-555555555555','p','Fictício','U','finalizado',current_date,'Queixa registrada');`);
await db.exec(readFileSync(new URL('../supabase/migrations/20261124183016_team_evaluation_workflow.sql', import.meta.url),'utf8'));
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',r='66666666-6666-4666-8666-666666666666';
async function as(id){await db.query("select set_config('test.auth_uid',$1,false)",[id]);}
async function command(action,payload){return (await db.query('select team_evaluation_command($1,$2::jsonb) as result',[action,JSON.stringify(payload)])).rows[0].result;}
await as(a);
let request=await command('create',{id:r,source_id:'55555555-5555-4555-8555-555555555555',reason:'Avaliar alimentação',priority:'rotina',members:[{id:b,reason:'Avaliar ingestão',name:'FORJADO'}]});
assert.equal(request.members[0].name,'Parecerista');
assert.equal(request.version,1);
assert.equal((await command('create',{id:r})).id,r);
await assert.rejects(command('finish',{id:r,version:1,care_plan:'Plano'}),/pendentes/);
await assert.rejects(command('reply',{id:r,version:1,evaluation:'Não convidado'}),/solicitado/);
await as('33333333-3333-4333-8333-333333333333');await assert.rejects(command('reply',{id:r,version:1}),/restrito/);
await as('44444444-4444-4444-8444-444444444444');await assert.rejects(command('reply',{id:r,version:1}),/unidade/);
await as(b);request=await command('reply',{id:r,version:1,evaluation:'Avaliação própria',recommendations:'Orientações'});assert.equal(request.version,2);
await assert.rejects(command('reply',{id:r,version:1,evaluation:'Duplicado'}),/atualizada/);
await as(a);await assert.rejects(command('finish',{id:r,version:1,care_plan:'Plano'}),/atualizada/);
request=await command('finish',{id:r,version:2,care_plan:'Acompanhar e organizar retorno'});assert.equal(request.status,'concluida');
await assert.rejects(command('finish',{id:r,version:3,care_plan:'Novo'}),/concluída/);
assert.equal((await db.query('select count(*)::int as n from prontuarios')).rows[0].n,3);
assert.equal((await db.query('select count(*)::int as n from action_logs')).rows[0].n,3);
console.log('PASS: solicitação idempotente, identidade do servidor, escopo de unidade, recepção bloqueada, parecer individual, versões, conclusão, prontuário e auditoria.');
// SELECT is scoped by RLS; authenticated clients cannot write tables directly.
await db.exec('grant usage on schema auth to authenticated; grant select on funcionarios to authenticated; set role authenticated;');
await as('44444444-4444-4444-8444-444444444444');
assert.equal((await db.query('select count(*)::int as n from team_evaluation_requests')).rows[0].n,0);
await as(a);assert.equal((await db.query('select count(*)::int as n from team_evaluation_requests')).rows[0].n,1);
await assert.rejects(db.exec("update team_evaluation_requests set care_plan='forjado'"),/permission denied/);
await db.exec('reset role');
// An audit failure rolls back the opinion AND its clinical history entry.
const retry='77777777-7777-4777-8777-777777777777';
await as(a); await command('create',{id:retry,source_id:'55555555-5555-4555-8555-555555555555',reason:'Nova avaliação',priority:'rotina',members:[{id:b,reason:'Avaliar'}]});
await db.exec("create function fail_team_audit() returns trigger language plpgsql as $$ begin if new.acao='team_evaluation_reply' then raise exception 'Falha simulada'; end if; return new; end $$; create trigger fail_audit before insert on action_logs for each row execute function fail_team_audit();");
await as(b); await assert.rejects(command('reply',{id:retry,version:1,evaluation:'Não pode persistir parcialmente'}),/Falha simulada/);
const unchanged=(await db.query('select version,opinions from team_evaluation_requests where id=$1',[retry])).rows[0];
assert.equal(unchanged.version,1);assert.deepEqual(unchanged.opinions,[]);
assert.equal((await db.query('select count(*)::int as n from prontuarios')).rows[0].n,3);
console.log('PASS: RLS por unidade, gravação direta bloqueada e rollback completo quando auditoria falha.');
await db.close();
