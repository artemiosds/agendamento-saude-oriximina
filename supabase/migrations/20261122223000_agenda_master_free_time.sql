-- Extend the existing audited Master exception without replacing its security,
-- unit, care-period, SIGTAP, transaction or insertion logic.
do $migration$
declare
  original text := pg_get_functiondef(
    'public.create_internal_appointment_with_policy_override(jsonb,text,boolean,boolean)'::regprocedure
  );
  updated text;
  old_reasons text := '''external_reservation'', ''day_full'', ''turno_full'', ''hour_full''';
  new_reasons text := '''external_reservation'', ''day_full'', ''turno_full'', ''hour_full'', ''no_availability'', ''outside_grid'', ''availability_conflict''';
begin
  if position(old_reasons in original) = 0 then
    raise exception 'A lista de exceções Master diverge da versão conferida.';
  end if;
  updated := replace(original, old_reasons, new_reasons);
  if position('''motivo'', btrim(p_override_reason),' in updated) = 0 then
    raise exception 'O registro de auditoria diverge da versão conferida.';
  end if;
  updated := replace(updated,
    '''motivo'', btrim(p_override_reason),',
    '''motivo'', btrim(p_override_reason), ''motivo_alteracao'', btrim(p_override_reason),');
  execute updated;
end;
$migration$;
