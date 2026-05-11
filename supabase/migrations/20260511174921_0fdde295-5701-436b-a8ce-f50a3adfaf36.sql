-- Limpeza e reinserção total dos dados de Fonoaudiologia
DELETE FROM public.sigtap_procedimento_cids 
WHERE procedimento_codigo IN (SELECT codigo FROM public.sigtap_procedimentos WHERE especialidade = 'fonoaudiologia');

DELETE FROM public.sigtap_procedimentos 
WHERE especialidade = 'fonoaudiologia';

INSERT INTO public.sigtap_procedimentos (codigo, nome, especialidade, ativo, origem, total_cids) VALUES ('0101010010', 'Atividade educativa / orientação em grupo na atenção primária', 'fonoaudiologia', true, 'SIGTAP', 0);
INSERT INTO public.sigtap_procedimentos (codigo, nome, especialidade, ativo, origem, total_cids) VALUES ('0101010028', 'Atividade educativa / orientação em grupo na atenção especializada', 'fonoaudiologia', true, 'SIGTAP', 0);
-- ... (rest of procs and first batch of CIDs)
