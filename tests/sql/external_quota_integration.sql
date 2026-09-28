-- Run only against the isolated fixture, never against Lovable Cloud.
CREATE TABLE public.test_ids (label text PRIMARY KEY, id text NOT NULL);
GRANT ALL ON public.test_ids TO authenticated;
CREATE FUNCTION public.expect_failure(statement text, fragment text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE statement;
  RAISE EXCEPTION 'Expected rejection containing: %', fragment;
EXCEPTION WHEN others THEN
  IF position(fragment IN SQLERRM) = 0 THEN
    RAISE EXCEPTION 'Wrong rejection: %, expected %', SQLERRM, fragment;
  END IF;
END;
$$;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
INSERT INTO public.test_ids
SELECT 'owner', (public.create_external_appointment(
  '77777777-7777-4777-8777-777777777777', 'p1', current_date + 7, '08:00')->>'id');
DO $$ BEGIN
  IF (SELECT vagas_usadas FROM public.quotas_externas WHERE id = '77777777-7777-4777-8777-777777777777') <> 1
     OR (SELECT count(*) FROM public.agendamentos_externos) <> 1 THEN
    RAISE EXCEPTION 'Creation did not write the appointment, ledger and quota together';
  END IF;
END $$;

SELECT public.expect_failure(format(
  'SELECT public.create_external_appointment(''77777777-7777-4777-8777-777777777777'', ''p2'', %L::date, ''08:17'')',
  current_date + 7), 'fora da grade');
SELECT public.expect_failure(format(
  'SELECT public.create_external_appointment(''77777777-7777-4777-8777-777777777777'', ''p1'', %L::date, ''08:00'')',
  current_date + 7), 'já possui agendamento');
DO $$ BEGIN
  IF (SELECT vagas_usadas FROM public.quotas_externas WHERE id = '77777777-7777-4777-8777-777777777777') <> 1 THEN
    RAISE EXCEPTION 'Rejected creation consumed a quota';
  END IF;
END $$;

INSERT INTO public.test_ids
SELECT 'full', (public.create_external_appointment(
  '88888888-8888-4888-8888-888888888888', 'p2', current_date + 7, '10:00')->>'id');
SELECT public.expect_failure(format(
  'SELECT public.create_external_appointment(''88888888-8888-4888-8888-888888888888'', ''p3'', %L::date, ''10:30'')',
  current_date + 7), 'Cota esgotada');

RESET ROLE;
-- A completed internal appointment still occupies the hour; a missed one frees it.
UPDATE public.disponibilidades SET vagas_por_hora = 1 WHERE id = 'd1';
INSERT INTO public.agendamentos
  (id, paciente_id, paciente_nome, unidade_id, profissional_id, profissional_nome, data, hora, status)
VALUES ('internal', 'p5', 'Paciente 5', 'u1', '11111111-1111-4111-8111-111111111111',
  'Profissional interno', current_date + 7, '09:00', 'concluido');
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SELECT public.expect_failure(format(
  'SELECT public.create_external_appointment(''77777777-7777-4777-8777-777777777777'', ''p3'', %L::date, ''09:30'')',
  current_date + 7), 'Capacidade do horário esgotada');
RESET ROLE;
UPDATE public.agendamentos SET status = 'falta' WHERE id = 'internal';
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
INSERT INTO public.test_ids
SELECT 'capacity', (public.create_external_appointment(
  '77777777-7777-4777-8777-777777777777', 'p3', current_date + 7, '09:30')->>'id');

RESET ROLE;
INSERT INTO public.bloqueios (data_inicio, data_fim, unidade_id, dia_inteiro, hora_inicio, hora_fim)
VALUES (current_date + 7, current_date + 7, 'u1', false, '11:00', '11:30');
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SELECT public.expect_failure(format(
  'SELECT public.create_external_appointment(''77777777-7777-4777-8777-777777777777'', ''p4'', %L::date, ''11:00'')',
  current_date + 7), 'Horário bloqueado');
RESET ROLE;
DELETE FROM public.bloqueios;

-- Direct writes cannot bypass the appointment, ledger or quota transaction.
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
UPDATE public.agendamentos SET status = 'cancelado' WHERE id = (SELECT id FROM public.test_ids WHERE label = 'owner');
UPDATE public.agendamentos_externos SET status = 'cancelado'
  WHERE id = substring((SELECT id FROM public.test_ids WHERE label = 'owner') FROM 4)::uuid;
UPDATE public.quotas_externas SET vagas_usadas = 0 WHERE id = '77777777-7777-4777-8777-777777777777';
DO $$ BEGIN
  IF (SELECT status FROM public.agendamentos WHERE id = (SELECT id FROM public.test_ids WHERE label = 'owner')) <> 'pendente'
     OR (SELECT vagas_usadas FROM public.quotas_externas WHERE id = '77777777-7777-4777-8777-777777777777') <> 2 THEN
    RAISE EXCEPTION 'Direct update bypassed the protected ledger';
  END IF;
END $$;
SELECT public.expect_failure(
  'DELETE FROM public.agendamentos WHERE id = (SELECT id FROM public.test_ids WHERE label = ''owner'')',
  'não pode ser excluído diretamente');

-- Another unit and an unrelated external professional cannot cancel it.
SET request.jwt.claim.sub = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
SELECT public.expect_failure(
  'SELECT public.cancel_external_appointment((SELECT id FROM public.test_ids WHERE label = ''owner''), ''motivo válido'')',
  'Sem permissão');
SET request.jwt.claim.sub = '99999999-9999-4999-8999-999999999999';
SELECT public.expect_failure(
  'SELECT public.cancel_external_appointment((SELECT id FROM public.test_ids WHERE label = ''owner''), ''motivo válido'')',
  'Sem permissão');

-- The owner can cancel once; repeated cancellation is idempotent.
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $$ DECLARE first_result jsonb; second_result jsonb; BEGIN
  first_result := public.cancel_external_appointment(
    (SELECT id FROM public.test_ids WHERE label = 'owner'), 'Solicitação do profissional');
  second_result := public.cancel_external_appointment(
    (SELECT id FROM public.test_ids WHERE label = 'owner'), 'Solicitação repetida');
  IF first_result->>'already_cancelled' <> 'false' OR second_result->>'already_cancelled' <> 'true'
     OR (SELECT vagas_usadas FROM public.quotas_externas WHERE id = '77777777-7777-4777-8777-777777777777') <> 1 THEN
    RAISE EXCEPTION 'Cancellation was not idempotent';
  END IF;
END $$;

-- Authorized staff cancels the exact linked quota.
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SELECT public.cancel_external_appointment(
  (SELECT id FROM public.test_ids WHERE label = 'capacity'), 'Cancelamento administrativo');
DO $$ BEGIN
  IF (SELECT vagas_usadas FROM public.quotas_externas WHERE id = '77777777-7777-4777-8777-777777777777') <> 0
     OR (SELECT count(*) FROM public.action_logs WHERE acao = 'cancelar_agendamento_externo') <> 2 THEN
    RAISE EXCEPTION 'Staff cancellation did not restore exactly one vacancy and audit it';
  END IF;
END $$;

-- An audit failure must roll back both status and quota update.
RESET ROLE;
ALTER TABLE public.action_logs ADD CONSTRAINT test_rollback
  CHECK (acao <> 'cancelar_agendamento_externo');
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SELECT public.expect_failure(
  'SELECT public.cancel_external_appointment((SELECT id FROM public.test_ids WHERE label = ''full''), ''Teste de rollback'')',
  'test_rollback');
DO $$ BEGIN
  IF (SELECT status FROM public.agendamentos WHERE id = (SELECT id FROM public.test_ids WHERE label = 'full')) <> 'pendente'
     OR (SELECT vagas_usadas FROM public.quotas_externas WHERE id = '88888888-8888-4888-8888-888888888888') <> 1 THEN
    RAISE EXCEPTION 'Audit failure left a partial cancellation';
  END IF;
END $$;
RESET ROLE;
ALTER TABLE public.action_logs DROP CONSTRAINT test_rollback;

-- Legacy external record without the exact UUID link requires manual review.
BEGIN;
SELECT set_config('app.external_booking_rpc', 'create', true);
INSERT INTO public.agendamentos
  (id, paciente_id, paciente_nome, unidade_id, profissional_id, profissional_nome,
   data, hora, status, origem, criado_por, agendado_por_externo)
VALUES ('ag_55555555-5555-4555-8555-555555555555', 'p4', 'Paciente 4', 'u1',
  '11111111-1111-4111-8111-111111111111', 'Profissional interno',
  current_date + 7, '11:00', 'pendente', 'externo',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
COMMIT;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SELECT public.expect_failure(
  'SELECT public.cancel_external_appointment(''ag_55555555-5555-4555-8555-555555555555'', ''Revisão Master'')',
  'Vínculo externo ausente');
RESET ROLE;

SET ROLE anon;
SELECT public.expect_failure(format(
  'SELECT public.create_external_appointment(''77777777-7777-4777-8777-777777777777'', ''p5'', %L::date, ''08:30'')',
  current_date + 7), 'permission denied');
RESET ROLE;

SELECT 'external quota integration assertions passed' AS result;
