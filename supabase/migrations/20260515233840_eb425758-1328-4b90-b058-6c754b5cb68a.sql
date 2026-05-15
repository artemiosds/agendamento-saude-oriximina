-- Permite que prontuario_procedimentos referencie procedimentos do catálogo unificado
-- (sigtap_procedimentos) além da tabela legada procedimentos. Sem a remoção da FK,
-- inserts de procedimentos vindos do catálogo SIGTAP falhavam silenciosamente,
-- causando perda total dos vínculos no prontuário e linhas vazias na BPA.
ALTER TABLE public.prontuario_procedimentos
  DROP CONSTRAINT IF EXISTS prontuario_procedimentos_procedimento_id_fkey;

-- Índice para acelerar buscas por procedimento_id
CREATE INDEX IF NOT EXISTS idx_prontuario_procs_proc_id
  ON public.prontuario_procedimentos (procedimento_id);