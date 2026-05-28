-- Add new columns to the pts table
ALTER TABLE public.pts 
ADD COLUMN IF NOT EXISTS prioridade TEXT,
ADD COLUMN IF NOT EXISTS contextos_afetados TEXT[],
ADD COLUMN IF NOT EXISTS fatores_risco TEXT,
ADD COLUMN IF NOT EXISTS rede_apoio TEXT,
ADD COLUMN IF NOT EXISTS tipo_atendimento TEXT,
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

-- Create pts_metas table for structured goals
CREATE TABLE IF NOT EXISTS public.pts_metas (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    pts_id UUID NOT NULL REFERENCES public.pts(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    descricao TEXT,
    categoria TEXT, -- curto, médio, longo
    especialidade TEXT,
    responsavel_id TEXT, -- ID do profissional responsável
    indicador_sucesso TEXT,
    prazo_estimado DATE,
    status TEXT DEFAULT 'não iniciada', -- não iniciada, em andamento, parcialmente atingida, atingida, suspensa, cancelada
    prioridade TEXT,
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Grant permissions for pts_metas
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pts_metas TO authenticated;
GRANT ALL ON public.pts_metas TO service_role;

-- Enable RLS on pts_metas
ALTER TABLE public.pts_metas ENABLE ROW LEVEL SECURITY;

-- Create policies for pts_metas
CREATE POLICY "Users can view metas for accessible PTS" 
ON public.pts_metas FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.pts WHERE id = pts_metas.pts_id));

CREATE POLICY "Users can manage metas for accessible PTS" 
ON public.pts_metas FOR ALL 
USING (EXISTS (SELECT 1 FROM public.pts WHERE id = pts_metas.pts_id));

-- Add columns to prontuarios to link with PTS metas
ALTER TABLE public.prontuarios
ADD COLUMN IF NOT EXISTS pts_meta_id UUID REFERENCES public.pts_metas(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS pts_meta_worked BOOLEAN DEFAULT false;

-- Add trigger for updated_at in pts_metas
CREATE TRIGGER update_pts_metas_updated_at
BEFORE UPDATE ON public.pts_metas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
