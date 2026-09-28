#!/usr/bin/env bash
set -euo pipefail

psql -X -v ON_ERROR_STOP=1 -f tests/sql/external_quota_schema.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/migrations/20260928010000_external_quota_atomic_booking.sql
psql -X -v ON_ERROR_STOP=1 -f tests/sql/external_quota_integration.sql

# Two independent sessions compete for the last quota vacancy.
psql -X -v ON_ERROR_STOP=1 -c \
  "INSERT INTO public.quotas_externas (id, profissional_externo_id, profissional_interno_id, unidade_id, vagas_total, vagas_usadas, periodo_inicio, periodo_fim, turno, ativo)
   SELECT '66666666-6666-4666-8666-666666666666', profissional_externo_id, profissional_interno_id,
          unidade_id, 1, 0, periodo_inicio, periodo_fim, 'integral', true
   FROM public.quotas_externas WHERE id = '77777777-7777-4777-8777-777777777777'" >/dev/null
set +e
psql -X -v ON_ERROR_STOP=1 -c \
  "SET ROLE authenticated; SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; SELECT public.create_external_appointment('66666666-6666-4666-8666-666666666666', 'p1', current_date + 8, '15:15');" \
  > /tmp/external_quota_race_1.log 2>&1 &
first_pid=$!
psql -X -v ON_ERROR_STOP=1 -c \
  "SET ROLE authenticated; SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; SELECT public.create_external_appointment('66666666-6666-4666-8666-666666666666', 'p2', current_date + 8, '15:15');" \
  > /tmp/external_quota_race_2.log 2>&1 &
second_pid=$!
wait "$first_pid"
first_status=$?
wait "$second_pid"
second_status=$?
set -e
if [[ "$first_status" -eq "$second_status" ]]; then
  cat /tmp/external_quota_race_1.log /tmp/external_quota_race_2.log
  echo 'Expected exactly one successful concurrent booking' >&2
  exit 1
fi
psql -X -v ON_ERROR_STOP=1 -c "DO \$\$ BEGIN
  IF (SELECT vagas_usadas FROM public.quotas_externas WHERE id = '66666666-6666-4666-8666-666666666666') <> 1
     OR (SELECT count(*) FROM public.agendamentos_externos
         WHERE cota_id = '66666666-6666-4666-8666-666666666666' AND status <> 'cancelado') <> 1 THEN
    RAISE EXCEPTION 'Concurrent creation diverged from the quota ledger';
  END IF;
END \$\$;"
echo 'External quota PostgreSQL integration tests passed.'
