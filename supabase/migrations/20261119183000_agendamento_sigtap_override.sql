-- Preserve the installed authorization and audit checks; extend only the INSERT.
do $migration$
declare
  original text := pg_get_functiondef('public.create_internal_appointment_with_policy_override(jsonb,text,boolean,boolean)'::regprocedure);
  columns_sql text := 'observacoes, origem, criado_por, prioridade_perfil';
  values_sql text := $$coalesce(p_payload->>'origem', 'recepcao'), v_staff.id::text, 'normal'$$;
begin
  if position(columns_sql || ', procedimento_sigtap' in original)>0 then return; end if;
  if position(columns_sql in original)=0 or position(values_sql in original)=0 then
    raise exception 'Definição de encaixe diferente da versão conferida';
  end if;
  execute replace(replace(original, columns_sql, columns_sql || ', procedimento_sigtap, nome_procedimento, custom_data'),
    values_sql, values_sql || $$, coalesce(p_payload->>'procedimento_sigtap',''), coalesce(p_payload->>'nome_procedimento',''), jsonb_strip_nulls(jsonb_build_object('procedimentos_agendados',p_payload#>'{custom_data,procedimentos_agendados}','fila_regulacao_id',p_payload#>'{custom_data,fila_regulacao_id}'))$$);
end $migration$;
