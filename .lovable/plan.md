## Controle de Atendimentos pelo Gestor Master

### Resumo
Permitir que o **Master** (perfil `admin.sms` ou `role='master'`) visualize todos os atendimentos na Agenda, identifique atendimentos travados em "Em atendimento" há muito tempo, e finalize-os silenciosamente — sempre preservando o profissional original como executor na produção e BPA.

---

### 1. Banco de dados (migration)

Adicionar à tabela `agendamentos`:
- `iniciado_em` timestamptz
- `concluido_em` timestamptz
- `concluido_por_id` text (id do usuário que clicou "concluir")
- `concluido_por_nome` text
- `concluido_por_master` boolean default false
- `procedimento_concluido` text (código SIGTAP)
- `cid_concluido` text
- `obs_conclusao` text

Funções SECURITY DEFINER:
- `concluir_atendimento_master(p_agendamento_id, p_user_id, p_user_nome, p_hora_termino, p_procedimento, p_cid, p_obs, p_is_master)` — valida (Master conclui qualquer um; profissional só os próprios), grava status `concluido`, preenche campos acima e registra em `notification_logs` (`canal='sistema'`, `evento='atendimento_concluido_master'`) para log/auditoria — **profissional NÃO é notificado** (só fica no log de auditoria).
- `get_atendimentos_pendentes_master(p_unidade_id, p_minutos)` — retorna agendamentos `status='em_atendimento'` com `iniciado_em < now() - interval`.

Config default em `system_config.configuracoes->'config_fluxo_atendimento'`:
- `alerta_minutos_em_atendimento` (default 60)
- `coordenador_pode_concluir` (default false)

### 2. Agenda (`src/pages/painel/Agenda.tsx`)

- Quando `isGlobalAdmin` ou `isUnitMaster` → não filtrar por `profissional_id`, mostrar todos. Adicionar filtro por profissional + status + período + setor.
- Em cada card: badge de status com ícone (⏳ 🔵 ✅ ❌ 🔄). Se `em_atendimento` há mais que `alerta_minutos_em_atendimento` → badge vermelho 🔴 + tooltip "X min sem finalização".
- Botão **"Em atendimento"** (Master): chama RPC `iniciar_atendimento` e grava `iniciado_em`.
- Botão **"Concluir Atendimento"** (Master): abre modal com horário término (default agora), procedimento SIGTAP (BuscaSigtap), CID-10 (BuscaCid), observação. Submete `concluir_atendimento_master`. Toast silencioso, sem disparar notificação ao profissional.

### 3. Dashboard

Acrescentar card "Atendimentos pendentes de finalização" (somente Master) usando `get_atendimentos_pendentes_master`, com link para Agenda.

### 4. Configurações (`ConfigFluxoAtendimento.tsx`)

Novo card "Controle de Atendimentos":
- Tempo máximo sem finalização (input minutos)
- Coordenador pode concluir (switch)
Persistido em `system_config.configuracoes.config_fluxo_atendimento`.

### 5. BPA / Produção

Sem alterações de lógica: a edge function `generate-bpa` e relatórios já leem `profissional_id` do agendamento (executor), que continua intocado. Apenas garantir que `procedimento_concluido` / `cid_concluido` sejam considerados quando preenchidos pelo Master (fallback para procedimento já existente). Ajustar `generate-bpa/index.ts` para usar `procedimento_concluido` quando presente.

### 6. Regras

- Master conclui silenciosamente — não toca em `prontuario` e profissional pode editar depois.
- Produção sempre no nome do profissional da agenda — campos `profissional_id`/`profissional_nome` nunca alterados.
- `concluido_por_master=true` é apenas para log/auditoria.

---

### Arquivos a alterar

- **Nova migration**: colunas + funções
- `src/pages/painel/Agenda.tsx` — bypass de filtro Master, botões e modal
- `src/pages/painel/Dashboard.tsx` — card pendentes
- `src/components/config/ConfigFluxoAtendimento.tsx` — novo card
- `supabase/functions/generate-bpa/index.ts` — usar `procedimento_concluido` quando presente
- `src/integrations/supabase/types.ts` — auto após migration