-- Fase 1: funções privadas, sem alterações nos registros existentes.
BEGIN;
CREATE SCHEMA IF NOT EXISTS escala_guard;
REVOKE ALL ON SCHEMA escala_guard FROM PUBLIC, anon, authenticated;
-- Shared serialization for informative shifts and changes of grade schedules.
CREATE OR REPLACE FUNCTION escala_guard.overlap(
 a_start date,a_end date,a_weekly boolean,a_min integer,a_duration integer,a_skip date[],
 b_start date,b_end date,b_weekly boolean,b_min integer,b_duration integer,b_skip date[])
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $f$
DECLARE delta integer; lo date; hi date; candidate date;
BEGIN
 IF a_start IS NULL OR b_start IS NULL OR a_duration NOT BETWEEN 1 AND 1440 OR b_duration NOT BETWEEN 1 AND 1440 THEN RETURN false; END IF;
 FOR delta IN -1..1 LOOP
  IF delta*1440+b_min>=a_min+a_duration OR delta*1440+b_min+b_duration<=a_min THEN CONTINUE; END IF;
  IF extract(dow from a_start)::int <> ((extract(dow from b_start)::int-delta+7)%7) THEN CONTINUE; END IF;
  lo:=greatest(a_start,b_start-delta);
  hi:=least(CASE WHEN a_weekly THEN coalesce(a_end,'infinity'::date) ELSE a_start END,CASE WHEN b_weekly THEN coalesce(b_end,'infinity'::date) ELSE b_start END-delta);
  candidate:=lo+((extract(dow from a_start)::int-extract(dow from lo)::int+7)%7);
  WHILE candidate<=hi LOOP
   IF NOT (candidate=ANY(coalesce(a_skip,ARRAY[]::date[]))) AND NOT (candidate+delta=ANY(coalesce(b_skip,ARRAY[]::date[]))) THEN RETURN true; END IF;
   candidate:=candidate+7;
  END LOOP;
 END LOOP;
 RETURN false;
END;$f$;
CREATE OR REPLACE FUNCTION escala_guard.exceptions(items jsonb, record_id text)
RETURNS date[] LANGUAGE sql IMMUTABLE SET search_path='' AS $f$
 SELECT coalesce(array_agg((e->>'data')::date),ARRAY[]::date[]) FROM jsonb_array_elements(items) e WHERE e->>'origem'=record_id
$f$;
CREATE OR REPLACE FUNCTION escala_guard.grade_conflict(
 items jsonb, person text, unit text, grade_start date, grade_end date,
 weekday_list integer[], grade_min integer, grade_duration integer)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $f$
DECLARE e jsonb; wd integer; first_date date; manual_min integer; manual_duration integer; official_unit text;
BEGIN
 IF grade_duration NOT BETWEEN 1 AND 1440 OR grade_start IS NULL OR NOT isfinite(grade_start) THEN RETURN false; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(items) LOOP
  IF e->>'profissional' IS DISTINCT FROM person THEN CONTINUE; END IF;
  manual_min:=extract(epoch from (e->>'inicio')::time)::int/60;
  manual_duration:=coalesce((e->>'duracao')::int,extract(epoch from (e->>'fim')::time-(e->>'inicio')::time)::int/60);
  official_unit:=nullif(e->>'unidade_oficial','');
  IF official_unit IS NOT DISTINCT FROM unit AND manual_min=grade_min AND manual_duration=grade_duration THEN CONTINUE; END IF;
  FOREACH wd IN ARRAY coalesce(weekday_list,ARRAY[]::integer[]) LOOP
   IF wd NOT BETWEEN 0 AND 6 THEN CONTINUE; END IF;
   first_date:=grade_start+((wd-extract(dow from grade_start)::int+7)%7);
   IF first_date>coalesce(grade_end,'infinity'::date) THEN CONTINUE; END IF;
   IF escala_guard.overlap(first_date,grade_end,true,grade_min,grade_duration,ARRAY[]::date[],
      (e->>'data')::date,(e->>'fim_recorrencia')::date,coalesce((e->>'semanal')::boolean,false),manual_min,manual_duration,
      escala_guard.exceptions(items,e->>'id')) THEN RETURN true; END IF;
  END LOOP;
 END LOOP;
 RETURN false;
