## Objetivo

Refatorar o fluxo de faltas para que **somente faltas injustificadas** contem para bloqueio, adicionar **exceção administrativa TFD / Ordem Judicial** ao paciente, e restaurar o botão **"Liberar Falta / Regularizar"** na tela `Pacientes Faltosos / Bloqueados`, sem tocar em Prontuário, BPA, Relatórios ou Configurações globais.

---

## 1. Banco de dados (migração)

### 1.1 Tabela `pacientes` — colunas novas
- `is_tfd boolean default false`
- `possui_ordem_judicial boolean default false`
- `motivo_excecao_bloqueio text`
- `observacao_tfd_ordem_judicial text`
- `data_marcacao_excecao timestamptz`
- `marcado_por uuid`

Índice parcial: `where is_tfd = true or possui_ordem_judicial = true`.

### 1.2 Tabela `agendamentos` — colunas novas
- `tipo_falta text` (`'justificada' | 'injustificada'`)
- `falta_justificativa text`
- `falta_liberada boolean default false`
- `liberada_em timestamptz`
- `liberada_por uuid`
- `motivo_liberacao text`

(Hoje o tipo só fica no campo `observacoes`; agora persistido em coluna real.)

### 1.3 Tabela `treatment_sessions` — colunas equivalentes
- `tipo_falta text`
- `falta_justificativa text`
- `falta_liberada boolean default false`
- `liberada_em timestamptz`
- `liberada_por uuid`
- `motivo_liberacao text`

### 1.4 Função `atualizar_status_falta(p_paciente_id)` — reescrever
- Conta APENAS faltas onde `status='falta' AND coalesce(tipo_falta,'injustificada')='injustificada' AND coalesce(falta_liberada,false)=false`.
- Se `is_tfd OR possui_ordem_judicial` → força `status_falta='REGULAR'`, NÃO insere na fila, registra log informativo de isenção.
- Mantém limites configurados em `system_config.config_fluxo_faltas`.
- Sempre limpa entradas `fila_espera` com `origem_cadastro='BLOQUEIO_FALTA'` quando paciente sai de BLOQUEADO.

### 1.5 Novas funções RPC
- `liberar_falta(p_agendamento_id, p_session_id, p_motivo, p_user_id, p_user_nome, p_all bool)` — marca uma ou todas as faltas injustificadas do paciente como `falta_liberada=true`, registra log e chama `atualizar_status_falta`.
- `set_excecao_bloqueio(p_paciente_id, p_is_tfd, p_ordem_judicial, p_motivo, p_obs, p_user_id)` — grava colunas, registra auditoria, dispara `atualizar_status_falta`.

### 1.6 Auditoria
- Usar `notification_logs` (já é o canal usado pelas funções existentes) com eventos: `paciente_tfd_marcado`, `paciente_tfd_desmarcado`, `paciente_ordem_judicial_marcado`, `paciente_ordem_judicial_desmarcado`, `falta_liberada`, `falta_justificada`, `falta_injustificada`.

---

## 2. Helpers TS centralizados

Criar `src/lib/faltasUtils.ts`:
- `isFaltaJustificada(reg)` e `isFaltaInjustificada(reg)` — lê `tipo_falta` direto na coluna, fallback no `observacoes` legacy.
- `isPacienteIsentoBloqueio(paciente)` — testa colunas novas e fallback em `custom_data.is_tfd / possui_ordem_judicial`.
- `getExcecaoLabel(paciente)` — retorna `'TFD' | 'Ordem Judicial' | null` para badges.

---

## 3. UI — Pacientes (CadastroPacienteForm)

Aba "Complementares" (ou bloco novo "Condições administrativas"):
- Checkbox **Paciente TFD**
- Checkbox **Paciente com Ordem Judicial**
- Campo **Motivo da exceção** (obrigatório se algum dos dois marcado)
- Campo **Observação**
- Salva via `set_excecao_bloqueio` RPC, mantendo o restante do submit intacto.
- Badge discreto "TFD" / "Ordem Judicial" no header (`FichaPacienteCabecalho`).

Permissões: Master/Admin/Gestor podem editar; demais perfis somente visualizam (usar checagem já existente em `useAuth` / `PermissionsContext`).

---

## 4. Agenda

