BEGIN;
-- Fase 1: atomic saves and narrowly scoped write permissions.
-- Public reads (TV/portal) and all other tables remain unchanged.
CREATE SCHEMA IF NOT EXISTS estrutura_guard;
REVOKE ALL ON SCHEMA estrutura_guard FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA estrutura_guard TO authenticated;
CREATE OR REPLACE FUNCTION estrutura_guard.allowed(p_unit text,p_action text,p_new_unit boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.funcionarios%ROWTYPE; raw_role text; profile text; mod text:='unidades_salas'; result boolean;
BEGIN
 IF auth.uid() IS NULL OR p_action NOT IN ('can_view','can_create','can_edit') THEN RETURN false; END IF;
 SELECT * INTO a FROM public.funcionarios WHERE auth_user_id=auth.uid() AND ativo LIMIT 1;
 IF NOT FOUND THEN RETURN false; END IF;
 raw_role:=lower(trim(a.role)); profile:=CASE WHEN raw_role IN ('gestão','gestor','coordenacao','coordenador') THEN 'gestao' WHEN raw_role='recepção' THEN 'recepcao' WHEN raw_role='tecnico' THEN 'triagem' WHEN raw_role='tecnico_enfermagem' THEN 'enfermagem' ELSE raw_role END;
 IF profile='master' AND a.usuario='admin.sms' THEN RETURN true; END IF;
 IF p_new_unit OR coalesce(a.unidade_id,'')='' OR p_unit IS DISTINCT FROM a.unidade_id THEN RETURN false; END IF;
 IF profile='master' THEN RETURN true; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.permissoes_usuario WHERE user_id=a.id::text AND modulo=mod AND unidade_id IN (a.unidade_id,''))
 AND NOT EXISTS(SELECT 1 FROM public.permissoes WHERE perfil IN (profile,raw_role) AND modulo=mod AND unidade_id IN (a.unidade_id,'')) THEN mod:='usuarios'; END IF;
 SELECT coalesce(
   (SELECT (to_jsonb(p)->>p_action)::boolean FROM public.permissoes_usuario p WHERE p.user_id=a.id::text AND p.modulo=mod AND p.unidade_id=a.unidade_id LIMIT 1),
   (SELECT (to_jsonb(p)->>p_action)::boolean FROM public.permissoes_usuario p WHERE p.user_id=a.id::text AND p.modulo=mod AND p.unidade_id='' LIMIT 1),
   (SELECT (to_jsonb(p)->>p_action)::boolean FROM public.permissoes p WHERE p.modulo=mod AND p.unidade_id=a.unidade_id AND p.perfil IN (profile,raw_role) ORDER BY (p.perfil=profile) DESC LIMIT 1),
   (SELECT (to_jsonb(p)->>p_action)::boolean FROM public.permissoes p WHERE p.modulo=mod AND p.unidade_id='' AND p.perfil IN (profile,raw_role) ORDER BY (p.perfil=profile) DESC LIMIT 1),
   mod='usuarios' AND profile='gestao'
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION estrutura_guard.allowed(text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION estrutura_guard.allowed(text,text,boolean) TO authenticated;
DROP POLICY IF EXISTS estrutura_unit_insert ON public.unidades;
CREATE POLICY estrutura_unit_insert ON public.unidades AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (estrutura_guard.allowed(id,'can_create',true));
DROP POLICY IF EXISTS estrutura_unit_update ON public.unidades;
CREATE POLICY estrutura_unit_update ON public.unidades AS RESTRICTIVE FOR UPDATE TO authenticated USING (estrutura_guard.allowed(id,'can_view') AND estrutura_guard.allowed(id,'can_edit')) WITH CHECK (estrutura_guard.allowed(id,'can_view') AND estrutura_guard.allowed(id,'can_edit'));
DROP POLICY IF EXISTS estrutura_room_insert ON public.salas;
CREATE POLICY estrutura_room_insert ON public.salas AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (estrutura_guard.allowed(unidade_id,'can_view') AND estrutura_guard.allowed(unidade_id,'can_create'));
DROP POLICY IF EXISTS estrutura_room_update ON public.salas;
CREATE POLICY estrutura_room_update ON public.salas AS RESTRICTIVE FOR UPDATE TO authenticated USING (estrutura_guard.allowed(unidade_id,'can_view') AND estrutura_guard.allowed(unidade_id,'can_edit')) WITH CHECK (estrutura_guard.allowed(unidade_id,'can_view') AND estrutura_guard.allowed(unidade_id,'can_edit'));
DROP POLICY IF EXISTS estrutura_unit_delete ON public.unidades;
CREATE POLICY estrutura_unit_delete ON public.unidades AS RESTRICTIVE FOR DELETE TO authenticated USING (false);
DROP POLICY IF EXISTS estrutura_room_delete ON public.salas;
CREATE POLICY estrutura_room_delete ON public.salas AS RESTRICTIVE FOR DELETE TO authenticated USING (false);
REVOKE DELETE, TRUNCATE ON public.unidades,public.salas FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION estrutura_guard.immutable_identity() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'O identificador histórico não pode ser alterado.'; END IF;
 IF TG_TABLE_NAME='salas' THEN
   IF (to_jsonb(NEW)->>'unidade_id') IS DISTINCT FROM (to_jsonb(OLD)->>'unidade_id') THEN RAISE EXCEPTION 'A transferência de sala exige revisão dos vínculos.'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION estrutura_guard.immutable_identity() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS estrutura_identity ON public.unidades;
CREATE TRIGGER estrutura_identity BEFORE UPDATE ON public.unidades FOR EACH ROW EXECUTE FUNCTION estrutura_guard.immutable_identity();
DROP TRIGGER IF EXISTS estrutura_identity ON public.salas;
CREATE TRIGGER estrutura_identity BEFORE UPDATE ON public.salas FOR EACH ROW EXECUTE FUNCTION estrutura_guard.immutable_identity();
-- Private definer is necessary for atomic room+metadata writes even for create-only users.
-- Only the whitelisted operations below are exposed through the invoker wrapper.
CREATE OR REPLACE FUNCTION estrutura_guard.save_structure(p_action text,p_id text,p_unit text,p_data jsonb,p_expected jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u public.unidades%ROWTYPE; s public.salas%ROWTYPE; cd jsonb; room_map jsonb; k text; v jsonb; patch jsonb; original jsonb; field text; target text;
BEGIN
 IF auth.uid() IS NULL OR p_action NOT IN ('unit_create','unit_edit','room_create','room_edit','video') OR coalesce(p_id,'')='' OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR jsonb_typeof(p_expected) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Solicitação inválida.'; END IF;
 target:=CASE WHEN p_action IN ('room_create','room_edit') THEN p_unit ELSE p_id END;
 field:=CASE WHEN p_action IN ('unit_create','room_create') THEN 'can_create' ELSE 'can_edit' END;
 IF NOT estrutura_guard.allowed(target,'can_view',p_action='unit_create') OR NOT estrutura_guard.allowed(target,field,p_action='unit_create') THEN RAISE EXCEPTION 'Sem permissão para esta operação.' USING ERRCODE='42501'; END IF;
 IF p_action='unit_create' THEN
   IF coalesce(trim(p_data->>'nome'),'')='' THEN RAISE EXCEPTION 'Informe o nome da unidade.'; END IF;
   cd:=coalesce(p_data->'custom_data','{}'::jsonb);
   IF jsonb_typeof(cd) IS DISTINCT FROM 'object' OR cd ?| ARRAY['salas_exames','video_urls','video_url'] THEN RAISE EXCEPTION 'Configuração inicial inválida.'; END IF;
   IF cd ? 'cnes' AND coalesce(cd->>'cnes','') !~ '^[0-9]{7}$' THEN RAISE EXCEPTION 'CNES deve conter sete dígitos.'; END IF;
   INSERT INTO public.unidades(id,nome,nome_exibicao,endereco,telefone,whatsapp,ativo,custom_data) VALUES(p_id,trim(p_data->>'nome'),coalesce(p_data->>'nome_exibicao',''),coalesce(p_data->>'endereco',''),coalesce(p_data->>'telefone',''),coalesce(p_data->>'whatsapp',''),true,cd);
   RETURN p_id;
 END IF;
 SELECT * INTO u FROM public.unidades WHERE id=target FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unidade não encontrada.'; END IF;
 cd:=u.custom_data;
 IF jsonb_typeof(cd) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Configuração da unidade precisa de conferência.'; END IF;
 IF p_action='unit_edit' THEN
   IF coalesce(trim(p_data->>'nome'),'')='' THEN RAISE EXCEPTION 'Informe o nome da unidade.'; END IF;
   FOR k IN SELECT unnest(ARRAY['nome','nome_exibicao','endereco','telefone','whatsapp']) LOOP
     IF (to_jsonb(u)->k) IS DISTINCT FROM (p_expected->k) THEN RAISE EXCEPTION 'Cadastro alterado por outro usuário. Reabra a edição.'; END IF;
   END LOOP;
   patch:=coalesce(p_data->'custom_patch','{}'::jsonb); original:=coalesce(p_expected->'custom_data','{}'::jsonb);
   IF jsonb_typeof(patch) IS DISTINCT FROM 'object' OR patch ?| ARRAY['salas_exames','video_urls','video_url','__proto__','constructor','prototype'] THEN RAISE EXCEPTION 'Alteração de configuração inválida.'; END IF;
   FOR k,v IN SELECT key,value FROM jsonb_each(patch) LOOP
     IF (cd->k) IS DISTINCT FROM (original->k) THEN RAISE EXCEPTION 'Configuração alterada por outro usuário. Reabra a edição.'; END IF;
     IF k='cnes' AND v<>'null'::jsonb AND (v#>>'{}') !~ '^[0-9]{7}$' THEN RAISE EXCEPTION 'CNES deve conter sete dígitos.'; END IF;
     IF v='null'::jsonb THEN cd:=cd-k; ELSE cd:=jsonb_set(cd,ARRAY[k],v,true); END IF;
   END LOOP;
   UPDATE public.unidades SET nome=trim(p_data->>'nome'),nome_exibicao=coalesce(p_data->>'nome_exibicao',''),endereco=coalesce(p_data->>'endereco',''),telefone=coalesce(p_data->>'telefone',''),whatsapp=coalesce(p_data->>'whatsapp',''),custom_data=cd WHERE id=target;
 ELSIF p_action='video' THEN
   IF (cd->'video_urls') IS DISTINCT FROM (p_expected->'video_urls') OR (cd->'video_url') IS DISTINCT FROM (p_expected->'video_url') THEN RAISE EXCEPTION 'Lista de vídeos alterada por outro usuário. Reabra a edição.'; END IF;
   IF jsonb_typeof(p_data->'video_urls') IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_data->'video_urls') x WHERE jsonb_typeof(x)<>'string' OR (x#>>'{}') !~* '^https://[^[:space:]]+$') THEN RAISE EXCEPTION 'Lista de vídeos inválida.'; END IF;
   cd:=jsonb_set(cd,'{video_urls}',p_data->'video_urls',true);
   IF jsonb_array_length(p_data->'video_urls')>0 THEN cd:=jsonb_set(cd,'{video_url}',p_data->'video_urls'->0,true); ELSE cd:=cd-'video_url'; END IF;
   UPDATE public.unidades SET custom_data=cd WHERE id=target;
 ELSE
   IF NOT u.ativo THEN RAISE EXCEPTION 'Unidade inativa.'; END IF;
   IF coalesce(trim(p_data->>'nome'),'')='' THEN RAISE EXCEPTION 'Informe o nome da sala.'; END IF;
   room_map:=coalesce(cd->'salas_exames','{}'::jsonb);
   IF jsonb_typeof(room_map) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Configuração de exames precisa de conferência.'; END IF;
   IF p_action='room_edit' THEN
     SELECT * INTO s FROM public.salas WHERE id=p_id FOR UPDATE;
     IF NOT FOUND OR s.unidade_id IS DISTINCT FROM target THEN RAISE EXCEPTION 'Sala não localizada nesta unidade.'; END IF;
     IF s.nome IS DISTINCT FROM p_expected->>'nome' OR (room_map->p_id) IS DISTINCT FROM (p_expected->'config') THEN RAISE EXCEPTION 'Sala alterada por outro usuário. Reabra a edição.'; END IF;
   ELSIF room_map ? p_id THEN RAISE EXCEPTION 'Identificador de sala já utilizado.'; END IF;
   -- Renaming a room must not normalize or discard legacy diagnostic metadata.
   IF p_action='room_edit' AND p_data->'preserve_config'='true'::jsonb THEN
     UPDATE public.salas SET nome=trim(p_data->>'nome') WHERE id=p_id;
     RETURN p_id;
   END IF;
   IF p_data->>'finalidade'='aparelho_diagnostico' THEN
     v:=p_data->'config';
     IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR v->>'finalidade' IS DISTINCT FROM 'aparelho_diagnostico' OR jsonb_typeof(v->'exames') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Configuração de exames inválida.'; END IF;
     IF jsonb_array_length(v->'exames')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v->'exames') e WHERE coalesce(trim(e->>'tipoExame'),'')='') THEN RAISE EXCEPTION 'Informe os exames.'; END IF;
     room_map:=jsonb_set(room_map,ARRAY[p_id],v,true);
   ELSIF p_data->>'finalidade'='consultorio_clinico' THEN room_map:=room_map-p_id;
   ELSE RAISE EXCEPTION 'Finalidade inválida.'; END IF;
   IF p_action='room_create' THEN INSERT INTO public.salas(id,nome,unidade_id,ativo) VALUES(p_id,trim(p_data->>'nome'),target,true);
   ELSE UPDATE public.salas SET nome=trim(p_data->>'nome') WHERE id=p_id; END IF;
   IF room_map IS DISTINCT FROM coalesce(cd->'salas_exames','{}'::jsonb) THEN
     UPDATE public.unidades SET custom_data=jsonb_set(cd,'{salas_exames}',room_map,true) WHERE id=target;
   END IF;
 END IF;
 RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION estrutura_guard.save_structure(text,text,text,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION estrutura_guard.save_structure(text,text,text,jsonb,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.salvar_estrutura_unidade(p_action text,p_id text,p_unit text,p_data jsonb,p_expected jsonb)
RETURNS text LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT estrutura_guard.save_structure(p_action,p_id,p_unit,p_data,p_expected)
$$;
REVOKE ALL ON FUNCTION public.salvar_estrutura_unidade(text,text,text,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.salvar_estrutura_unidade(text,text,text,jsonb,jsonb) TO authenticated;

COMMIT;