END;$f$;
CREATE OR REPLACE FUNCTION escala_guard.protect_grade()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE items jsonb; legacy jsonb;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF (NEW.profissional_id,NEW.unidade_id,NEW.data_inicio,NEW.data_fim,NEW.dias_semana,NEW.hora_inicio,NEW.hora_fim)
   IS NOT DISTINCT FROM (OLD.profissional_id,OLD.unidade_id,OLD.data_inicio,OLD.data_fim,OLD.dias_semana,OLD.hora_inicio,OLD.hora_fim) THEN RETURN NEW; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('escala_profissionais_guard_v1',0));
 SELECT coalesce(configuracoes->'escalas_personalizadas','[]'::jsonb) INTO items FROM public.system_config WHERE id='escalas_personalizadas';
 items:=coalesce(items,'[]'::jsonb);
 SELECT custom_data->'escala_informativa' INTO legacy FROM public.funcionarios WHERE id::text=NEW.profissional_id;
 IF jsonb_typeof(legacy)='array' THEN
   SELECT items||coalesce(jsonb_agg(e||jsonb_build_object('profissional',NEW.profissional_id,'unidade_oficial',CASE WHEN nullif(e->>'local_avulso','') IS NULL THEN e->>'unidade' ELSE NULL END)),'[]'::jsonb) INTO items FROM jsonb_array_elements(legacy) e;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(items) e WHERE e->>'profissional'=NEW.profissional_id) THEN RETURN NEW; END IF;
 IF escala_guard.grade_conflict(items,NEW.profissional_id,NEW.unidade_id,NEW.data_inicio,NEW.data_fim,NEW.dias_semana,extract(epoch from NEW.hora_inicio::time)::int/60,extract(epoch from NEW.hora_fim::time-NEW.hora_inicio::time)::int/60) THEN
  RAISE EXCEPTION 'Conflito com uma escala informativa do profissional. Confira os horários antes de alterar a grade.' USING ERRCODE='23P01';
 END IF;
 RETURN NEW;
END;$f$;
-- Same permission precedence used by the existing Disponibilidade module.
CREATE OR REPLACE FUNCTION escala_guard.may_write(actor public.funcionarios,action text)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $f$
DECLARE module_name text:='disponibilidade'; raw_role text:=lower(btrim(actor.role)); profile text; result boolean;
BEGIN
 IF raw_role='master' THEN RETURN true; END IF;
 IF raw_role NOT IN ('gestao','coordenador') OR action NOT IN ('can_view','can_create','can_edit','can_delete') THEN RETURN false; END IF;
 profile:='gestao';
 IF NOT EXISTS(SELECT 1 FROM public.permissoes p WHERE p.perfil IN (profile,raw_role) AND p.modulo=module_name AND p.unidade_id IN (coalesce(actor.unidade_id,''),''))
 AND NOT EXISTS(SELECT 1 FROM public.permissoes_usuario u WHERE u.user_id=actor.id::text AND u.modulo=module_name AND u.unidade_id IN (coalesce(actor.unidade_id,''),'')) THEN
  module_name:='usuarios';
 END IF;
 SELECT (v.value)::boolean INTO result FROM (
   SELECT to_jsonb(u)->>action AS value, CASE WHEN u.unidade_id<>'' THEN 1 ELSE 2 END AS priority, 0 AS role_priority
   FROM public.permissoes_usuario u WHERE u.user_id=actor.id::text AND u.modulo=module_name AND u.unidade_id IN (coalesce(actor.unidade_id,''),'')
   UNION ALL
   SELECT to_jsonb(p)->>action,CASE WHEN p.unidade_id<>'' THEN 3 ELSE 4 END,CASE WHEN p.perfil=profile THEN 0 ELSE 1 END
   FROM public.permissoes p WHERE p.perfil IN (profile,raw_role) AND p.modulo=module_name AND p.unidade_id IN (coalesce(actor.unidade_id,''),'')
 ) v WHERE v.value IS NOT NULL ORDER BY v.priority,v.role_priority LIMIT 1;
 RETURN coalesce(result,module_name='usuarios' AND action IN ('can_view','can_create','can_edit'));
