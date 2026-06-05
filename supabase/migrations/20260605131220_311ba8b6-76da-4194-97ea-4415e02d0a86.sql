-- Remover a coluna de consentimento operacional
ALTER TABLE public.pacientes DROP COLUMN IF EXISTS whatsapp_opt_in_operational;

-- Garantir que as outras colunas de consentimento existam e tenham valores padrão corretos
-- (Elas já devem existir, mas é uma segurança)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pacientes' AND column_name = 'whatsapp_opt_in_marketing') THEN
        ALTER TABLE public.pacientes ADD COLUMN whatsapp_opt_in_marketing BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pacientes' AND column_name = 'whatsapp_opt_in_waiting_list') THEN
        ALTER TABLE public.pacientes ADD COLUMN whatsapp_opt_in_waiting_list BOOLEAN DEFAULT false;
    END IF;
END $$;

COMMENT ON COLUMN public.pacientes.whatsapp_opt_in_marketing IS 'Consentimento para mensagens de marketing e campanhas.';
COMMENT ON COLUMN public.pacientes.whatsapp_opt_in_waiting_list IS 'Consentimento para lista de espera e vagas disponíveis.';
