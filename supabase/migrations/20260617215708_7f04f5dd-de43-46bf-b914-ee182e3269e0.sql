
-- fila_espera: WHERE unidade_id=? AND status NOT IN(...) ORDER BY criado_em
CREATE INDEX IF NOT EXISTS idx_fila_espera_unidade_criado
  ON public.fila_espera (unidade_id, criado_em);

CREATE INDEX IF NOT EXISTS idx_fila_espera_status_criado
  ON public.fila_espera (status, criado_em);

-- prontuarios: WHERE unidade_id=? ORDER BY data_atendimento DESC, criado_em DESC
CREATE INDEX IF NOT EXISTS idx_prontuarios_unidade_data_criado
  ON public.prontuarios (unidade_id, data_atendimento DESC, criado_em DESC);

-- pacientes: ORDER BY criado_em DESC com filtro por unidade_id (OR NULL)
CREATE INDEX IF NOT EXISTS idx_pacientes_unidade_criado
  ON public.pacientes (unidade_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_pacientes_criado_desc
  ON public.pacientes (criado_em DESC);

-- agendamentos: WHERE data >= ? AND unidade_id=? ORDER BY data DESC
CREATE INDEX IF NOT EXISTS idx_agendamentos_unidade_data_desc
  ON public.agendamentos (unidade_id, data DESC);

-- sigtap_procedimentos: WHERE ativo=true ORDER BY especialidade, nome
CREATE INDEX IF NOT EXISTS idx_sigtap_ativo_esp_nome
  ON public.sigtap_procedimentos (especialidade, nome)
  WHERE ativo = true;

ANALYZE public.fila_espera;
ANALYZE public.agendamentos;
ANALYZE public.pacientes;
ANALYZE public.prontuarios;
ANALYZE public.sigtap_procedimentos;
