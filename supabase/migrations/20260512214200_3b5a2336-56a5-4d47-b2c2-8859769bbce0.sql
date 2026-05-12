-- 1. Melhorar tabela profissionais_externos
ALTER TABLE public.profissionais_externos 
ADD COLUMN IF NOT EXISTS telefone TEXT,
ADD COLUMN IF NOT EXISTS documento TEXT,
ADD COLUMN IF NOT EXISTS orgao_origem TEXT,
ADD COLUMN IF NOT EXISTS responsavel TEXT,
ADD COLUMN IF NOT EXISTS observacoes TEXT,
ADD COLUMN IF NOT EXISTS permissoes JSONB DEFAULT '{
  "pode_agendar": true,
  "pode_visualizar": true,
  "pode_cancelar": true,
  "pode_editar_paciente": true,
  "pode_cadastrar_paciente": true,
  "pode_selecionar_paciente": true,
  "pode_anexar_documento": true
}'::jsonb,
ADD COLUMN IF NOT EXISTS data_validade DATE;

-- 2. Melhorar tabela quotas_externas para suportar turnos e horários
ALTER TABLE public.quotas_externas 
ADD COLUMN IF NOT EXISTS especialidade TEXT,
ADD COLUMN IF NOT EXISTS dia_semana INTEGER, -- 0-6 (Domingo-Sábado)
ADD COLUMN IF NOT EXISTS turno TEXT, -- manha, tarde, noite, integral, personalizado
ADD COLUMN IF NOT EXISTS horario_inicio TIME,
ADD COLUMN IF NOT EXISTS horario_fim TIME,
ADD COLUMN IF NOT EXISTS duracao_atendimento INTEGER DEFAULT 30, -- em minutos
ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true;

-- 3. Criar tabela de agendamentos/solicitações externas se não existir
CREATE TABLE IF NOT EXISTS public.agendamentos_externos (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    paciente_id TEXT NOT NULL, 
    profissional_externo_id UUID NOT NULL REFERENCES public.profissionais_externos(id),
    profissional_interno_id UUID REFERENCES public.funcionarios(id),
    unidade_id TEXT NOT NULL,
    cota_id UUID REFERENCES public.quotas_externas(id),
    data DATE NOT NULL,
    horario TIME NOT NULL,
    turno TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente', -- pendente, confirmado, cancelado, atendido
    observacoes TEXT,
    documento_url TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.agendamentos_externos ENABLE ROW LEVEL SECURITY;

-- Políticas para agendamentos_externos
CREATE POLICY "Externos podem ver seus próprios agendamentos" 
ON public.agendamentos_externos FOR SELECT 
USING (auth.uid() IN (SELECT auth_user_id FROM public.profissionais_externos WHERE id = profissional_externo_id));

CREATE POLICY "Externos podem criar seus agendamentos" 
ON public.agendamentos_externos FOR INSERT 
WITH CHECK (auth.uid() IN (SELECT auth_user_id FROM public.profissionais_externos WHERE id = profissional_externo_id));

CREATE POLICY "Externos podem atualizar seus agendamentos" 
ON public.agendamentos_externos FOR UPDATE 
USING (auth.uid() IN (SELECT auth_user_id FROM public.profissionais_externos WHERE id = profissional_externo_id));

-- Master/Admin podem ver tudo (baseado na tabela funcionarios)
CREATE POLICY "Admins podem ver agendamentos externos" 
ON public.agendamentos_externos FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.funcionarios WHERE auth_user_id = auth.uid() AND (role = 'master' OR role = 'admin')));

-- 4. Garantir que a tabela pacientes tenha os campos necessários para o padrão completo
ALTER TABLE public.pacientes
ADD COLUMN IF NOT EXISTS sexo TEXT,
ADD COLUMN IF NOT EXISTS raca_cor TEXT,
ADD COLUMN IF NOT EXISTS nacionalidade TEXT,
ADD COLUMN IF NOT EXISTS situacao_rua BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS cep TEXT,
ADD COLUMN IF NOT EXISTS tipo_logradouro TEXT,
ADD COLUMN IF NOT EXISTS logradouro TEXT,
ADD COLUMN IF NOT EXISTS numero TEXT,
ADD COLUMN IF NOT EXISTS complemento TEXT,
ADD COLUMN IF NOT EXISTS bairro TEXT,
ADD COLUMN IF NOT EXISTS uf TEXT,
ADD COLUMN IF NOT EXISTS telefone_secundario TEXT;

-- 5. Trigger para atualizar updated_at nos agendamentos externos
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_agendamentos_externos_updated_at') THEN
        CREATE TRIGGER update_agendamentos_externos_updated_at
            BEFORE UPDATE ON public.agendamentos_externos
            FOR EACH ROW
            EXECUTE PROCEDURE public.update_updated_at_column();
    END IF;
END $$;