`src/pages/painel/Agenda.tsx`:
- Antes do bloqueio em ~linha 924, chamar `isPacienteIsentoBloqueio(pac)`. Se true → permitir agendamento e toast informativo.
- No fluxo de registrar falta (linhas 1572-1690), gravar `tipo_falta`, `falta_justificativa` direto nas colunas novas (além do legacy em `observacoes`).
- `RegistrarFaltaModal` já coleta `tipoFalta`; só ajustar o payload.
- Cancelamento e remarcação seguem sem virar falta.

---

## 5. Gestão de Tratamentos

`src/pages/painel/Tratamentos.tsx`:
- Mesma checagem `isPacienteIsentoBloqueio` antes de bloquear sessão por faltas.
- Falta de sessão grava `tipo_falta` e `falta_justificativa` na `treatment_sessions`.
- Conversão de injustificada → justificada chama RPC `liberar_falta` (mantém histórico) ou update direto + `atualizar_status_falta`.

---

## 6. Tela `Faltosos.tsx` (reescrita parcial)

- Filtro padrão exclui pacientes com `is_tfd` ou `possui_ordem_judicial`. Toggle "Mostrar pacientes com exceção" liberado.
- Adicionar status `Regularizado` (paciente cujas faltas estão todas liberadas).
- Coluna **Ação** com botão **"Liberar Falta"** visível para `master | admin | gestor` (e `recepcao` se já houver permissão atual).
- Modal:
  - Mostra total de faltas injustificadas e última falta.
  - Campo motivo obrigatório.
  - Opções: "Liberar última falta" / "Liberar todas as faltas injustificadas" (esta só para Master).
- Submit chama RPC `liberar_falta`, recalcula status, atualiza lista in-memory sem reload, toast de sucesso/erro.
- Histórico: aba/expandible mostrando faltas com flag `falta_liberada`, `liberada_por`, `motivo_liberacao`.

---

## 7. Realtime / cache

- Após qualquer ação (TFD, liberar, justificar) → `useInvalidation` invalida `pacientes`, `agendamentos`, `treatment_sessions`.
- A página Faltosos faz refetch local após mutation; demais páginas via subscriptions já existentes (`useRealtimeSubscription`) — só garantir que escutam UPDATE em `pacientes.status_falta` e `agendamentos.falta_liberada`.

---

## 8. Tratamento de erros

Padrão pedido pelo usuário:
```ts
console.error("[Faltosos] Erro na regra de faltas/exceção", {
  pacienteId, acao, errorMessage, errorDetails, errorCode
});
```
E toast: "Não foi possível atualizar a regra de faltas deste paciente." Sem otimismo visual em falha.

---

## 9. Arquivos a alterar

- `supabase/migrations/<novo>.sql` — schema + funções `atualizar_status_falta`, `liberar_falta`, `set_excecao_bloqueio`.
- `src/lib/faltasUtils.ts` — novo.
- `src/components/CadastroPacienteForm.tsx` — bloco exceção + persistência.
- `src/components/FichaPacienteCabecalho.tsx` — badges TFD/Ordem Judicial.
- `src/components/RegistrarFaltaModal.tsx` — sem grandes mudanças, só ajustar tipos.
- `src/pages/painel/Agenda.tsx` — checagem isenção + persistência `tipo_falta`.
- `src/pages/painel/Tratamentos.tsx` — checagem isenção + persistência + conversão.
- `src/pages/painel/Faltosos.tsx` — filtros, badges, botão "Liberar Falta", modal de regularização.
- `src/services/patientService.ts` — incluir colunas novas no map form↔db.
- `src/integrations/supabase/types.ts` — auto-regenerado pela migração.

---

## 10. Itens fora de escopo (explícitos)

- Não tocar em Prontuário, BPA, Relatórios, Configurações globais, Permissões globais.
- Não apagar histórico em nenhum cenário (faltas liberadas continuam visíveis com flag).
- Limites globais de faltas permanecem em `system_config.config_fluxo_faltas`.

---

## Validação

Rodar os 10 cenários da seção 14 do pedido após implementação:
1. Marcar/persistir TFD; 2. Persistir Ordem Judicial; 3. TFD remove do bloqueio; 4. Ordem Judicial idem; 5. Remoção recalcula; 6. Justificada não conta; 7. Injustificada conta; 8. Botão Liberar visível para Master + funcional; 9. Tratamentos respeita regra; 10. Auditoria registra eventos.