END;$f$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA escala_guard FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.salvar_escalas_personalizadas(p_profissional uuid, p_unidade text, p_local text, p_setor text, p_datas date[], p_inicio time without time zone, p_duracao integer, p_semanal boolean, p_origem uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor public.funcionarios%rowtype;
  pessoa public.funcionarios%rowtype;
  global_admin boolean;
  unidade text;
  unidade_oficial text := nullif(p_unidade, '');
  local_nome text := nullif(btrim(p_local), '');
  setor_nome text := nullif(btrim(p_setor), '');
  datas date[];
  dia date;
  inicio_min integer;
  itens jsonb;
  outros jsonb;
  novos jsonb := '[]'::jsonb;
  fonte jsonb;
begin
  select * into actor from public.funcionarios where auth_user_id = auth.uid() and ativo is true;
  if actor.id is null or coalesce(actor.role, '') not in ('master', 'coordenador', 'gestao') then
    raise exception 'Seu perfil não pode cadastrar escalas informativas.' using errcode = '42501';
  end if;
  if not escala_guard.may_write(actor,'can_view') or not escala_guard.may_write(actor,case when p_origem is null then 'can_create' else 'can_edit' end) then
    raise exception 'Seu perfil não possui permissão para esta ação na disponibilidade.' using errcode='42501';
  end if;
  global_admin := actor.usuario is not distinct from 'admin.sms' and actor.role = 'master';
  select * into pessoa from public.funcionarios where id = p_profissional and ativo and role = 'profissional';
  if pessoa.id is null or (not global_admin and
       (nullif(actor.unidade_id, '') is null or pessoa.unidade_id is distinct from actor.unidade_id)) then
    raise exception 'Profissional fora do escopo da sua unidade.' using errcode = '42501';
  end if;
  unidade := coalesce(unidade_oficial, pessoa.unidade_id, '');
  if unidade_oficial is not null and
     (not exists (select 1 from public.unidades where id = unidade_oficial and ativo)
       or (not global_admin and unidade_oficial is distinct from actor.unidade_id)) then
    raise exception 'A unidade cadastrada está fora do seu escopo.' using errcode = '42501';
  end if;
  if local_nome is null or char_length(local_nome) > 100 or local_nome ~ '[[:cntrl:]]'
    or char_length(setor_nome) > 100 or setor_nome ~ '[[:cntrl:]]' then
    raise exception 'Informe o local e use até 100 caracteres em cada campo.' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_datas), 0) not between 1 and 90 or array_position(p_datas, null) is not null
    or p_inicio is null or p_inicio >= '24:00'::time or extract(second from p_inicio) <> 0
    or p_duracao is null or p_duracao not between 1 and 1440 or p_semanal is null then
    raise exception 'Selecione de 1 a 90 dias e informe um turno de até 24 horas.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_datas) as d(data) where not isfinite(d.data)) then
    raise exception 'Confira as datas selecionadas.' using errcode = '22023';
  end if;
  if p_semanal then
    select array_agg(selecionado order by selecionado) into datas from (
      select min(d.data) as selecionado from unnest(p_datas) as d(data) group by extract(dow from d.data)
    ) primeira_por_dia_semana;
  else
    select array_agg(distinct d.data order by d.data) into datas from unnest(p_datas) as d(data);
  end if;
  inicio_min := extract(epoch from p_inicio)::integer / 60;

  perform pg_advisory_xact_lock(hashtextextended('escala_profissionais_guard_v1',0));
  insert into public.system_config (id, configuracoes)
    values ('escalas_personalizadas', '{"escalas_personalizadas":[]}'::jsonb) on conflict (id) do nothing;
  select coalesce(configuracoes->'escalas_personalizadas', '[]'::jsonb) into itens
    from public.system_config where id = 'escalas_personalizadas' for update;
  select coalesce(jsonb_agg(e), '[]'::jsonb) into outros
    from jsonb_array_elements(itens) e where e->>'profissional' = p_profissional::text;
  if p_origem is not null then
    select e into fonte from jsonb_array_elements(outros) e
      where e->>'id' = p_origem::text and e->>'semanal' = 'true';
    if fonte is null or p_semanal
       or (not global_admin and fonte->>'unidade' is distinct from actor.unidade_id) then
      raise exception 'Selecione uma escala semanal válida para alterar ocorrências.' using errcode = '22023';
    end if;
  end if;
  -- The original informative entries remain readable; they also still prevent double shifts.
  if jsonb_typeof(pessoa.custom_data->'escala_informativa') = 'array' then
    outros := outros || (pessoa.custom_data->'escala_informativa');
  end if;

  foreach dia in array datas loop
    if p_origem is not null and
      (dia < (fonte->>'data')::date or dia > coalesce((fonte->>'fim_recorrencia')::date,'infinity'::date) or extract(dow from dia) <> extract(dow from (fonte->>'data')::date)) then
      raise exception 'A data % não corresponde ao dia da escala original.', to_char(dia, 'DD/MM/YYYY') using errcode = '22023';
    end if;
    -- Examine only the preceding, selected and next dates; a shift spans at most 24h.
    if exists (
      select 1
      from public.disponibilidades d
      cross join generate_series(-1, 1) as n(delta)
      cross join lateral (select dia + n.delta as dia_grade) as a
      cross join lateral (select greatest(a.dia_grade, d.data_inicio) as inicio_periodo) as b
      where d.profissional_id = p_profissional::text
        and not (n.delta = 0 and d.unidade_id is not distinct from unidade_oficial
          and d.hora_inicio::time = p_inicio
          and extract(epoch from d.hora_fim::time - d.hora_inicio::time)::integer / 60 = p_duracao)
        and extract(dow from a.dia_grade)::int = any(d.dias_semana)
        and d.hora_inicio::time < d.hora_fim::time
        and n.delta * 1440 + extract(epoch from d.hora_inicio::time) / 60 < inicio_min + p_duracao
        and n.delta * 1440 + extract(epoch from d.hora_fim::time) / 60 > inicio_min
        and ((not p_semanal and a.dia_grade >= d.data_inicio and (d.data_fim is null or a.dia_grade <= d.data_fim))
          or (p_semanal and (d.data_fim is null or b.inicio_periodo +
               ((extract(dow from a.dia_grade)::int - extract(dow from b.inicio_periodo)::int + 7) % 7) <= d.data_fim)))
    ) then
      raise exception 'Conflito com a grade de atendimento em %. Nenhum dia foi salvo.', to_char(dia, 'DD/MM/YYYY');
    end if;
    if exists (
      select 1 from jsonb_array_elements(outros || novos) e
      where not ((e->>'id' = p_origem::text or (e->>'origem' = p_origem::text and (e->>'data')::date = dia)) is true)
        and escala_guard.overlap(dia,null,p_semanal,inicio_min,p_duracao,ARRAY[]::date[],
          (e->>'data')::date,(e->>'fim_recorrencia')::date,coalesce((e->>'semanal')::boolean,false),
          extract(epoch from (e->>'inicio')::time)::int/60,
          coalesce((e->>'duracao')::int,extract(epoch from (e->>'fim')::time-(e->>'inicio')::time)::int/60),
          escala_guard.exceptions(outros || novos,e->>'id'))
    ) then
      raise exception 'Já existe uma escala nesse horário em %. Nenhum dia foi salvo.', to_char(dia, 'DD/MM/YYYY') using errcode='23P01';
    end if;
    novos := novos || jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'profissional', p_profissional, 'unidade', unidade,
      'unidade_oficial', unidade_oficial, 'local', local_nome, 'setor', setor_nome,
      'data', dia, 'inicio', to_char(date '2000-01-01' + p_inicio, 'HH24:MI'),
      'fim', to_char(date '2000-01-01' + p_inicio + make_interval(mins => p_duracao), 'HH24:MI'),
      'duracao', p_duracao, 'semanal', p_semanal, 'origem', p_origem, 'autor', actor.id, 'criado_em', now()
    ));
  end loop;
  if p_origem is not null then
    select coalesce(jsonb_agg(e), '[]'::jsonb) into itens from jsonb_array_elements(itens) e
      where (e->>'origem' = p_origem::text and (e->>'data')::date = any(datas)) is not true;
  end if;
  update public.system_config set configuracoes = jsonb_set(configuracoes, '{escalas_personalizadas}', itens || novos)
    where id = 'escalas_personalizadas';
  insert into public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,profissional_id,detalhes)
  values(actor.id::text,actor.nome,actor.role,unidade,'salvar','escala_personalizada',novos->0->>'id','escalas_profissionais',
    p_profissional::text,jsonb_build_object('datas',datas,'local',local_nome,'setor',setor_nome,'inicio',p_inicio,
      'duracao_minutos',p_duracao,'semanal',p_semanal,'origem',p_origem));
  return cardinality(datas);
