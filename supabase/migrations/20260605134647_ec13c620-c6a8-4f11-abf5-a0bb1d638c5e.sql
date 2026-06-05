CREATE TABLE IF NOT EXISTS public.whatsapp_event_config (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    unidade_id TEXT NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
    evento TEXT NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(unidade_id, evento)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_event_config TO authenticated;
GRANT ALL ON public.whatsapp_event_config TO service_role;

ALTER TABLE public.whatsapp_event_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own unit events" ON public.whatsapp_event_config
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.funcionarios
            WHERE funcionarios.auth_user_id = auth.uid()
            AND (funcionarios.role = 'admin' OR funcionarios.unidade_id = whatsapp_event_config.unidade_id)
        )
    );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_whatsapp_event_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_whatsapp_event_config_updated_at
    BEFORE UPDATE ON public.whatsapp_event_config
    FOR EACH ROW
    EXECUTE FUNCTION public.update_whatsapp_event_config_updated_at();

-- Initial data for existing units
DO $$
DECLARE
    u_id TEXT;
    event_list TEXT[] := ARRAY[
        'agendamento_criado',
        'lembrete_24h',
        'lembrete_2h',
        'cancelamento',
        'remarcacao',
        'falta',
        'lista_espera',
        'vaga_disponivel'
    ];
    evt TEXT;
BEGIN
    FOR u_id IN SELECT id FROM public.unidades LOOP
        FOREACH evt IN ARRAY event_list LOOP
            INSERT INTO public.whatsapp_event_config (unidade_id, evento, ativo)
            VALUES (u_id, evt, true)
            ON CONFLICT (unidade_id, evento) DO NOTHING;
        END LOOP;
    END LOOP;
END $$;
