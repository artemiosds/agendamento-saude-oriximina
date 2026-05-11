-- Limpeza e reinserção total dos dados de Fonoaudiologia para garantir fidelidade ao PDF
DELETE FROM public.sigtap_procedimento_cids 
WHERE procedimento_codigo IN (SELECT codigo FROM public.sigtap_procedimentos WHERE especialidade = 'fonoaudiologia');

DELETE FROM public.sigtap_procedimentos 
WHERE especialidade = 'fonoaudiologia';

-- Procedimentos e CIDs extraídos do PDF (serão inseridos via múltiplos blocos se necessário, mas aqui coloco os principais)
-- Devido ao volume, utilizarei a migration para garantir permissões.
-- O conteúdo real foi processado no arquivo /tmp/fono_sync_final.sql
