-- Apenas banco isolado de CI. Dados totalmente fictícios.
ALTER TABLE public.pacientes ADD COLUMN auth_user_id uuid;
UPDATE public.pacientes SET auth_user_id = '10000000-0000-4000-8000-000000000001' WHERE id='p1';
UPDATE public.pacientes SET auth_user_id = '10000000-0000-4000-8000-000000000002' WHERE id='p2';
UPDATE public.pacientes SET auth_user_id = '10000000-0000-4000-8000-000000000003' WHERE id IN ('p3','p4');
ALTER TABLE public.action_logs ADD COLUMN origem text, ADD COLUMN paciente_nome text, ADD COLUMN profissional_nome text;
CREATE TABLE public.system_config (id text PRIMARY KEY, configuracoes jsonb NOT NULL);
INSERT INTO public.system_config VALUES ('default','{"portalPaciente":{"permitirPortal":true},"secret":"never expose"}');
CREATE TABLE public.fila_espera (id text PRIMARY KEY, paciente_id text, status text);
INSERT INTO public.fila_espera VALUES ('f1','p1','aguardando'),('f2','p2','chamado');
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fila_espera ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.system_config,public.fila_espera TO authenticated;
CREATE FUNCTION public.is_staff_member() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.funcionarios WHERE auth_user_id=auth.uid() AND ativo)
$$;
DROP POLICY "Fixture direct agendamentos" ON public.agendamentos;
CREATE POLICY "Staff read agendamentos" ON public.agendamentos FOR SELECT TO authenticated USING (public.is_staff_member());
CREATE POLICY "Staff update agendamentos" ON public.agendamentos FOR UPDATE TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());
CREATE POLICY "Pacientes read own agendamentos" ON public.agendamentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Pacientes cancel own agendamentos" ON public.agendamentos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Pacientes read own data" ON public.pacientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Pacientes read own fila" ON public.fila_espera FOR SELECT TO authenticated USING (true);

INSERT INTO public.agendamentos (id,paciente_id,paciente_nome,unidade_id,profissional_id,profissional_nome,data,hora,status,observacoes)
VALUES ('a1','p1','Paciente 1','u1','11111111-1111-4111-8111-111111111111','Profissional',current_date,'08:00','confirmado','Original'),
       ('a2','p2','Paciente 2','u1','11111111-1111-4111-8111-111111111111','Profissional',current_date,'09:00','pendente',''),
       ('a3','p1','Paciente 1','u1','11111111-1111-4111-8111-111111111111','Profissional',current_date,'10:00','confirmado_chegada',''),
       ('a4','p1','Paciente 1','u1','11111111-1111-4111-8111-111111111111','Profissional',current_date,'11:00','pendente',''),
       ('a5','p1','Paciente 1','u1','11111111-1111-4111-8111-111111111111','Profissional',current_date,'12:00','pendente','');
