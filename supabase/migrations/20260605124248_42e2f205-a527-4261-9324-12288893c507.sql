-- Alterar o padrão da coluna para true
ALTER TABLE public.pacientes ALTER COLUMN whatsapp_opt_in_operational SET DEFAULT true;

-- Atualizar todos os pacientes existentes para o novo padrão (operacional ativo)
-- Mantemos marketing e lista de espera como estão ou conforme regra (falso por padrão)
UPDATE public.pacientes SET whatsapp_opt_in_operational = true WHERE whatsapp_opt_in_operational IS NOT TRUE;

-- Garantir que as colunas marketing e waiting_list tenham padrão false se não tiverem
ALTER TABLE public.pacientes ALTER COLUMN whatsapp_opt_in_marketing SET DEFAULT false;
ALTER TABLE public.pacientes ALTER COLUMN whatsapp_opt_in_waiting_list SET DEFAULT false;

-- Adicionar um comentário explicativo na tabela para referência futura
COMMENT ON COLUMN public.pacientes.whatsapp_opt_in_operational IS 'Consentimento para mensagens operacionais (agendamentos, lembretes, etc). Ativo por padrão.';
