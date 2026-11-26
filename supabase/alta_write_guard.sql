-- Blindagem de escrita do Relatorio de Alta, somente os dois tipos abaixo.
-- Aplicacao manual no Lovable Cloud, em transacao. Nao altera registros existentes.
BEGIN;
CREATE OR REPLACE FUNCTION public.guard_alta_report_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $guard$
DECLARE
  protected_types constant text[] := ARRAY['alta_individual','alta_multiprofissional'];
  actor public.funcionarios%ROWTYPE;
  actor_id text;
  manager boolean;
  old_payload jsonb;
  new_payload jsonb;
  old_sections jsonb;
  new_sections jsonb;
  old_section jsonb;
  new_section jsonb;
  old_corrections jsonb;
  new_corrections jsonb;
  last_correction jsonb;
  old_history jsonb;
  new_history jsonb;
  member_id text;
  old_status text;
  new_status text;
  raw_role text;
  normalized_role text;
  permission_module text := 'relatorio_alta';
  action_name text;
  allowed boolean;
  default_allowed boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT (OLD.tipo_registro = ANY(protected_types)) THEN RETURN OLD; END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NOT (NEW.tipo_registro = ANY(protected_types)) THEN RETURN NEW; END IF;
  ELSE
    IF NOT (OLD.tipo_registro = ANY(protected_types) OR NEW.tipo_registro = ANY(protected_types)) THEN RETURN NEW; END IF;
  END IF;

  -- Only a direct database administrator session may perform exceptional maintenance.
  IF auth.uid() IS NULL AND session_user = 'postgres' AND current_user = 'postgres' THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Alta: autenticação obrigatória.' USING ERRCODE='42501'; END IF;
  SELECT * INTO actor FROM public.funcionarios f
    WHERE f.auth_user_id=auth.uid() AND f.ativo IS TRUE;
  IF NOT FOUND OR (SELECT count(*) FROM public.funcionarios f WHERE f.auth_user_id=auth.uid() AND f.ativo IS TRUE)<>1 THEN
    RAISE EXCEPTION 'Alta: profissional ativo não identificado de forma única.' USING ERRCODE='42501';
  END IF;
  actor_id := actor.id::text;
  raw_role := lower(btrim(actor.role));
  normalized_role := CASE raw_role WHEN 'gestão' THEN 'gestao' WHEN 'gestor' THEN 'gestao' WHEN 'coordenador' THEN 'gestao' WHEN 'coordenacao' THEN 'gestao' WHEN 'recepção' THEN 'recepcao' WHEN 'tecnico' THEN 'triagem' WHEN 'tecnico_enfermagem' THEN 'enfermagem' ELSE raw_role END;
  manager := raw_role IN ('master','gestao','gestão','coordenador');
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Alta: exclusão não permitida pela aplicação; preserve o histórico.' USING ERRCODE='42501';
  END IF;
  IF coalesce(actor.unidade_id,'')='' OR NEW.unidade_id IS DISTINCT FROM actor.unidade_id THEN
    RAISE EXCEPTION 'Alta: operação fora da unidade ativa.' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' AND (OLD.tipo_registro IS DISTINCT FROM NEW.tipo_registro OR OLD.id IS DISTINCT FROM NEW.id
    OR OLD.paciente_id IS DISTINCT FROM NEW.paciente_id OR OLD.unidade_id IS DISTINCT FROM NEW.unidade_id
    OR OLD.profissional_id IS DISTINCT FROM NEW.profissional_id OR OLD.profissional_nome IS DISTINCT FROM NEW.profissional_nome) THEN
    RAISE EXCEPTION 'Alta: identificação, tipo e autoria são imutáveis.' USING ERRCODE='42501';
  END IF;
  IF (TG_OP='INSERT' OR NEW.tipo_registro='alta_individual') AND NEW.profissional_id IS DISTINCT FROM actor_id THEN
    RAISE EXCEPTION 'Alta: não é permitido gravar em nome de outro profissional.' USING ERRCODE='42501';
  END IF;

  IF TG_OP='INSERT' AND NEW.profissional_nome IS DISTINCT FROM actor.nome THEN
    RAISE EXCEPTION 'Alta: nome do autor deve corresponder ao cadastro ativo.' USING ERRCODE='42501';
  END IF;

  -- Resolve as regras do modulo com a mesma precedencia da interface.
  IF raw_role <> 'master' THEN
    IF NOT EXISTS (SELECT 1 FROM public.permissoes p WHERE p.modulo='relatorio_alta' AND p.perfil IN (normalized_role,raw_role) AND p.unidade_id IN (actor.unidade_id,''))
       AND NOT EXISTS (SELECT 1 FROM public.permissoes_usuario p WHERE p.modulo='relatorio_alta' AND p.user_id=actor_id AND p.unidade_id IN (actor.unidade_id,'')) THEN
      permission_module := 'prontuario';
    END IF;
    FOREACH action_name IN ARRAY ARRAY['can_view',CASE WHEN TG_OP='INSERT' THEN 'can_create' ELSE 'can_edit' END,CASE WHEN NEW.status IS DISTINCT FROM 'rascunho' THEN 'can_execute' ELSE 'can_view' END] LOOP
      default_allowed := permission_module='prontuario' AND (normalized_role IN ('profissional','gestao') OR (normalized_role='enfermagem' AND action_name<>'can_view') OR (normalized_role='recepcao' AND action_name='can_view'));
      SELECT x.allowed INTO allowed FROM (
        SELECT 1 AS priority, (to_jsonb(p)->>action_name)::boolean AS allowed FROM public.permissoes_usuario p WHERE p.user_id=actor_id AND p.modulo=permission_module AND p.unidade_id=actor.unidade_id
        UNION ALL SELECT 2, (to_jsonb(p)->>action_name)::boolean FROM public.permissoes_usuario p WHERE p.user_id=actor_id AND p.modulo=permission_module AND p.unidade_id=''
        UNION ALL SELECT 3, (to_jsonb(p)->>action_name)::boolean FROM public.permissoes p WHERE p.modulo=permission_module AND p.unidade_id=actor.unidade_id AND p.perfil=normalized_role
        UNION ALL SELECT 3, (to_jsonb(p)->>action_name)::boolean FROM public.permissoes p WHERE p.modulo=permission_module AND p.unidade_id=actor.unidade_id AND p.perfil=raw_role AND raw_role<>normalized_role AND NOT EXISTS(SELECT 1 FROM public.permissoes pp WHERE pp.modulo=permission_module AND pp.unidade_id=actor.unidade_id AND pp.perfil=normalized_role)
        UNION ALL SELECT 4, (to_jsonb(p)->>action_name)::boolean FROM public.permissoes p WHERE p.modulo=permission_module AND p.unidade_id='' AND p.perfil=normalized_role
        UNION ALL SELECT 4, (to_jsonb(p)->>action_name)::boolean FROM public.permissoes p WHERE p.modulo=permission_module AND p.unidade_id='' AND p.perfil=raw_role AND raw_role<>normalized_role AND NOT EXISTS(SELECT 1 FROM public.permissoes pp WHERE pp.modulo=permission_module AND pp.unidade_id='' AND pp.perfil=normalized_role)
      ) x WHERE x.allowed IS NOT NULL ORDER BY x.priority, x.allowed ASC LIMIT 1;
      IF NOT coalesce(allowed,default_allowed,false) THEN RAISE EXCEPTION 'Alta: permissão de módulo insuficiente (%).', action_name USING ERRCODE='42501'; END IF;
    END LOOP;
  END IF;

  IF NEW.status IS NULL OR NEW.status NOT IN ('rascunho','concluido','emitido') THEN
    RAISE EXCEPTION 'Alta: status de gravação inválido.' USING ERRCODE='23514';
  END IF;
  new_payload := NEW.observacoes::jsonb;
  IF jsonb_typeof(new_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Alta: conteúdo inválido.' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' THEN
    old_payload := OLD.observacoes::jsonb;
    IF jsonb_typeof(old_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Alta: conteúdo anterior inválido.' USING ERRCODE='23514'; END IF;
    IF OLD.status IS DISTINCT FROM 'rascunho' THEN
      IF NEW.status<>'rascunho' OR (NEW.profissional_id<>actor_id AND NOT manager) THEN RAISE EXCEPTION 'Alta: documento finalizado somente pode ser reaberto pelo responsável autorizado.' USING ERRCODE='42501'; END IF;
      old_history:=coalesce(old_payload->'history','[]'::jsonb);
      new_history:=new_payload->'history';
      IF jsonb_typeof(old_history) IS DISTINCT FROM 'array' OR jsonb_typeof(new_history) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Alta: histórico inválido.' USING ERRCODE='23514'; END IF;
      IF (old_payload-'version'-'history') IS DISTINCT FROM (new_payload-'version'-'history')
        OR (to_jsonb(OLD)-'status'-'observacoes'-'evolucao'-'atualizado_em') IS DISTINCT FROM (to_jsonb(NEW)-'status'-'observacoes'-'evolucao'-'atualizado_em')
        OR jsonb_array_length(new_history)<>jsonb_array_length(old_history)+1
        OR new_history-(jsonb_array_length(new_history)-1) IS DISTINCT FROM old_history
        OR new_history->(-1)->>'action' IS DISTINCT FROM 'Reabertura de Relatório'
        OR btrim(coalesce(new_history->(-1)->>'reason',''))=''
        OR (new_payload->>'version')::integer IS DISTINCT FROM coalesce((old_payload->>'version')::integer,1)+1 THEN
        RAISE EXCEPTION 'Alta: reabertura deve preservar a versão clínica e registrar justificativa.' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP='UPDATE' AND jsonb_typeof(old_payload->'history')='array' THEN
    IF jsonb_typeof(new_payload->'history') IS DISTINCT FROM 'array' OR
       jsonb_array_length(new_payload->'history') < jsonb_array_length(old_payload->'history') OR
       EXISTS (SELECT 1 FROM jsonb_array_elements(old_payload->'history') WITH ORDINALITY AS h(entry,n)
          WHERE h.entry IS DISTINCT FROM (new_payload->'history'->((h.n-1)::integer))) THEN
      RAISE EXCEPTION 'Alta: histórico anterior não pode ser removido ou reescrito.' USING ERRCODE='42501';
    END IF;
  END IF;
  IF NEW.tipo_registro='alta_individual' THEN RETURN NEW; END IF;
  new_sections:=new_payload->'profissionais';
  IF jsonb_typeof(new_sections) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Alta: equipe inválida.' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(new_sections) s WHERE jsonb_typeof(s)<>'object' OR coalesce(s->>'profissional_id','')='') OR
    (SELECT count(*) FROM jsonb_array_elements(new_sections))<>(SELECT count(DISTINCT s->>'profissional_id') FROM jsonb_array_elements(new_sections) s) THEN
    RAISE EXCEPTION 'Alta: equipe com identificação inválida ou duplicada.' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    old_sections:=old_payload->'profissionais';
    IF jsonb_typeof(old_sections) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Alta: equipe anterior inválida.' USING ERRCODE='23514'; END IF;
    IF NEW.profissional_id<>actor_id AND NOT manager AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(old_sections) s WHERE s->>'profissional_id'=actor_id) THEN
      RAISE EXCEPTION 'Alta: profissional não integra a equipe.' USING ERRCODE='42501';
    END IF;
    -- The team is frozen after the first persisted draft. Recounting may change dates/counts, not membership.
    IF (SELECT array_agg(s->>'profissional_id' ORDER BY s->>'profissional_id') FROM jsonb_array_elements(old_sections) s)
      IS DISTINCT FROM (SELECT array_agg(s->>'profissional_id' ORDER BY s->>'profissional_id') FROM jsonb_array_elements(new_sections) s) THEN
      RAISE EXCEPTION 'Alta: composição da equipe salva não pode ser substituída.' USING ERRCODE='42501';
    END IF;
    IF old_payload->'altaManualTeam' IS DISTINCT FROM new_payload->'altaManualTeam' THEN
      RAISE EXCEPTION 'Alta: origem e conferência da equipe manual são imutáveis.' USING ERRCODE='42501';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(old_sections) s WHERE s->>'status_contribuicao'='assinada' OR jsonb_array_length(coalesce(s->'retificacoes','[]'::jsonb))>0)
       AND NEW.data_atendimento IS DISTINCT FROM OLD.data_atendimento THEN
      RAISE EXCEPTION 'Alta: data de alta preservada após assinatura.' USING ERRCODE='42501';
    END IF;
  END IF;
  FOR new_section IN SELECT value FROM jsonb_array_elements(new_sections) LOOP
    member_id:=new_section->>'profissional_id';
    new_status:=new_section->>'status_contribuicao';
    IF new_status IS NULL OR new_status NOT IN ('nao_iniciada','em_preenchimento','concluida','assinada') THEN RAISE EXCEPTION 'Alta: situação da contribuição inválida.' USING ERRCODE='23514'; END IF;
    old_section:=NULL;
    IF TG_OP='UPDATE' THEN SELECT value INTO old_section FROM jsonb_array_elements(old_sections) WHERE value->>'profissional_id'=member_id; END IF;
    old_status:=old_section->>'status_contribuicao';
    IF TG_OP='INSERT' AND member_id<>actor_id AND (NOT manager OR new_payload ? 'altaManualTeam') AND new_status<>'nao_iniciada' THEN
      RAISE EXCEPTION 'Alta: nova contribuição de outro profissional deve começar não iniciada.' USING ERRCODE='42501';
    END IF;
    IF old_section IS NOT DISTINCT FROM new_section THEN CONTINUE; END IF;
    old_corrections:=coalesce(old_section->'retificacoes','[]'::jsonb);
    new_corrections:=coalesce(new_section->'retificacoes','[]'::jsonb);
    IF jsonb_typeof(old_corrections) IS DISTINCT FROM 'array' OR jsonb_typeof(new_corrections) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Alta: histórico de retificação inválido.' USING ERRCODE='23514'; END IF;
    IF old_status='assinada' THEN
      IF member_id<>actor_id OR new_status<>'em_preenchimento' OR NEW.status<>'rascunho' OR
        jsonb_array_length(new_corrections)<>jsonb_array_length(old_corrections)+1 OR
        new_corrections-(jsonb_array_length(new_corrections)-1) IS DISTINCT FROM old_corrections OR
        (new_section-'retificacoes'-'status_contribuicao'-'data_contribuicao'-'finalizado_em'-'finalizado_por') IS DISTINCT FROM (old_section-'retificacoes'-'status_contribuicao'-'data_contribuicao'-'finalizado_em'-'finalizado_por') OR
        coalesce(new_section->>'data_contribuicao','')<>'' OR new_section->>'finalizado_em' IS NOT NULL OR new_section->>'finalizado_por' IS NOT NULL THEN
        RAISE EXCEPTION 'Alta: contribuição assinada não pode ser sobrescrita.' USING ERRCODE='42501';
      END IF;
      last_correction:=new_corrections->(-1);
      IF last_correction->'anterior' IS DISTINCT FROM (old_section-'retificacoes') OR last_correction->>'autor_id' IS DISTINCT FROM actor_id OR btrim(coalesce(last_correction->>'motivo',''))='' THEN
        RAISE EXCEPTION 'Alta: retificação exige cópia integral da assinatura anterior e justificativa.' USING ERRCODE='23514';
      END IF;
      CONTINUE;
    END IF;
    IF old_corrections IS DISTINCT FROM new_corrections THEN RAISE EXCEPTION 'Alta: histórico de retificação imutável.' USING ERRCODE='42501'; END IF;
    IF new_status='assinada' AND (member_id<>actor_id OR btrim(coalesce(new_section->>'data_contribuicao',''))='' OR btrim(coalesce(new_section->>'finalizado_em',''))='' OR new_section->>'finalizado_por' IS DISTINCT FROM actor.nome) THEN
      RAISE EXCEPTION 'Alta: assinatura exclusiva do próprio autor identificado.' USING ERRCODE='42501';
    END IF;
    IF old_section IS NOT NULL AND member_id<>actor_id AND (NOT manager OR jsonb_array_length(old_corrections)>0 OR new_payload ? 'altaManualTeam') THEN
      -- Automatic source recount may update only verified dates/counts on unsigned contributions.
      IF (old_section-'periodo_inicio'-'periodo_fim'-'sessoes') IS DISTINCT FROM (new_section-'periodo_inicio'-'periodo_fim'-'sessoes') OR new_payload ? 'altaManualTeam' THEN
        RAISE EXCEPTION 'Alta: edição da contribuição reservada ao profissional autorizado.' USING ERRCODE='42501';
      END IF;
    END IF;
  END LOOP;
  IF NEW.status<>'rascunho' THEN
    IF NEW.profissional_id<>actor_id AND NOT manager THEN RAISE EXCEPTION 'Alta: consolidação exclusiva do responsável ou gestão autorizada.' USING ERRCODE='42501'; END IF;
    IF jsonb_array_length(new_sections)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(new_sections) s
      WHERE coalesce(s->>'status_contribuicao','') NOT IN ('concluida','assinada')
        OR (s->>'status_contribuicao'<>'assinada' AND ((new_payload ? 'altaManualTeam') OR jsonb_array_length(coalesce(s->'retificacoes','[]'::jsonb))>0))) THEN
      RAISE EXCEPTION 'Alta: existem contribuições pendentes ou sem nova assinatura.' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$guard$;
REVOKE ALL ON FUNCTION public.guard_alta_report_write() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_alta_report_write ON public.prontuarios;
CREATE TRIGGER trg_guard_alta_report_write BEFORE INSERT OR UPDATE OR DELETE ON public.prontuarios
FOR EACH ROW EXECUTE FUNCTION public.guard_alta_report_write();
COMMIT;