INSERT INTO public.agendamentos (id,paciente_id,paciente_nome,unidade_id,profissional_id,profissional_nome,data,hora,status,origem,criado_por,agendado_por_externo)
VALUES ('ag_12345678-1234-4234-8234-123456789abc','p1','Paciente 1','u1','11111111-1111-4111-8111-111111111111','Profissional',current_date,'08:30','confirmado','externo','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
INSERT INTO public.agendamentos_externos VALUES ('12345678-1234-4234-8234-123456789abc','p1','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111','u1','77777777-7777-4777-8777-777777777777',current_date,'08:30','manha','confirmado');
UPDATE public.quotas_externas SET vagas_usadas=1 WHERE id='77777777-7777-4777-8777-777777777777';

\ir ../../supabase/migrations/20261125150000_portal_patient_security.sql

DO $$ BEGIN
 IF has_function_privilege('anon','public.get_portal_patient_status()','EXECUTE') OR has_function_privilege('anon','public.cancel_portal_appointment(text,text)','EXECUTE') THEN RAISE EXCEPTION 'anon has execute'; END IF;
END $$;

SET ROLE authenticated;
SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
DO $$ DECLARE a jsonb; BEGIN
 a := public.get_portal_patient_status();
 IF a->>'allowed' <> 'true' OR a->>'paciente_id' <> 'p1' OR a ? 'secret' THEN RAISE EXCEPTION 'bad portal status'; END IF;
 IF (SELECT count(*) FROM public.fila_espera) <> 1 OR (SELECT count(*) FROM public.pacientes) <> 1 OR (SELECT count(*) FROM public.system_config) <> 0 THEN RAISE EXCEPTION 'isolation failed'; END IF;
 BEGIN
  PERFORM public.cancel_portal_appointment('a2','Não autorizado'); RAISE EXCEPTION 'unexpected success';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='unexpected success' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.cancel_portal_appointment('a3','Já chegou'); RAISE EXCEPTION 'unexpected success';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='unexpected success' THEN RAISE; END IF; END;
 BEGIN
  UPDATE public.agendamentos SET status='cancelado',hora='00:00' WHERE id='a1'; RAISE EXCEPTION 'unexpected success';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='unexpected success' THEN RAISE; END IF; END;
 PERFORM public.cancel_portal_appointment('a1','Motivo teste RPC');
 UPDATE public.agendamentos SET status='cancelado' WHERE id='a4'; -- cliente antigo
 PERFORM public.cancel_portal_appointment('ag_12345678-1234-4234-8234-123456789abc','Motivo teste externo');
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.action_logs WHERE acao='cancelamento_portal' AND entidade_id IN ('a1','a4')) <> 2 THEN RAISE EXCEPTION 'audit count wrong'; END IF;
 IF (SELECT observacoes FROM public.agendamentos WHERE id='a1') <> E'Original\nMotivo teste RPC' THEN RAISE EXCEPTION 'reason lost'; END IF;
 IF (SELECT status FROM public.agendamentos WHERE id='a2') <> 'pendente' OR (SELECT status FROM public.agendamentos WHERE id='a3') <> 'confirmado_chegada' THEN RAISE EXCEPTION 'unauthorized write'; END IF;
 IF (SELECT vagas_usadas FROM public.quotas_externas WHERE id='77777777-7777-4777-8777-777777777777') <> 0 OR (SELECT status FROM public.agendamentos_externos WHERE id='12345678-1234-4234-8234-123456789abc') <> 'cancelado' THEN RAISE EXCEPTION 'quota incorrect'; END IF;
END $$;
UPDATE public.system_config SET configuracoes='{"portalPaciente":{"permitirPortal":false}}';
SET ROLE authenticated;
DO $$ BEGIN
 IF (public.get_portal_patient_status()->>'allowed')::boolean OR EXISTS(SELECT 1 FROM public.agendamentos) THEN RAISE EXCEPTION 'global block failed'; END IF;
 BEGIN
  PERFORM public.cancel_portal_appointment('a5','Não autorizado'); RAISE EXCEPTION 'unexpected success';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='unexpected success' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
UPDATE public.system_config SET configuracoes='{"portalPaciente":{"pacientesBloqueados":["p1"]}}';
SET ROLE authenticated;
DO $$ BEGIN
 IF (public.get_portal_patient_status()->>'allowed')::boolean OR NOT (public.get_portal_patient_status()->>'paciente_bloqueado')::boolean THEN RAISE EXCEPTION 'patient block failed'; END IF;
END $$;
RESET ROLE;
UPDATE public.system_config SET configuracoes='{"portalPaciente":{"permissoes":{"cancelar":false,"verFila":false}}}';
SET ROLE authenticated;
DO $$ BEGIN
 IF NOT (public.get_portal_patient_status()->>'allowed')::boolean OR EXISTS(SELECT 1 FROM public.fila_espera) THEN RAISE EXCEPTION 'permission failed'; END IF;
 BEGIN
  PERFORM public.cancel_portal_appointment('a5','Não autorizado'); RAISE EXCEPTION 'unexpected success';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='unexpected success' THEN RAISE; END IF; END;
END $$;
SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000003';
DO $$ BEGIN IF (public.get_portal_patient_status()->>'allowed')::boolean THEN RAISE EXCEPTION 'duplicate patient allowed'; END IF; END $$;
SET request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
UPDATE public.agendamentos SET status='confirmado' WHERE id='a5';
RESET ROLE;
DO $$ BEGIN IF (SELECT status FROM public.agendamentos WHERE id='a5') <> 'confirmado' THEN RAISE EXCEPTION 'staff regression'; END IF; END $$;
