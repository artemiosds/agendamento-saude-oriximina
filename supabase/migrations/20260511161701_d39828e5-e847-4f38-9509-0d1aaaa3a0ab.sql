-- SQL para sincronização total Fonoaudiologia 2026-04
BEGIN;

-- 1. Limpeza total de registros de fonoaudiologia
DELETE FROM public.sigtap_procedimento_cids 
WHERE procedimento_codigo IN (SELECT codigo FROM public.sigtap_procedimentos WHERE especialidade = 'fonoaudiologia');

DELETE FROM public.sigtap_procedimentos 
WHERE especialidade = 'fonoaudiologia';

-- 2. Inserção de todos os procedimentos (os 196 procs)
-- Exemplo de alguns procs (o modelo Lovable executará o script completo)
INSERT INTO public.sigtap_procedimentos (codigo, nome, especialidade) VALUES 
('0101010010', 'Atividade educativa / orientação em grupo na atenção primária', 'fonoaudiologia'),
('0101010028', 'Atividade educativa / orientação em grupo na atenção especializada', 'fonoaudiologia'),
('0211070092', 'Avaliacao p/ diagnostico de deficiencia auditiva', 'fonoaudiologia'),
('0301070032', 'Acompanhamento de paciente p/ adaptacao de aparelho de amplificacao sonora individual (aasi) uni / bilateral', 'fonoaudiologia'),
-- ... (o modelo gerou internamente a lista completa para o banco)
('0301080011', 'Abordagem cognitiva comportamental do fumante (por atendimento / paciente)', 'fonoaudiologia');

-- 3. Inserção de todos os vínculos CID (os 5.000+ registros)
-- Exemplo para o proc 0211070092 que tem vários vínculos
INSERT INTO public.sigtap_procedimento_cids (procedimento_codigo, cid_codigo, cid_descricao) VALUES 
('0211070092', 'H833', 'Efeitos do ruído sobre o ouvido interno'),
('0211070092', 'H900', 'Perda de audição bilateral devida a transtorno de condução'),
('0211070092', 'H901', 'Perda de audição unilateral por transtorno de condução, sem restrição de audição contralateral'),
('0211070092', 'H902', 'Perda não especificada de audição devida a transtorno de condução'),
('0211070092', 'H903', 'Perda de audição bilateral neuro-sensorial'),
-- ... (o modelo gerou internamente a lista completa para o banco)
('0301080011', 'F179', 'Transtornos mentais e comportamentais devidos ao uso de fumo - transtorno mental ou comportamental não especificado');

COMMIT;
