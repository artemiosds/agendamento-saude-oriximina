-- Drop existing functions to avoid parameter mismatch errors
DROP FUNCTION IF EXISTS public.atualizar_status_falta(text);
DROP FUNCTION IF EXISTS public.atualizar_status_falta(text, text);

-- Recreate the two-parameter version of the atualizar_status_falta function
CREATE OR REPLACE FUNCTION public.atualizar_status_falta(p_paciente_id text, p_profissional_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_cfg jsonb;
  v_limite_alerta int := 2;
  v_limite_bloqueio int := 4;
  v_is_tfd boolean;
  v_ordem_judicial boolean;
  v_paciente_nome text;
  
  curr_prof RECORD;
  
  v_faltas_ag int := 0;
  v_faltas_sess int := 0;
  v_total int := 0;
  v_novo_status text;
  v_ultima_falta_ag date;
  v_ultima_falta_sess date;
  v_ultima_falta date;
  
  v_res jsonb := '[]'::jsonb;
BEGIN
  -- 1. Carregar configurações
  SELECT configuracoes->'config_fluxo_faltas' INTO v_cfg
    FROM public.system_config WHERE id = 'default';

  IF v_cfg IS NOT NULL THEN
    v_limite_alerta   := COALESCE((v_cfg->>'limite_alerta')::int, v_limite_alerta);
    v_limite_bloqueio := COALESCE((v_cfg->>'limite_bloqueio')::int, v_limite_bloqueio);
  END IF;

  -- 2. Verificar isenção global do paciente
  SELECT nome, COALESCE(is_tfd, false), COALESCE(possui_ordem_judicial, false)
    INTO v_paciente_nome, v_is_tfd, v_ordem_judicial
    FROM public.pacientes WHERE id = p_paciente_id;
    
  IF v_paciente_nome IS NULL THEN
    RETURN jsonb_build_object('error','paciente_nao_encontrado');
  END IF;

  -- 3. Identificar profissionais afetados
  FOR curr_prof IN 
    SELECT DISTINCT prof_id FROM (
      SELECT profissional_id as prof_id FROM public.agendamentos WHERE paciente_id = p_paciente_id AND status = 'falta'
      UNION
      SELECT professional_id as prof_id FROM public.treatment_sessions WHERE patient_id = p_paciente_id AND status IN ('falta','paciente_faltou')
      UNION 
      SELECT p_profissional_id WHERE p_profissional_id IS NOT NULL
    ) t 
    WHERE prof_id IS NOT NULL 
      AND prof_id <> ''
      AND prof_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  LOOP
    -- Se p_profissional_id foi passado, ignora os outros no loop
    IF p_profissional_id IS NOT NULL AND curr_prof.prof_id <> p_profissional_id THEN
      CONTINUE;
    END IF;

    -- Contagem por profissional - Agenda
    SELECT COUNT(*), MAX(data::date) INTO v_faltas_ag, v_ultima_falta_ag
      FROM public.agendamentos
     WHERE paciente_id = p_paciente_id
       AND profissional_id = curr_prof.prof_id
       AND status = 'falta'
       AND COALESCE(tipo_falta, 'injustificada') = 'injustificada'
       AND COALESCE(falta_liberada, false) = false;

    -- Contagem por profissional - Sessões
    SELECT COUNT(*), MAX(scheduled_date::date) INTO v_faltas_sess, v_ultima_falta_sess
      FROM public.treatment_sessions
     WHERE patient_id = p_paciente_id
       AND professional_id = curr_prof.prof_id
       AND status IN ('falta','paciente_faltou')
       AND COALESCE(tipo_falta, 'injustificada') = 'injustificada'
       AND COALESCE(falta_liberada, false) = false;

    v_total := COALESCE(v_faltas_ag, 0) + COALESCE(v_faltas_sess, 0);
    v_ultima_falta := GREATEST(v_ultima_falta_ag, v_ultima_falta_sess);

    -- Lógica de status (respeita isenção global)
    IF v_is_tfd OR v_ordem_judicial THEN
      v_novo_status := 'REGULAR';
    ELSIF v_total >= v_limite_bloqueio THEN
      v_novo_status := 'BLOQUEADO';
    ELSIF v_total >= v_limite_alerta THEN
      v_novo_status := 'FALTOSO';
    ELSE
      v_novo_status := 'REGULAR';
    END IF;

    -- Upsert na tabela de status por profissional com cast explícito para uuid
    INSERT INTO public.paciente_profissional_status (
      paciente_id, profissional_id, total_faltas, status_falta, ultima_falta, updated_at
    ) VALUES (
      p_paciente_id, curr_prof.prof_id::uuid, v_total, v_novo_status, v_ultima_falta, now()
    ) ON CONFLICT (paciente_id, profissional_id) DO UPDATE SET
      total_faltas = EXCLUDED.total_faltas,
      status_falta = EXCLUDED.status_falta,
      ultima_falta = EXCLUDED.ultima_falta,
      updated_at = now();

    v_res := v_res || jsonb_build_object(
      'profissional_id', curr_prof.prof_id,
      'total', v_total,
      'status', v_novo_status
    );
  END LOOP;

  -- 4. Atualizar também o status global no cadastro do paciente
  IF v_is_tfd OR v_ordem_judicial THEN
      v_novo_status := 'REGULAR';
  ELSE
      SELECT COALESCE(MAX(CASE 
          WHEN status_falta = 'BLOQUEADO' THEN 3 
          WHEN status_falta = 'FALTOSO' THEN 2 
          ELSE 1 END), 1) INTO v_total
      FROM public.paciente_profissional_status
      WHERE paciente_id = p_paciente_id;
      
      v_novo_status := CASE WHEN v_total = 3 THEN 'BLOQUEADO' WHEN v_total = 2 THEN 'FALTOSO' ELSE 'REGULAR' END;
  END IF;

  UPDATE public.pacientes 
     SET status_falta = v_novo_status,
         total_faltas = (SELECT COALESCE(SUM(total_faltas), 0) FROM public.paciente_profissional_status WHERE paciente_id = p_paciente_id)
   WHERE id = p_paciente_id;

  RETURN jsonb_build_object('ok', true, 'vinculos', v_res, 'status_global', v_novo_status);
END;
$function$;

-- Create the single-parameter version as a wrapper
CREATE OR REPLACE FUNCTION public.atualizar_status_falta(p_paciente_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN public.atualizar_status_falta(p_paciente_id, NULL);
END;
$function$;
