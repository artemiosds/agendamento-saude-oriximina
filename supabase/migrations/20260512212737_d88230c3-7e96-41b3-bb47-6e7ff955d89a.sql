-- Add 'monitoramento_sistema' to the list of modules if needed (this is application level but good for documentation)

-- Create snapshots table
CREATE TABLE IF NOT EXISTS public.system_monitoring_snapshots (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    status_geral TEXT NOT NULL,
    db_status TEXT,
    storage_status TEXT,
    hosting_status TEXT,
    total_registros INTEGER,
    total_arquivos INTEGER,
    alertas_count INTEGER,
    payload JSONB
);

-- Create alerts table
CREATE TABLE IF NOT EXISTS public.system_monitoring_alerts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    severity TEXT NOT NULL, -- 'critico', 'atencao', 'normal'
    title TEXT NOT NULL,
    description TEXT,
    source TEXT,
    recommendation TEXT,
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES auth.users(id)
);

-- Create cleanup logs table
CREATE TABLE IF NOT EXISTS public.system_cleanup_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    cleanup_type TEXT NOT NULL,
    items_count INTEGER,
    details JSONB,
    status TEXT,
    error_message TEXT
);

-- Create settings table
CREATE TABLE IF NOT EXISTS public.system_monitoring_settings (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    hosting_type TEXT,
    public_url TEXT,
    api_url TEXT,
    coolify_url TEXT,
    monitoring_enabled BOOLEAN DEFAULT true,
    config JSONB
);

-- Enable RLS on all tables
ALTER TABLE public.system_monitoring_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_monitoring_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_cleanup_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_monitoring_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for MASTER access only
-- We check for the 'master' role in the funcionarios table linked to the user
CREATE POLICY "Master can view system_monitoring_snapshots" ON public.system_monitoring_snapshots
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = auth.uid() AND LOWER(TRIM(f.role)) = 'master'));

CREATE POLICY "Master can insert system_monitoring_snapshots" ON public.system_monitoring_snapshots
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = auth.uid() AND LOWER(TRIM(f.role)) = 'master'));

CREATE POLICY "Master can view system_monitoring_alerts" ON public.system_monitoring_alerts
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = auth.uid() AND LOWER(TRIM(f.role)) = 'master'));

CREATE POLICY "Master can update system_monitoring_alerts" ON public.system_monitoring_alerts
    FOR UPDATE USING (EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = auth.uid() AND LOWER(TRIM(f.role)) = 'master'));

CREATE POLICY "Master can view system_cleanup_logs" ON public.system_cleanup_logs
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = auth.uid() AND LOWER(TRIM(f.role)) = 'master'));

CREATE POLICY "Master can insert system_cleanup_logs" ON public.system_cleanup_logs
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = auth.uid() AND LOWER(TRIM(f.role)) = 'master'));

CREATE POLICY "Master can view system_monitoring_settings" ON public.system_monitoring_settings
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = auth.uid() AND LOWER(TRIM(f.role)) = 'master'));

CREATE POLICY "Master can manage system_monitoring_settings" ON public.system_monitoring_settings
    FOR ALL USING (EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = auth.uid() AND LOWER(TRIM(f.role)) = 'master'));

-- Trigger for updating timestamps on settings
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_system_monitoring_settings_updated_at
BEFORE UPDATE ON public.system_monitoring_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
