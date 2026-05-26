-- 1. Converter profissional_id para UUID (garantindo que os dados atuais sejam válidos)
DELETE FROM public.paciente_profissional_status WHERE profissional_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

ALTER TABLE public.paciente_profissional_status 
  ALTER COLUMN profissional_id TYPE uuid USING profissional_id::uuid;

-- 2. Adicionar as Foreign Keys
ALTER TABLE public.paciente_profissional_status
  ADD CONSTRAINT fk_pps_paciente FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_pps_profissional FOREIGN KEY (profissional_id) REFERENCES public.funcionarios(id) ON DELETE CASCADE;

-- 3. Atualizar a função de refresh para refletir os tipos corretos
CREATE OR REPLACE FUNCTION public.refresh_paciente_profissional_status()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg jsonb;
  v_limite_alerta int := 2;
  v_limite_bloqueio int := 4;
BEGIN
    SELECT configuracoes->'config_fluxo_faltas' INTO v_cfg
      FROM public.system_config WHERE id = 'default';

    IF v_cfg IS NOT NULL THEN
      v_limite_alerta   := COALESCE((v_cfg->>'limite_alerta')::int, v_limite_alerta);
      v_limite_bloqueio := COALESCE((v_cfg->>'limite_bloqueio')::int, v_limite_bloqueio);
    END IF;

    TRUNCATE public.paciente_profissional_status;
    
    INSERT INTO public.paciente_profissional_status (
        paciente_id, 
        profissional_id, 
        total_faltas, 
        ultima_falta, 
        status_falta
    )
    SELECT 
        t.paciente_id, 
        t.profissional_id, 
        COUNT(*) as total_faltas,
        MAX(t.data_falta) as ultima_falta,
        CASE 
            WHEN COUNT(*) >= v_limite_bloqueio THEN 'BLOQUEADO'
            WHEN COUNT(*) >= v_limite_alerta THEN 'FALTOSO'
            ELSE 'REGULAR'
        END as status_falta
    FROM (
        SELECT 
            paciente_id, 
            profissional_id::uuid, 
            data::date as data_falta
        FROM public.agendamentos
        WHERE status = 'falta' 
          AND COALESCE(tipo_falta, 'injustificada') = 'injustificada'
          AND COALESCE(falta_liberada, false) = false
          AND profissional_id IS NOT NULL
        
        UNION ALL
        
        SELECT 
            patient_id as paciente_id, 
            professional_id::uuid as profissional_id, 
            scheduled_date::date as data_falta
        FROM public.treatment_sessions
        WHERE status IN ('falta', 'paciente_faltou')
          AND COALESCE(tipo_falta, 'injustificada') = 'injustificada'
          AND COALESCE(falta_liberada, false) = false
          AND professional_id IS NOT NULL
    ) t
    JOIN public.pacientes p ON t.paciente_id = p.id
    WHERE p.is_tfd = false 
      AND p.possui_ordem_judicial = false
    GROUP BY t.paciente_id, t.profissional_id;

    INSERT INTO public.paciente_profissional_status (
        paciente_id,
        profissional_id,
        total_faltas,
        status_falta,
        ultima_falta
    )
    SELECT DISTINCT
        p.id as paciente_id,
        curr.id::uuid as profissional_id,
        0,
        'REGULAR',
        NULL::DATE
    FROM public.pacientes p
    CROSS JOIN public.funcionarios curr
    WHERE (p.is_tfd = true OR p.possui_ordem_judicial = true)
    ON CONFLICT (paciente_id, profissional_id) DO UPDATE 
    SET total_faltas = 0, status_falta = 'REGULAR', ultima_falta = NULL;
END;
$function$;

-- 4. Rodar o refresh
SELECT public.refresh_paciente_profissional_status();
