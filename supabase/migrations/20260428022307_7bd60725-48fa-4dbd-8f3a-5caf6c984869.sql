ALTER TABLE public.profissionais_carimbo
ADD COLUMN IF NOT EXISTS custom_data jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profissionais_carimbo.custom_data IS
'Configurações extras do carimbo profissional: cbo, cns_profissional, cidade_uf, texto_complementar, assinatura_url, posicao (left|center|right), tamanho_carimbo, tamanho_assinatura, espacamento_antes, espacamento_depois, mostrar_linha, mostrar_nome, mostrar_conselho, mostrar_data_local';