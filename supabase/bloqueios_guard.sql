BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';
CREATE SCHEMA IF NOT EXISTS bloqueio_guard;
REVOKE ALL ON SCHEMA bloqueio_guard FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA bloqueio_guard TO authenticated;
CREATE OR REPLACE FUNCTION bloqueio_guard.allowed(u text,pr text,creator text,action text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.funcionarios%ROWTYPE; raw_role text; profile text; mod text:='feriados_bloqueios'; field text; ok boolean;
BEGIN
 IF auth.uid() IS NULL OR action NOT IN ('can_create','can_edit','can_delete') THEN RETURN false; END IF;
 SELECT * INTO a FROM public.funcionarios WHERE auth_user_id=auth.uid() AND ativo LIMIT 1;
 IF NOT FOUND THEN RETURN false; END IF;
 raw_role:=lower(trim(a.role)); profile:=CASE WHEN raw_role IN ('gestão','gestor','coordenacao','coordenador') THEN 'gestao' ELSE raw_role END;
 IF profile NOT IN ('master','gestao') THEN RETURN false; END IF;
 IF action='can_create' AND creator IS DISTINCT FROM a.id::text THEN RETURN false; END IF;
 IF profile='master' AND a.usuario='admin.sms' THEN RETURN true; END IF;
 IF coalesce(a.unidade_id,'')='' OR u IS DISTINCT FROM a.unidade_id THEN RETURN false; END IF;
 IF coalesce(pr,'')<>'' AND NOT EXISTS(SELECT 1 FROM public.funcionarios f WHERE f.id::text=pr AND f.unidade_id=a.unidade_id) THEN RETURN false; END IF;
 IF profile='master' THEN RETURN true; END IF;
 IF action IN ('can_edit','can_delete') AND creator IS DISTINCT FROM a.id::text THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.permissoes_usuario p WHERE p.user_id=a.id::text AND p.modulo=mod AND p.unidade_id IN (a.unidade_id,''))
 AND NOT EXISTS(SELECT 1 FROM public.permissoes p WHERE p.perfil IN (profile,raw_role) AND p.modulo=mod AND p.unidade_id IN (a.unidade_id,'')) THEN mod:='agenda'; END IF;
 FOREACH field IN ARRAY ARRAY['can_view',action] LOOP
 SELECT coalesce(
 (SELECT (to_jsonb(p)->>field)::boolean FROM public.permissoes_usuario p WHERE p.user_id=a.id::text AND p.modulo=mod AND p.unidade_id=a.unidade_id LIMIT 1),
 (SELECT (to_jsonb(p)->>field)::boolean FROM public.permissoes_usuario p WHERE p.user_id=a.id::text AND p.modulo=mod AND p.unidade_id='' LIMIT 1),
 (SELECT (to_jsonb(p)->>field)::boolean FROM public.permissoes p WHERE p.modulo=mod AND p.unidade_id=a.unidade_id AND p.perfil IN (profile,raw_role) ORDER BY (p.perfil=profile) DESC LIMIT 1),
 (SELECT (to_jsonb(p)->>field)::boolean FROM public.permissoes p WHERE p.modulo=mod AND p.unidade_id='' AND p.perfil IN (profile,raw_role) ORDER BY (p.perfil=profile) DESC LIMIT 1),
 mod='agenda' AND profile='gestao') INTO ok;
 IF NOT ok THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION bloqueio_guard.allowed(text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION bloqueio_guard.allowed(text,text,text,text) TO authenticated;
CREATE POLICY bloqueio_insert_guard ON public.bloqueios AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (bloqueio_guard.allowed(coalesce(unidade_id,''),coalesce(profissional_id,''),criado_por,'can_create'));
CREATE POLICY bloqueio_update_guard ON public.bloqueios AS RESTRICTIVE FOR UPDATE TO authenticated USING (data_fim >= (now() AT TIME ZONE 'America/Santarem')::date AND bloqueio_guard.allowed(coalesce(unidade_id,''),coalesce(profissional_id,''),criado_por,'can_edit')) WITH CHECK (data_fim >= (now() AT TIME ZONE 'America/Santarem')::date AND bloqueio_guard.allowed(coalesce(unidade_id,''),coalesce(profissional_id,''),criado_por,'can_edit'));
CREATE POLICY bloqueio_delete_guard ON public.bloqueios AS RESTRICTIVE FOR DELETE TO authenticated USING (data_fim >= (now() AT TIME ZONE 'America/Santarem')::date AND bloqueio_guard.allowed(coalesce(unidade_id,''),coalesce(profissional_id,''),criado_por,'can_delete'));
CREATE OR REPLACE FUNCTION bloqueio_guard.validate_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.criado_por IS DISTINCT FROM OLD.criado_por OR NEW.criado_em IS DISTINCT FROM OLD.criado_em) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Autoria do bloqueio protegida.'; END IF;
 IF nullif(btrim(NEW.titulo),'') IS NULL OR NEW.tipo NOT IN ('feriado','ferias','reuniao','indisponibilidade') OR NEW.data_inicio IS NULL OR NEW.data_fim IS NULL OR NOT isfinite(NEW.data_inicio) OR NOT isfinite(NEW.data_fim) OR NEW.data_fim<NEW.data_inicio OR NEW.dia_inteiro IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Informe motivo, tipo e período válidos.'; END IF;
 IF NOT NEW.dia_inteiro AND (coalesce(NEW.hora_inicio,'') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR coalesce(NEW.hora_fim,'') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR NEW.hora_fim<=NEW.hora_inicio) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Horário final deve ser posterior ao inicial.'; END IF;
 IF NEW.dia_inteiro THEN NEW.hora_inicio:='';NEW.hora_fim:=''; END IF;
 IF coalesce(NEW.unidade_id,'')<>'' AND NOT EXISTS(SELECT 1 FROM public.unidades u WHERE u.id=NEW.unidade_id AND u.ativo) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Unidade ativa não localizada.'; END IF;
 IF coalesce(NEW.profissional_id,'')<>'' AND NOT EXISTS(SELECT 1 FROM public.funcionarios f WHERE f.id::text=NEW.profissional_id AND f.ativo AND lower(trim(f.role)) NOT IN ('master','recepcao','recepção','coordenador','gestor','gestao','gestão','coordenacao') AND coalesce(f.unidade_id,'')=coalesce(NEW.unidade_id,'')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Profissional ativo ou lotação não confirmada.'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION bloqueio_guard.validate_row() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_bloqueio_validate BEFORE INSERT OR UPDATE ON public.bloqueios FOR EACH ROW EXECUTE FUNCTION bloqueio_guard.validate_row();
CREATE UNIQUE INDEX bloqueios_exact_guard ON public.bloqueios(lower(btrim(titulo)),tipo,data_inicio,data_fim,coalesce(dia_inteiro,false),(CASE WHEN dia_inteiro THEN '' ELSE left(coalesce(hora_inicio,''),5) END),(CASE WHEN dia_inteiro THEN '' ELSE left(coalesce(hora_fim,''),5) END),(CASE WHEN coalesce(profissional_id,'')<>'' THEN '' ELSE coalesce(unidade_id,'') END),coalesce(profissional_id,''));
COMMIT;
