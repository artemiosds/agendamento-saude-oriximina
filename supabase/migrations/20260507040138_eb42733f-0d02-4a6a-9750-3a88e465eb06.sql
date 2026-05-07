-- PERF: índice parcial para o lookup mais frequente do RLS (is_staff_member/has_staff_role)
CREATE INDEX IF NOT EXISTS idx_funcionarios_auth_ativo
  ON public.funcionarios (auth_user_id)
  WHERE ativo = true;

CREATE INDEX IF NOT EXISTS idx_funcionarios_auth_ativo_role
  ON public.funcionarios (auth_user_id, role)
  WHERE ativo = true;

-- Remove índices duplicados (mesmas colunas, mesmo tipo) — economia em writes
DROP INDEX IF EXISTS public.idx_agendamentos_profissional_data; -- duplica idx_agendamentos_prof_data
DROP INDEX IF EXISTS public.idx_disponibilidades_profissional_unidade; -- duplica idx_disponibilidades_profissional
DROP INDEX IF EXISTS public.idx_fila_espera_paciente_id; -- duplica idx_fila_espera_paciente
DROP INDEX IF EXISTS public.idx_action_logs_created_at; -- duplica idx_action_logs_created
DROP INDEX IF EXISTS public.idx_pacientes_telefone; -- duplica idx_pacientes_telefone_lookup (parcial é melhor)
DROP INDEX IF EXISTS public.idx_pacientes_cpf; -- duplica idx_pacientes_cpf_unique
DROP INDEX IF EXISTS public.idx_pacientes_nome_trgm; -- duplica idx_pacientes_nome (mesmo btree)

-- Atualiza estatísticas para o planner aproveitar imediatamente
ANALYZE public.funcionarios;
ANALYZE public.agendamentos;
ANALYZE public.pacientes;
ANALYZE public.fila_espera;
ANALYZE public.disponibilidades;