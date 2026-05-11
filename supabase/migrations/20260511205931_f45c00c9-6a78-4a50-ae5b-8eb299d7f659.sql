-- Table for persistent global patient-procedure links (aligned with requested naming)
CREATE TABLE IF NOT EXISTS public.procedimentos_realizados (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    paciente_id TEXT NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
    procedimento_id UUID NOT NULL REFERENCES public.sigtap_procedimentos(id) ON DELETE CASCADE,
    data_atendimento DATE NOT NULL DEFAULT CURRENT_DATE,
    cids_selecionados TEXT[] DEFAULT '{}',
    quantidade INTEGER DEFAULT 1,
    observacao TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(paciente_id, procedimento_id, data_atendimento)
);

-- Enable RLS
ALTER TABLE public.procedimentos_realizados ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Enable all for authenticated users" ON public.procedimentos_realizados
    FOR ALL USING (auth.role() = 'authenticated');

-- Trigger function to sync prontuario procedures to global patient procedures
CREATE OR REPLACE FUNCTION public.sync_prontuario_to_global_procedures_v2()
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

-- Trigger for sync
DROP TRIGGER IF EXISTS tr_sync_prontuario_procedures ON public.prontuario_procedimentos;
CREATE TRIGGER tr_sync_prontuario_procedures
AFTER INSERT OR UPDATE ON public.prontuario_procedimentos
FOR EACH ROW EXECUTE FUNCTION public.sync_prontuario_to_global_procedures_v2();

-- Drop the old table if it exists (from my previous turn's attempt)
DROP TABLE IF EXISTS public.paciente_procedimentos_persistentes;
