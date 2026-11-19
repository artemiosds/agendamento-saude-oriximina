-- Use only in isolated PostgreSQL. All fixtures are synthetic and rolled back.
BEGIN;
DO $test$
DECLARE
  manager uuid := gen_random_uuid();
  viewer uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  professional uuid := gen_random_uuid();
  monday date := '2026-11-23';
  days date[] := array['2026-11-24'::date,'2026-12-04','2026-11-29'];
  stored jsonb;
  response jsonb;
  remove_id uuid;
  series_id uuid;
BEGIN
  INSERT INTO public.system_config(id,configuracoes) VALUES ('default','{"preservar":true}');
  INSERT INTO public.unidades(id,nome) VALUES ('local-a','Unidade A'), ('local-b','Unidade B');
  INSERT INTO public.funcionarios(id,auth_user_id,nome,usuario,email,role,unidade_id,ativo,custom_data) VALUES
    (gen_random_uuid(),manager,'Gestão fictícia',manager::text,manager::text || '@example.invalid','gestao','local-a',true,'{}'),
    (gen_random_uuid(),viewer,'Recepção fictícia',viewer::text,viewer::text || '@example.invalid','recepcao','local-a',true,'{}'),
    (gen_random_uuid(),outsider,'Gestão de outra unidade',outsider::text,outsider::text || '@example.invalid','gestao','local-b',true,'{}'),
    (professional,null,'Profissional fictício',professional::text,professional::text || '@example.invalid','profissional','local-a',true,'{"preservar":true}');
  INSERT INTO public.disponibilidades(id,profissional_id,unidade_id,data_inicio,data_fim,hora_inicio,hora_fim,dias_semana) VALUES
    ('grade-original',professional::text,'local-a',monday,monday+14,'08:00','12:00',array[1]);

  IF has_function_privilege('anon','public.listar_escalas_personalizadas(date,date)','EXECUTE')
     OR has_function_privilege('anon','public.salvar_escalas_personalizadas(uuid,text,text,text,date[],time,integer,boolean,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.remover_escala_personalizada(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous may not use roster RPCs';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',manager::text,true);
  PERFORM set_config('role','authenticated',true);

  IF public.salvar_escalas_personalizadas(professional,null,' Maternidade Municipal ','Sala de Parto',days || days[1],'14:00',240,false,null) <> 3 THEN
    RAISE EXCEPTION 'Free local and exact dates across months failed';
  END IF;
  IF public.salvar_escalas_personalizadas(professional,null,'Polo fluvial',null,array[monday+5],'08:00',1440,false,null) <> 1 THEN
    RAISE EXCEPTION '24h shift failed';
  END IF;
  IF public.salvar_escalas_personalizadas(professional,'local-a','Unidade A','Setor oficial',array[monday,monday+7,monday+2],'08:00',240,true,null) <> 2 THEN
    RAISE EXCEPTION 'Recurring date normalization or official merge failed';
  END IF;
  response := public.listar_escalas_personalizadas(monday,monday+18);
  IF jsonb_array_length(response) <> 6 OR NOT EXISTS (
    SELECT FROM jsonb_array_elements(response) e WHERE e->>'duracao'='1440' AND e->>'inicio'='08:00' AND e->>'fim'='08:00'
  ) OR NOT EXISTS (SELECT FROM jsonb_array_elements(response) e WHERE e->>'local'='Maternidade Municipal'
    AND e->>'setor'='Sala de Parto' AND e->>'data'='2026-12-04') THEN
    RAISE EXCEPTION 'Stored roster attributes did not survive a read';
  END IF;
  SELECT (e->>'id')::uuid INTO remove_id FROM jsonb_array_elements(response) e WHERE e->>'data'=days[1]::text;
  SELECT (e->>'id')::uuid INTO series_id FROM jsonb_array_elements(response) e WHERE e->>'data'=(monday+2)::text AND e->>'semanal'='true';
  IF public.salvar_escalas_personalizadas(professional,null,'Outro local',null,array[monday+9],'09:00',120,false,series_id) <> 1 THEN
    RAISE EXCEPTION 'Weekly exception failed';
  END IF;
  response := public.listar_escalas_personalizadas(monday,monday+18);
  BEGIN
    PERFORM public.salvar_escalas_personalizadas(professional,null,'Passa da madrugada',null,array[monday,monday+6],'23:00',720,false,null);
    RAISE EXCEPTION 'Overnight clash with next Monday booking grade accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Conflito com a grade%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.salvar_escalas_personalizadas(professional,null,'Duplicado',null,array[monday-6,days[1]],'14:30',60,false,null);
    RAISE EXCEPTION 'Manual clash accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Já existe uma escala%' THEN RAISE; END IF;
  END;
  IF public.listar_escalas_personalizadas(monday-6,monday+18) IS DISTINCT FROM response THEN
    RAISE EXCEPTION 'A failed batch left partial writes';
  END IF;
  IF EXISTS (SELECT FROM public.system_config WHERE id='escalas_personalizadas') OR NOT EXISTS (
    SELECT FROM public.system_config WHERE id='default' AND configuracoes->>'preservar'='true'
  ) THEN RAISE EXCEPTION 'Direct RLS behavior was not isolated to the roster row'; END IF;

  PERFORM set_config('request.jwt.claim.sub',viewer::text,true);
  IF jsonb_array_length(public.listar_escalas_personalizadas(monday,monday+18)) <> 7 THEN
    RAISE EXCEPTION 'Reception cannot consult their unit';
  END IF;
  BEGIN
    PERFORM public.remover_escala_personalizada(remove_id);
    RAISE EXCEPTION 'Reception cannot delete';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
  IF public.listar_escalas_personalizadas(monday,monday+18) <> '[]'::jsonb THEN RAISE EXCEPTION 'Cross-unit read allowed'; END IF;
  BEGIN
    PERFORM public.salvar_escalas_personalizadas(professional,null,'Tentativa',null,days,'16:00',120,false,null);
    RAISE EXCEPTION 'Cross-unit save allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.remover_escala_personalizada(remove_id);
    RAISE EXCEPTION 'Cross-unit delete allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub',manager::text,true);
  PERFORM public.remover_escala_personalizada(remove_id);
  PERFORM set_config('role','none',true);
  SELECT configuracoes->'escalas_personalizadas' INTO stored FROM public.system_config WHERE id='escalas_personalizadas';
  IF jsonb_array_length(stored) <> 6 OR EXISTS (SELECT FROM jsonb_array_elements(stored) e WHERE e->>'id'=remove_id::text)
    OR (SELECT count(*) FROM public.action_logs WHERE entidade='escala_personalizada' AND acao='salvar') <> 4
    OR (SELECT count(*) FROM public.action_logs WHERE entidade='escala_personalizada' AND acao='remover') <> 1
    OR (SELECT count(*) FROM public.disponibilidades WHERE profissional_id=professional::text) <> 1
    OR (SELECT configuracoes FROM public.system_config WHERE id='default') <> '{"preservar":true}'::jsonb
    OR (SELECT custom_data FROM public.funcionarios WHERE id=professional) <> '{"preservar":true}'::jsonb THEN
    RAISE EXCEPTION 'Audit, delete, or existing grade/config records changed unexpectedly';
  END IF;
  PERFORM set_config('test.roster_verified','true',true);
END $test$;
SELECT current_setting('test.roster_verified',true)::boolean AS roster_verified;
ROLLBACK;
