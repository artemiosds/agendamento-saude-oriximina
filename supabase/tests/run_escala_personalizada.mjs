// Isolated PostgreSQL, never connects to a hosted database.
// Set PGLITE_MODULE to an installed @electric-sql/pglite module if needed.
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(`
create role authenticated;
create role anon;
create schema auth;
grant usage on schema auth to authenticated;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.funcionarios(id uuid primary key,auth_user_id uuid,nome text,usuario text,email text,role text,unidade_id text,ativo boolean,custom_data jsonb not null default '{}');
create table public.unidades(id text primary key,nome text,ativo boolean default true);
create table public.disponibilidades(id text primary key,profissional_id text,unidade_id text,sala_id text,data_inicio date,data_fim date,hora_inicio text,hora_fim text,dias_semana int[]);
create table public.system_config(id text primary key,configuracoes jsonb);
alter table public.system_config enable row level security;
grant select,insert,update,delete on public.system_config to authenticated;
create policy existing_staff_access on public.system_config for all to authenticated using (true) with check (true);
create table public.action_logs(user_id text,user_nome text,role text,unidade_id text,acao text,entidade text,entidade_id text,modulo text,profissional_id text,detalhes jsonb);
`);
  const migration = readFileSync(new URL('../migrations/20261119170100_escala_personalizada_config_protegida.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  const result = await db.exec(readFileSync(new URL('./escala_personalizada_config.test.sql', import.meta.url), 'utf8'));
  if (!result.some(r => r.rows[0]?.roster_verified === true)) throw new Error('Roster fixture did not complete');
  const leftover = (await db.query('select count(*)::int as entries from public.system_config')).rows[0];
  if (leftover.entries) throw new Error('Synthetic records survived rollback');
  console.log('PASS: isolated PostgreSQL roster, audit, RLS, access by role and unit, overnight conflicts, and untouched agenda/configuration.');
} finally {
  await db.close();
}
