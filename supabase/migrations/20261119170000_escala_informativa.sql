-- Metadata for the roster only. No appointment availability is written.
create or replace function public.salvar_escala_informativa(
 p_profissional uuid, p_unidade text, p_sala text, p_data date,
 p_inicio time, p_fim time, p_semanal boolean, p_origem uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare actor public.funcionarios%rowtype; pessoa public.funcionarios%rowtype;
 itens jsonb; item jsonb; fonte jsonb;
begin
 select * into actor from public.funcionarios where auth_user_id=auth.uid() and ativo is true;
 if actor.id is null or actor.role is null or actor.role not in ('master','coordenador','gestao') then raise exception 'Gestão autorizada necessária' using errcode='42501'; end if;
 select * into pessoa from public.funcionarios where id=p_profissional and ativo and role='profissional' for update;
 if pessoa.id is null or not exists(select 1 from public.unidades where id=p_unidade and ativo)
 or (not (coalesce(actor.usuario,'')='admin.sms' and actor.role='master') and
 (actor.unidade_id is distinct from p_unidade or actor.unidade_id is distinct from pessoa.unidade_id))
 then raise exception 'Profissional ou unidade fora do escopo'; end if;
 if p_data is null or p_inicio is null or p_fim is null or p_inicio>=p_fim or p_semanal is null
 or (nullif(p_sala,'') is not null and not exists(select 1 from public.salas where id=p_sala and unidade_id=p_unidade and ativo))
 then raise exception 'Confira a data, a sala e o horário'; end if;
 itens=coalesce(pessoa.custom_data->'escala_informativa','[]');
 if p_origem is not null then
 select value into fonte from jsonb_array_elements(itens) where value->>'id'=p_origem::text and value->>'semanal'='true';
 if fonte is null or p_semanal or p_data<(fonte->>'data')::date or extract(dow from p_data)<>extract(dow from (fonte->>'data')::date)
 or (fonte->>'unidade'<>actor.unidade_id and not(actor.role='master' and coalesce(actor.usuario,'')='admin.sms')) then raise exception 'Escala original incompatível'; end if;
 end if;
 if exists(select 1 from public.disponibilidades d where d.profissional_id=p_profissional::text and
 (d.unidade_id<>p_unidade or coalesce(d.sala_id,'')<>coalesce(p_sala,'') or d.hora_inicio::time<>p_inicio or d.hora_fim::time<>p_fim)
 and d.hora_inicio::time<p_fim and d.hora_fim::time>p_inicio and extract(dow from p_data)::int=any(d.dias_semana)
 and (d.data_fim is null or d.data_fim>=p_data) and (p_semanal or d.data_inicio<=p_data))
 then raise exception 'Conflito com grade de agendamento no horário informado'; end if;
 for item in select value from jsonb_array_elements(itens) loop
 if item->>'id'=p_origem::text or (item->>'origem'=p_origem::text and item->>'data'=p_data::text) then continue; end if;
 if (item->>'inicio')::time<p_fim and (item->>'fim')::time>p_inicio
 and extract(dow from (item->>'data')::date)=extract(dow from p_data)
 and ((item->>'data')::date=p_data or (p_semanal and ((item->>'data')::date>=p_data or item->>'semanal'='true')) or (item->>'semanal'='true' and (item->>'data')::date<=p_data))
 then raise exception 'Já existe escala informativa nesse horário'; end if;
 end loop;
 select coalesce(jsonb_agg(value),'[]') into itens from jsonb_array_elements(itens)
 where (value->>'origem'=p_origem::text and value->>'data'=p_data::text) is not true;
 item=jsonb_build_object('id',gen_random_uuid(),'unidade',p_unidade,'sala',p_sala,'data',p_data,'inicio',to_char(p_inicio,'HH24:MI'),'fim',to_char(p_fim,'HH24:MI'),'semanal',p_semanal,'origem',p_origem,'autor',actor.id);
 update public.funcionarios set custom_data=jsonb_set(coalesce(custom_data,'{}'),'{escala_informativa}',itens||jsonb_build_array(item)) where id=p_profissional;
end $$;
revoke all on function public.salvar_escala_informativa(uuid,text,text,date,time,time,boolean,uuid) from public,anon;
grant execute on function public.salvar_escala_informativa(uuid,text,text,date,time,time,boolean,uuid) to authenticated;
