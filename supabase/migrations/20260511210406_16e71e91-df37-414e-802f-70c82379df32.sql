-- 1. Relax constraints to ensure we can capture all procedure and patient mappings from history
ALTER TABLE public.procedimentos_realizados DROP CONSTRAINT IF EXISTS procedimentos_realizados_procedimento_id_fkey;
ALTER TABLE public.procedimentos_realizados DROP CONSTRAINT IF EXISTS procedimentos_realizados_paciente_id_fkey;

-- 2. Ensure the trigger function is correctly configured (V4)
CREATE OR REPLACE FUNCTION public.sync_prontuario_to_global_procedures_v4()
RETURNS TRIGGER AS $$
DECLARE
    v_paciente_id TEXT;
    v_data_atendimento DATE;
BEGIN
    -- Get patient_id and data_atendimento from the related prontuario
    SELECT paciente_id, data_atendimento INTO v_paciente_id, v_data_atendimento 
    FROM public.prontuarios 
    WHERE id = NEW.prontuario_id;
    
    IF v_paciente_id IS NOT NULL AND v_data_atendimento IS NOT NULL THEN
        -- Insert into the global table
        INSERT INTO public.procedimentos_realizados (
            paciente_id, 
            procedimento_id, 
            data_atendimento,
            cids_selecionados, 
            quantidade, 
            observacao
        )
        VALUES (
            v_paciente_id, 
            NEW.procedimento_id, 
            v_data_atendimento,
            NEW.cids_selecionados, 
            NEW.quantidade, 
            NEW.observacao
        )
        ON CONFLICT (paciente_id, procedimento_id, data_atendimento) DO UPDATE SET
            cids_selecionados = ARRAY(SELECT DISTINCT unnest(procedimentos_realizados.cids_selecionados || NEW.cids_selecionados)),
            quantidade = GREATEST(procedimentos_realizados.quantidade, NEW.quantidade),
            observacao = COALESCE(NEW.observacao, procedimentos_realizados.observacao),
            atualizado_em = now();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Re-attach trigger
DROP TRIGGER IF EXISTS tr_sync_prontuario_procedures ON public.prontuario_procedimentos;
CREATE TRIGGER tr_sync_prontuario_procedures
AFTER INSERT OR UPDATE ON public.prontuario_procedimentos
FOR EACH ROW EXECUTE FUNCTION public.sync_prontuario_to_global_procedures_v4();

-- 4. Backfill historical data (filtering to ensure only valid existing patients are included)
INSERT INTO public.procedimentos_realizados (
    paciente_id, 
    procedimento_id, 
    data_atendimento,
    cids_selecionados, 
    quantidade, 
    observacao
)
SELECT 
    p.paciente_id,
    pp.procedimento_id,
    p.data_atendimento,
    pp.cids_selecionados,
    pp.quantidade,
    pp.observacao
FROM public.prontuario_procedimentos pp
JOIN public.prontuarios p ON pp.prontuario_id = p.id
WHERE EXISTS (SELECT 1 FROM public.pacientes WHERE id = p.paciente_id)
ON CONFLICT (paciente_id, procedimento_id, data_atendimento) DO NOTHING;
