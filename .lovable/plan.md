# Plano: WhatsApp Business Hardening

Escopo grande. Vou entregar em **4 fases** para manter qualidade e permitir validação incremental. Nenhum campo de opt-in será adicionado ao paciente.

---

## Fase 1 — Banco de dados (migration única)

### Novas tabelas

**`whatsapp_templates`** (substitui a atual, que é muito simples)
- `id, nome_interno, categoria` (utility|service|authentication|marketing)
- `evento` (agendamento_criado|lembrete_24h|lembrete_2h|cancelamento|remarcacao|falta|lista_espera|vaga_disponivel)
- `status` (rascunho|pendente_aprovacao|aprovado|rejeitado|inativo)
- `provider_template_id, idioma, corpo, variaveis_permitidas jsonb`
- `permite_envio_fora_24h bool, ativo bool, provider text`

**`whatsapp_queue`** (já existe — adicionar colunas faltantes)
- `template_id, payload_json, priority int, error_code, next_retry_at, scheduled_for`
- Status enum estendido: pending|processing|sent|delivered|read|failed|canceled|skipped
- Índice único parcial: `(patient_id, appointment_id, message_type)` para status ativos → evita duplicidade.

**`whatsapp_conversations`** (controle da janela 24h)
- `phone PK, patient_id, last_patient_message_at, opted_out bool, opted_out_at, updated_at`
- Função SQL `is_24h_window_open(phone)` → boolean.

**`whatsapp_event_config`** (já existe — estender)
- `template_id, antecedencia_minutos, exige_confirmacao, prioridade, impedir_duplicidade`

**`whatsapp_inbound_messages`** (novo)
- `id, phone, patient_id, body, recebido_em, intent` (confirmar|remarcar|atendente|sair|livre)
- `appointment_id, processed bool`

**`whatsapp_health_snapshots`** (novo, diário)
- contadores: enviadas, entregues, lidas, falhas, respostas, rejeicoes, pendentes, taxa_erro, taxa_resposta, taxa_confirmacao, status_conexao

GRANTs + RLS (somente staff) em todas.

### Função SQL crítica
`enqueue_whatsapp_message(...)` aplica regras antes de inserir:
1. opted_out → skipped
2. fora janela 24h + template não permite → bloquear
3. duplicidade (mesmo patient+appointment+event ativo) → skipped
4. provedor pausado → pending com `scheduled_for` futuro

---

## Fase 2 — Backend / Edge Functions

**`whatsapp-provider`** (refatorar) — interface genérica:
```ts
interface WhatsAppProvider {
  sendTemplateMessage(); sendTextMessage();
  checkConnection(); getMessageStatus(); processWebhook();
}
```
Implementações: `UazapiGoProvider`, `EvolutionProvider`, stub `CloudApiProvider`.

**`whatsapp-queue-processor`** (cron a cada 1 min):
- pega N mensagens pending ordenadas por priority (2h > 24h > confirmação)
- rate-limit configurável por provider/instância
- retry com backoff (max 3), atualiza `next_retry_at`
- **circuit breaker**: se taxa de erro em janela móvel > limite → pausa fila por X min e cria alerta

**`whatsapp-webhook`** (refatorar):
- Atualiza `whatsapp_queue` por `provider_message_id` (sent/delivered/read/failed)
- Mensagens recebidas → grava `whatsapp_inbound_messages` + atualiza `whatsapp_conversations.last_patient_message_at`
- Parser de intent: `1|CONFIRMAR`, `2|REMARCAR`, `3|ATENDENTE`, `SAIR|PARAR|CANCELAR`
- Ações automáticas: confirma agendamento, abre solicitação remarcação, marca opt-out, etc.

**`whatsapp-health-snapshot`** (cron diário) — popula `whatsapp_health_snapshots`.

---

## Fase 3 — Interface (refatorar `WhatsAppBusiness.tsx`)

Tabs:
1. **Conexão** — status, QR, reconectar (já existe, mantém)
2. **Templates** — CRUD completo + status aprovação + preview com variáveis
3. **Eventos** — matriz evento × template + toggles
4. **Fila** — listagem com filtros, retry manual, cancelar, ver payload
5. **Respostas** — inbox de `whatsapp_inbound_messages`, transferir p/ recepção
6. **Logs** — `notification_logs` filtrado
7. **Saúde do número** — cards de KPI + gráfico 7d + alertas + botão "pausar fila"

Componentes novos em `src/components/whatsapp/`:
- `TemplatesManager.tsx`, `EventsMatrix.tsx`, `QueueTable.tsx`, `InboxPanel.tsx`, `HealthDashboard.tsx`

## Fase 4 — Seed de templates iniciais

Insert dos 6 templates do prompt (confirmação, lembrete 24h, lembrete 2h, remarcação, cancelamento, vaga disponível) como **utility/rascunho** — usuário aprova no provedor e atualiza `provider_template_id`.

---

## Detalhes técnicos importantes

- **Janela 24h**: calculada por trigger ou função `is_24h_window_open(phone)` usando `last_patient_message_at >= now() - 24h`.
- **Anti-duplicidade**: índice único parcial `WHERE status IN ('pending','processing','sent')`.
- **Rate limit**: configurado em `whatsapp_config` (msgs/min por instância).
- **Circuit breaker**: estado em `whatsapp_connection_status.fila_pausada_ate`.
- **Compat**: campo `provider` em `whatsapp_templates` e `whatsapp_queue` permite multi-provedor simultâneo.
- **Sem opt-in cadastral**: a única "permissão" respeitada é `opted_out` derivado de resposta SAIR/PARAR — nunca um campo no cadastro.

---

## Confirmação antes de implementar

Como é grande (≈15 arquivos novos, 1 migration densa, 3 edge functions), confirme:

1. **Posso prosseguir com as 4 fases em sequência nesta mesma execução**, ou prefere que eu pare entre fases para você validar?
2. O **provider ativo hoje** é UazapiGo, Evolution, ou ambos? (afeta seed e rate-limit padrão)
3. Manter as tabelas `whatsapp_queue` e `whatsapp_event_config` existentes (ALTER) ou recriar? Recomendo ALTER para preservar dados.