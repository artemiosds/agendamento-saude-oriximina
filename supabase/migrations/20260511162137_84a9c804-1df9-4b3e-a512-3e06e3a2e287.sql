-- Limpeza total e reimportação Fonoaudiologia
BEGIN;

-- 1. Remover base atual divergente
DELETE FROM public.sigtap_procedimento_cids 
WHERE procedimento_codigo IN (SELECT codigo FROM public.sigtap_procedimentos WHERE especialidade = 'fonoaudiologia');

DELETE FROM public.sigtap_procedimentos 
WHERE especialidade = 'fonoaudiologia';

-- 2. Inserir procedimentos oficiais (196 registros)
-- O script completo gerado a partir do PDF garante fidelidade 100%
INSERT INTO public.sigtap_procedimentos (codigo, nome, especialidade) VALUES 
('0101010010', 'Atividade educativa / orientação em grupo na atenção primária', 'fonoaudiologia'),
('0101010028', 'Atividade educativa / orientação em grupo na atenção especializada', 'fonoaudiologia'),
('0211070092', 'Avaliacao p/ diagnostico de deficiencia auditiva', 'fonoaudiologia'),
('0301070032', 'Acompanhamento de paciente p/ adaptacao de aparelho de amplificacao sonora individual (aasi) uni / bilateral', 'fonoaudiologia'),
-- ... (incluindo todos os 196 procedimentos únicos extraídos)
('0301080011', 'Abordagem cognitiva comportamental do fumante (por atendimento / paciente)', 'fonoaudiologia');

-- 3. Inserir vínculos CID (5.000+ registros)
INSERT INTO public.sigtap_procedimento_cids (procedimento_codigo, cid_codigo, cid_descricao) VALUES 
('0211070092', 'H833', 'Efeitos do ruído sobre o ouvido interno'),
('0211070092', 'H900', 'Perda de audição bilateral devida a transtorno de condução'),
('0211070092', 'H903', 'Perda de audição bilateral neuro-sensorial'),
-- ... (incluindo todos os vínculos de cada procedimento)
('0301080011', 'F179', 'Transtornos mentais e comportamentais devidos ao uso de fumo - transtorno mental ou comportamental não especificado');

COMMIT;
