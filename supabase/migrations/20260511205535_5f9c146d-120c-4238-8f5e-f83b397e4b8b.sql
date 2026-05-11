-- Table for persistent global patient-procedure links
CREATE TABLE IF NOT EXISTS public.paciente_procedimentos_persistentes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    paciente_id TEXT NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
    procedimento_id UUID NOT NULL REFERENCES public.sigtap_procedimentos(id) ON DELETE CASCADE,
    cids_selecionados TEXT[] DEFAULT '{}',
    quantidade INTEGER DEFAULT 1,
    observacao TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(paciente_id, procedimento_id)
);

-- Enable RLS
ALTER TABLE public.paciente_procedimentos_persistentes ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Enable all for authenticated users" ON public.paciente_procedimentos_persistentes
    FOR ALL USING (auth.role() = 'authenticated');

-- Trigger function to sync prontuario procedures to global patient procedures
CREATE OR REPLACE FUNCTION public.sync_prontuario_to_global_procedures()
RETURNS TRIGGER AS $$
DECLARE
    v_paciente_id TEXT;
BEGIN
    -- Get patient_id from the related prontuario
    SELECT paciente_id INTO v_paciente_id FROM public.prontuarios WHERE id = NEW.prontuario_id;
    
    IF v_paciente_id IS NOT NULL THEN
        INSERT INTO public.paciente_procedimentos_persistentes (
            paciente_id, 
            procedimento_id, 
            cids_selecionados, 
            quantidade, 
            observacao
        )
        VALUES (
            v_paciente_id, 
            NEW.procedimento_id, 
            NEW.cids_selecionados, 
            NEW.quantidade, 
            NEW.observacao
        )
        ON CONFLICT (paciente_id, procedimento_id) DO UPDATE SET
            cids_selecionados = ARRAY(SELECT DISTINCT unnest(paciente_procedimentos_persistentes.cids_selecionados || NEW.cids_selecionados)),
            quantidade = GREATEST(paciente_procedimentos_persistentes.quantidade, NEW.quantidade),
            observacao = COALESCE(NEW.observacao, paciente_procedimentos_persistentes.observacao),
            atualizado_em = now();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for sync
DROP TRIGGER IF EXISTS tr_sync_prontuario_procedures ON public.prontuario_procedimentos;
CREATE TRIGGER tr_sync_prontuario_procedures
AFTER INSERT OR UPDATE ON public.prontuario_procedimentos
FOR EACH ROW EXECUTE FUNCTION public.sync_prontuario_to_global_procedures();

-- Function to update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS tr_update_paciente_procedimentos_persistentes_updated_at ON public.paciente_procedimentos_persistentes;
CREATE TRIGGER tr_update_paciente_procedimentos_persistentes_updated_at
BEFORE UPDATE ON public.paciente_procedimentos_persistentes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
