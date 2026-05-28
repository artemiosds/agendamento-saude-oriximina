-- Adicionar colunas estendidas à tabela pts (usando IF NOT EXISTS para evitar erros)
ALTER TABLE public.pts 
ADD COLUMN IF NOT EXISTS prioridade TEXT,
ADD COLUMN IF NOT EXISTS contextos_afetados TEXT[],
ADD COLUMN IF NOT EXISTS fatores_risco TEXT,
ADD COLUMN IF NOT EXISTS rede_apoio TEXT,
ADD COLUMN IF NOT EXISTS tipo_atendimento TEXT[],
ADD COLUMN IF NOT EXISTS necessidade_interdisciplinar BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS motivo_encaminhamento TEXT,
ADD COLUMN IF NOT EXISTS potencialidades TEXT,
ADD COLUMN IF NOT EXISTS barreiras TEXT,
ADD COLUMN IF NOT EXISTS justificativa_clinica TEXT,
ADD COLUMN IF NOT EXISTS plano_conduta TEXT,
ADD COLUMN IF NOT EXISTS frequencia_planejada TEXT,
ADD COLUMN IF NOT EXISTS num_sessoes_previsto INTEGER,
ADD COLUMN IF NOT EXISTS recursos_necessarios TEXT,
ADD COLUMN IF NOT EXISTS data_ultima_revisao DATE,
ADD COLUMN IF NOT EXISTS data_proxima_revisao DATE,
ADD COLUMN IF NOT EXISTS revisao_obrigatoria BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS observacao_revisao TEXT,
ADD COLUMN IF NOT EXISTS criterios_alta TEXT,
ADD COLUMN IF NOT EXISTS motivo_encerramento TEXT,
ADD COLUMN IF NOT EXISTS resumo_desfecho TEXT,
ADD COLUMN IF NOT EXISTS orientacoes_finais TEXT,
ADD COLUMN IF NOT EXISTS encaminhamentos TEXT,
ADD COLUMN IF NOT EXISTS ciencia_familia BOOLEAN DEFAULT false;

-- Criar tabela para metas estruturadas do PTS se não existir
CREATE TABLE IF NOT EXISTS public.pts_metas (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    pts_id UUID NOT NULL REFERENCES public.pts(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    descricao TEXT,
    categoria TEXT, -- Curto, Médio, Longo Prazo
    especialidade TEXT,
    responsavel TEXT,
    status TEXT DEFAULT 'Não iniciada',
    prazo_estimado DATE,
    indicador TEXT,
    prioridade TEXT DEFAULT 'Média',
    obs TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Permissões para pts_metas (repetir para garantir que existam)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pts_metas TO authenticated;
GRANT ALL ON public.pts_metas TO service_role;

-- Habilitar RLS em pts_metas
ALTER TABLE public.pts_metas ENABLE ROW LEVEL SECURITY;

-- Políticas para pts_metas (usando drop para evitar erro de 'já existe')
DROP POLICY IF EXISTS "Users can view metas for accessible PTS" ON public.pts_metas;
CREATE POLICY "Users can view metas for accessible PTS" 
ON public.pts_metas FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Users can manage metas for their PTS" ON public.pts_metas;
CREATE POLICY "Users can manage metas for their PTS" 
ON public.pts_metas FOR ALL 
USING (true);

-- Trigger para updated_at em pts_metas
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_pts_metas_updated_at') THEN
        CREATE TRIGGER update_pts_metas_updated_at
        BEFORE UPDATE ON public.pts_metas
        FOR EACH ROW
        EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;

-- Adicionar coluna para vincular evolução à meta do PTS se não existir
ALTER TABLE public.prontuarios
ADD COLUMN IF NOT EXISTS meta_pts_id UUID;
