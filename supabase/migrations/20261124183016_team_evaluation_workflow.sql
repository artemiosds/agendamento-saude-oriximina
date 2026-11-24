BEGIN;
-- Additive workflow: existing multiprofessional records and queues are preserved.
CREATE TABLE public.team_evaluation_requests (
 id uuid PRIMARY KEY,
 patient_id text NOT NULL,
 patient_name text NOT NULL,
 unit_id text NOT NULL CHECK(length(btrim(unit_id))>0),
 source_id uuid NOT NULL REFERENCES public.prontuarios(id),
 requested_by uuid NOT NULL REFERENCES public.funcionarios(id),
 requested_name text NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 6000),
 priority text NOT NULL CHECK(priority IN ('rotina','prioritaria')),
 members jsonb NOT NULL CHECK(jsonb_typeof(members)='array' AND jsonb_array_length(members) BETWEEN 1 AND 20),
 opinions jsonb NOT NULL DEFAULT '[]'::jsonb,
 source_snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'aberta' CHECK(status IN ('aberta','concluida')),
 care_plan text NOT NULL DEFAULT '',
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_evaluation_patient_unit ON public.team_evaluation_requests(patient_id,unit_id,created_at DESC);
ALTER TABLE public.team_evaluation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_evaluation_requests FROM anon,authenticated;
GRANT SELECT ON public.team_evaluation_requests TO authenticated;
CREATE POLICY team_evaluation_clinical_read ON public.team_evaluation_requests FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.funcionarios f WHERE f.auth_user_id=auth.uid() AND f.ativo IS TRUE
 AND f.role IN ('profissional','enfermagem','master')
 AND (f.usuario='admin.sms' OR f.unidade_id=team_evaluation_requests.unit_id))
);
-- A single transaction owns each mutation, clinical history and audit entry.
CREATE OR REPLACE FUNCTION public.team_evaluation_command(p_action text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 actor public.funcionarios%ROWTYPE;
 source public.prontuarios%ROWTYPE;
 request public.team_evaluation_requests%ROWTYPE;
 target public.funcionarios%ROWTYPE;
 item jsonb;
 members jsonb := '[]'::jsonb;
 request_id uuid := (p_payload->>'id')::uuid;
 note text;
 details text;
BEGIN
 SELECT * INTO actor FROM public.funcionarios WHERE auth_user_id=auth.uid() AND ativo IS TRUE;
 IF actor.id IS NULL OR actor.role NOT IN ('profissional','enfermagem','master') THEN RAISE EXCEPTION 'Acesso restrito aos profissionais e Master ativos.'; END IF;
 IF p_action='create' THEN
  -- Client-generated UUID makes retries idempotent, while preserving ownership.
  PERFORM pg_advisory_xact_lock(hashtextextended(request_id::text,0));
  SELECT * INTO request FROM public.team_evaluation_requests WHERE id=request_id;
  IF FOUND THEN
   IF request.requested_by<>actor.id OR (actor.usuario<>'admin.sms' AND request.unit_id IS DISTINCT FROM actor.unidade_id) THEN RAISE EXCEPTION 'Solicitação indisponível.'; END IF;
   RETURN to_jsonb(request);
  END IF;
  SELECT * INTO source FROM public.prontuarios WHERE id=(p_payload->>'source_id')::uuid;
  IF source.id IS NULL OR (actor.usuario<>'admin.sms' AND source.unidade_id IS DISTINCT FROM actor.unidade_id) THEN RAISE EXCEPTION 'Avaliação inicial não encontrada nesta unidade.'; END IF;
  IF length(btrim(concat_ws('',source.queixa_principal,source.anamnese,source.soap_avaliacao,source.conduta,source.evolucao)))=0 THEN RAISE EXCEPTION 'A avaliação inicial precisa conter informações clínicas.'; END IF;
  IF source.status IS DISTINCT FROM 'finalizado' THEN RAISE EXCEPTION 'Salve e finalize a avaliação inicial antes de solicitar pareceres.'; END IF;
  IF jsonb_typeof(p_payload->'members') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'members') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Selecione de 1 a 20 profissionais.'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'members') LOOP
   SELECT * INTO target FROM public.funcionarios WHERE id=(item->>'id')::uuid AND ativo IS TRUE AND role IN ('profissional','enfermagem','master') AND unidade_id=source.unidade_id;
   IF target.id IS NULL THEN RAISE EXCEPTION 'Profissional indisponível nesta unidade.'; END IF;
   IF length(btrim(coalesce(item->>'reason',''))) NOT BETWEEN 1 AND 3000 THEN RAISE EXCEPTION 'Informe o motivo individual.'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(members) m WHERE m->>'id'=target.id::text) THEN RAISE EXCEPTION 'Profissional repetido.'; END IF;
   members:=members||jsonb_build_array(jsonb_build_object('id',target.id,'name',target.nome,'specialty',coalesce(nullif(target.profissao,''),target.cargo,''),'reason',item->>'reason'));
  END LOOP;
  INSERT INTO public.team_evaluation_requests(id,patient_id,patient_name,unit_id,source_id,requested_by,requested_name,reason,priority,members,source_snapshot)
  VALUES(request_id,source.paciente_id,source.paciente_nome,source.unidade_id,source.id,actor.id,actor.nome,btrim(p_payload->>'reason'),p_payload->>'priority',members,
   jsonb_build_object('data',source.data_atendimento,'profissional',source.profissional_nome,'queixa',source.queixa_principal,'anamnese',source.anamnese,'avaliacao',source.soap_avaliacao,'conduta',source.conduta,'evolucao',source.evolucao)) RETURNING * INTO request;
 ELSE
  SELECT * INTO request FROM public.team_evaluation_requests WHERE id=request_id FOR UPDATE;
  IF request.id IS NULL OR (actor.usuario<>'admin.sms' AND request.unit_id IS DISTINCT FROM actor.unidade_id) THEN RAISE EXCEPTION 'Solicitação não encontrada nesta unidade.'; END IF;
  IF request.status<>'aberta' THEN RAISE EXCEPTION 'A solicitação já foi concluída.'; END IF;
  IF request.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RAISE EXCEPTION 'A solicitação foi atualizada por outro profissional. Atualize a lista.'; END IF;
  IF p_action='reply' THEN
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(request.members) m WHERE m->>'id'=actor.id::text) THEN RAISE EXCEPTION 'Você não foi solicitado para este parecer.'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(request.opinions) o WHERE o->>'professional_id'=actor.id::text) THEN RAISE EXCEPTION 'Seu parecer já foi registrado.'; END IF;
   note:=btrim(coalesce(p_payload->>'evaluation',''));
   details:=btrim(coalesce(p_payload->>'recommendations',''));
   IF length(note) NOT BETWEEN 1 AND 12000 OR length(details)>12000 THEN RAISE EXCEPTION 'Preencha a avaliação (até 12.000 caracteres por campo).'; END IF;
   UPDATE public.team_evaluation_requests SET opinions=opinions||jsonb_build_array(jsonb_build_object('professional_id',actor.id,'name',actor.nome,'specialty',actor.profissao,'evaluation',note,'recommendations',details,'created_at',now())),version=version+1,updated_at=now() WHERE id=request_id RETURNING * INTO request;
  ELSIF p_action='finish' THEN
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(request.members) m WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(request.opinions) o WHERE o->>'professional_id'=m->>'id')) THEN RAISE EXCEPTION 'Ainda existem pareceres pendentes.'; END IF;
   note:=btrim(coalesce(p_payload->>'care_plan',''));
   details:='Conclusão da avaliação em equipe';
   IF length(note) NOT BETWEEN 1 AND 12000 THEN RAISE EXCEPTION 'Registre o plano de cuidado (até 12.000 caracteres).'; END IF;
   UPDATE public.team_evaluation_requests SET care_plan=note,status='concluida',version=version+1,updated_at=now() WHERE id=request_id RETURNING * INTO request;
  ELSE RAISE EXCEPTION 'Ação inválida.';
  END IF;
  INSERT INTO public.prontuarios(paciente_id,paciente_nome,profissional_id,profissional_nome,unidade_id,tipo_registro,status,data_atendimento,hora_atendimento,anamnese,conduta,evolucao,custom_data)
  VALUES(request.patient_id,request.patient_name,actor.id::text,actor.nome,request.unit_id,'avaliacao_multiprofissional','finalizado',(now() AT TIME ZONE 'America/Santarem')::date,to_char(now() AT TIME ZONE 'America/Santarem','HH24:MI'),note,details,'Avaliação em equipe — '||CASE WHEN p_action='reply' THEN 'Parecer' ELSE 'Plano de cuidado' END,jsonb_build_object('team_request_id',request.id,'team_action',p_action));
 END IF;
 INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,detalhes)
 VALUES(actor.id::text,actor.nome,actor.role,request.unit_id,'team_evaluation_'||p_action,'team_evaluation_requests',request.id::text,'avaliacao',jsonb_build_object('version',request.version));
 RETURN to_jsonb(request);
END;
$$;
REVOKE ALL ON FUNCTION public.team_evaluation_command(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.team_evaluation_command(text,jsonb) TO authenticated;

COMMIT;
