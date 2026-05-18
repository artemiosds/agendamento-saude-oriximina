# Plano — Controle de Faltas (FALTOSO / BLOQUEADO)

Antes de implementar preciso alinhar pontos que conflitam com o esquema atual e com as regras do projeto:

## Conflitos / decisões necessárias

1. **Memória do projeto proíbe novas tabelas.** O prompt pede `config_fluxo_faltas`. Proposta: salvar limites em `system_config.configuracoes.config_fluxo_faltas` (JSON por unidade), preservando a regra de "não criar tabelas novas".
2. **IDs do paciente são `text`, não `uuid`.** Vou usar `text` em todas as funções.
3. **`fila_espera` não tem coluna `origem` nem `atendido_em`.** Tem `origem_cadastro` e `status`. Vou usar `origem_cadastro = 'BLOQUEIO_FALTA'` e marcar saída via `status = 'atendido'` + `hora_chamada`.
4. **Não existe sistema interno de notificações in-app.** Vou registrar evento em `notification_logs` (já existente) com `canal='sistema'` e `evento='paciente_faltoso'/'paciente_bloqueado'`. WhatsApp usa a integração já existente.
5. **`treatment_sessions.status` usa valores tipo `paciente_faltou`** (conforme função existente), não `falta`. Vou contar ambos: `status IN ('falta','paciente_faltou')`.

## [1] Banco de dados (migration)

- `ALTER TABLE pacientes` adicionar `total_faltas int default 0`, `faltas_consecutivas int default 0`, `status_falta text default 'REGULAR'`.
- Funções SECURITY DEFINER:
  - `atualizar_status_falta(p_paciente_id text)` — lê limites em `system_config`, conta faltas em `agendamentos` + `treatment_sessions`, atualiza `pacientes`, insere em `fila_espera` se BLOQUEADO, grava notificação.
  - `resetar_faltas_paciente(p_paciente_id text)` — zera contadores, marca registro da fila como atendido.
  - `desbloquear_paciente_faltas(p_paciente_id text, p_user_id uuid)` — mesmo reset + log em `notification_logs`.
- Backfill: rodar `atualizar_status_falta` para todos os pacientes.

## [2] Agenda

- `ModalAgendarSessao` / fluxos de agendamento: bloquear botão "Agendar" quando `status_falta='BLOQUEADO'` com tooltip.
- Hook que registra falta (`appointmentService`) chama `atualizar_status_falta`.
- Confirmar chegada / concluir → `resetar_faltas_paciente`.
- Badge FALTOSO/BLOQUEADO no card do paciente.

## [3] Perfil do paciente

- `FichaPacienteCabecalho`: badge + "X falta(s) registrada(s)" conforme status.

## [4] Prontuário

- Ao salvar prontuário (handler central) → `resetar_faltas_paciente`.

## [5] Configurações → Fluxo de Atendimento

- Adicionar cartão "Controle de Faltas" em `ConfigFluxoAtendimento.tsx` com: `limite_alerta` (padrão 2), `limite_bloqueio` (padrão 4), `canal_sistema`, `canal_whatsapp`. Persistido em `system_config.configuracoes.config_fluxo_faltas`.

## [6] Rota `/faltosos`

- Nova página + rota em `App.tsx` + item no menu (visível para roles master/gestor/coordenador/recepção).
- Tabela com filtros (status, período, busca), botão "Remover bloqueio" só para master/gestor → chama `desbloquear_paciente_faltas`.
- Isolamento via `useUnidadeFilter`.

## [7] Ordem na fila

- Ajustar `waitingListService.getAll` e renderização da fila para ordenar:
  1. `origem_cadastro` regular
  2. FALTOSO (pacientes com `status_falta='FALTOSO'`)
  3. `origem_cadastro='BLOQUEIO_FALTA'`

## [8] Notificações

- Em `atualizar_status_falta`: insert em `notification_logs` para profissional responsável (FALTOSO) e profissional+gestor (BLOQUEADO). Se `canal_whatsapp=true`, dispara via integração existente.

## Confirmar antes de prosseguir

- OK usar `system_config` em vez de criar tabela `config_fluxo_faltas`?
- OK contar faltas considerando `treatment_sessions.status IN ('falta','paciente_faltou')`?
- OK usar `fila_espera.origem_cadastro='BLOQUEIO_FALTA'` (no lugar de campo `origem`)?

Se confirmar os 3 pontos, executo migration + código numa única passada.