end
$function$
;
CREATE OR REPLACE FUNCTION public.remover_escala_personalizada(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor public.funcionarios%rowtype;
  itens jsonb;
  alvo jsonb;
begin
  select * into actor from public.funcionarios where auth_user_id = auth.uid() and ativo is true;
  if actor.id is null or coalesce(actor.role, '') not in ('master', 'coordenador', 'gestao') then
    raise exception 'Seu perfil não pode remover escalas informativas.' using errcode = '42501';
  end if;
  if not escala_guard.may_write(actor,'can_view') or not escala_guard.may_write(actor,'can_delete') then raise exception 'Remoção não autorizada na disponibilidade.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('escala_profissionais_guard_v1',0));
  select configuracoes->'escalas_personalizadas' into itens from public.system_config
    where id = 'escalas_personalizadas' for update;
  select e into alvo from jsonb_array_elements(itens) e
    where e->>'id' = p_id::text and (actor.usuario is not distinct from 'admin.sms' and actor.role = 'master'
      or (nullif(actor.unidade_id, '') is not null and e->>'unidade' = actor.unidade_id));
  if alvo is null then raise exception 'Escala não encontrada no seu escopo.' using errcode = '42501'; end if;
  if alvo->>'semanal'='true' or (alvo->>'data')::date < (clock_timestamp() at time zone 'America/Santarem')::date then
    raise exception 'Preserve o histórico: encerre a recorrência ou consulte a escala anterior.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(e), '[]'::jsonb) into itens from jsonb_array_elements(itens) e where e->>'id' <> p_id::text;
  update public.system_config set configuracoes = jsonb_set(configuracoes, '{escalas_personalizadas}', itens)
    where id = 'escalas_personalizadas';
  insert into public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,profissional_id,detalhes)
  values(actor.id::text,actor.nome,actor.role,alvo->>'unidade','remover','escala_personalizada',p_id::text,
    'escalas_profissionais',alvo->>'profissional',jsonb_build_object('escala_removida',alvo));
