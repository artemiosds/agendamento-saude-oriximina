-- Drop existing table if it exists
DROP TABLE IF EXISTS public.paciente_profissional_status;

-- Create the table
CREATE TABLE public.paciente_profissional_status (
    paciente_id TEXT NOT NULL,
    profissional_id TEXT NOT NULL,
    total_faltas INTEGER NOT NULL DEFAULT 0,
    status_falta TEXT NOT NULL,
    ultima_falta DATE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    PRIMARY KEY (paciente_id, profissional_id)
);

-- Index for performance
CREATE INDEX idx_pps_status ON public.paciente_profissional_status(status_falta);

-- Enable RLS
ALTER TABLE public.paciente_profissional_status ENABLE ROW LEVEL SECURITY;

-- Create basic RLS policies
CREATE POLICY "Enable read access for authenticated users" 
ON public.paciente_profissional_status 
FOR SELECT 
USING (auth.role() = 'authenticated');

-- Function to refresh the status table
CREATE OR REPLACE FUNCTION public.refresh_paciente_profissional_status()
RETURNS void AS $$
BEGIN
    -- Clear current data
    TRUNCATE public.paciente_profissional_status;
    
    -- Insert fresh data from agendamentos
    -- Only unjustified, non-released absences with status 'falta'
    INSERT INTO public.paciente_profissional_status (
        paciente_id, 
        profissional_id, 
        total_faltas, 
        ultima_falta, 
        status_falta
    )
    SELECT 
        a.paciente_id, 
        a.profissional_id, 
        COUNT(*) as total_faltas,
        MAX(a.data::date) as ultima_falta,
        CASE 
            WHEN COUNT(*) >= 3 THEN 'BLOQUEADO'
            WHEN COUNT(*) > 0 THEN 'FALTOSO'
            ELSE 'REGULAR'
        END as status_falta
    FROM public.agendamentos a
    JOIN public.pacientes p ON a.paciente_id = p.id
    WHERE a.status = 'falta' 
      AND (a.tipo_falta = 'injustificada' OR a.tipo_falta IS NULL)
      AND a.falta_liberada = false
      AND p.is_tfd = false 
      AND p.possui_ordem_judicial = false
    GROUP BY a.paciente_id, a.profissional_id;

    -- Add regular entries for patients with administrative exceptions to ensure they are seen as regular
    INSERT INTO public.paciente_profissional_status (
        paciente_id,
        profissional_id,
        total_faltas,
        status_falta,
        ultima_falta
    )
    SELECT DISTINCT
        a.paciente_id,
        a.profissional_id,
        0,
        'REGULAR',
        NULL::DATE
    FROM public.agendamentos a
    JOIN public.pacientes p ON a.paciente_id = p.id
    WHERE (p.is_tfd = true OR p.possui_ordem_judicial = true)
    ON CONFLICT (paciente_id, profissional_id) DO UPDATE 
    SET total_faltas = 0, status_falta = 'REGULAR', ultima_falta = NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger logic to update status table on agendamento changes
CREATE OR REPLACE FUNCTION public.trigger_refresh_pps()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM public.refresh_paciente_profissional_status();
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_refresh_pps ON public.agendamentos;
CREATE TRIGGER tr_refresh_pps
AFTER INSERT OR UPDATE OR DELETE ON public.agendamentos
FOR EACH STATEMENT
EXECUTE FUNCTION public.trigger_refresh_pps();

-- Initial run
SELECT public.refresh_paciente_profissional_status();