end
$function$
;
CREATE OR REPLACE FUNCTION public.encerrar_escala_personalizada(p_id uuid,p_primeiro_dia_sem_escala date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE actor public.funcionarios%rowtype; items jsonb; target jsonb; last_day date;
BEGIN
 SELECT * INTO actor FROM public.funcionarios WHERE auth_user_id=auth.uid() AND ativo IS TRUE;
 IF actor.id IS NULL OR coalesce(actor.role,'') NOT IN ('master','coordenador','gestao') THEN RAISE EXCEPTION 'Seu perfil não pode encerrar escalas.' USING ERRCODE='42501'; END IF;
 IF NOT escala_guard.may_write(actor,'can_view') OR NOT escala_guard.may_write(actor,'can_edit') THEN RAISE EXCEPTION 'Encerramento não autorizado na disponibilidade.' USING ERRCODE='42501'; END IF;
 IF p_primeiro_dia_sem_escala IS NULL OR NOT isfinite(p_primeiro_dia_sem_escala) OR p_primeiro_dia_sem_escala<(clock_timestamp() AT TIME ZONE 'America/Santarem')::date THEN RAISE EXCEPTION 'O encerramento não pode alterar datas passadas.' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('escala_profissionais_guard_v1',0));
 SELECT configuracoes->'escalas_personalizadas' INTO items FROM public.system_config WHERE id='escalas_personalizadas' FOR UPDATE;
 SELECT e INTO target FROM jsonb_array_elements(items) e WHERE e->>'id'=p_id::text AND e->>'semanal'='true' AND (actor.usuario='admin.sms' AND actor.role='master' OR nullif(actor.unidade_id,'') IS NOT NULL AND e->>'unidade'=actor.unidade_id);
 IF target IS NULL THEN RAISE EXCEPTION 'Série não encontrada no seu escopo.' USING ERRCODE='42501'; END IF;
 last_day:=p_primeiro_dia_sem_escala-1;
 IF target->>'fim_recorrencia' IS NOT NULL AND last_day >= (target->>'fim_recorrencia')::date THEN RAISE EXCEPTION 'Esta série já está encerrada nessa data ou antes.' USING ERRCODE='22023'; END IF;
 SELECT jsonb_agg(CASE WHEN e->>'id'=p_id::text THEN e||jsonb_build_object('fim_recorrencia',last_day,'encerrado_por',actor.id,'encerrado_em',now()) ELSE e END ORDER BY ord) INTO items FROM jsonb_array_elements(items) WITH ORDINALITY t(e,ord);
 UPDATE public.system_config SET configuracoes=jsonb_set(configuracoes,'{escalas_personalizadas}',items) WHERE id='escalas_personalizadas';
 INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,profissional_id,detalhes)
 VALUES(actor.id::text,actor.nome,actor.role,target->>'unidade','encerrar','escala_personalizada',p_id::text,'escalas_profissionais',target->>'profissional',jsonb_build_object('antes',target,'ultimo_dia',last_day));
END;$f$;
REVOKE ALL ON FUNCTION public.encerrar_escala_personalizada(uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.encerrar_escala_personalizada(uuid,date) TO authenticated;
DROP TRIGGER IF EXISTS trg_escala_guard_grade ON public.disponibilidades;
CREATE TRIGGER trg_escala_guard_grade BEFORE INSERT OR UPDATE ON public.disponibilidades FOR EACH ROW EXECUTE FUNCTION escala_guard.protect_grade();
COMMIT;
