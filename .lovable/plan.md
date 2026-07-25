# Auditoria de Performance — Plano Cirúrgico

Objetivo: eliminar travamento no clique e lentidão de carregamento **sem alterar fluxo, regras de negócio ou lógica**. Só refactor de camada técnica.

Já aplicado em fases anteriores (não repetir):
- `React.memo` / `useMemo` / debounce 300 ms nas listas grandes
- `.perf-dense` desabilitando `backdrop-filter` em >50 itens
- `RealtimeManager` com ref-counting em `useRealtimeSync`
- `select` enxuto em `AgendamentosContext` e `PacientesContext`

Este plano ataca só o que ainda dá jank real.

---

## Frente 1 — Feedback imediato no clique (loading isolado por botão)

Problema: ao clicar em Salvar/Aprovar/Cancelar/Excluir, a UI parece "congelar" porque o botão não muda de estado até a Promise resolver.

Ação:
1. Criar `src/components/ui/async-button.tsx` — wrapper de `<Button>` que:
   - aceita `onClick: () => Promise<void>`
   - marca `disabled` + spinner assim que clicado
   - reaproveita `useActionGuard` existente (evita duplo clique)
2. Migrar como piloto (baixo risco, alto impacto visual):
   - `Pacientes.tsx` — botões Salvar/Excluir do modal
   - `Agenda.tsx` — Confirmar chegada / Cancelar / Desmarcar
   - `FilaEspera.tsx` — Chamar / Remover / Converter em agendamento
   - `Configuracoes.tsx` — Salvar de cada aba
   - `Prontuario` (SOAP) — Registrar / Finalizar
   
Nenhuma mutação muda — só o botão passa a mostrar estado local.

## Frente 2 — Optimistic updates onde já é seguro

Aplicar somente onde a UI já reflete o estado local antes do round-trip (padrão que os slices usam hoje):
- `updateAgendamento` (status, hora_chegada) — já é optimistic, adicionar rollback em erro (hoje só loga)
- `cancelAgendamento` / `deleteAgendamento` — idem
- `updatePaciente` — idem

Não vou introduzir optimistic novo onde não existe (risco de dessincronizar com RLS).

## Frente 3 — Consultas Supabase enxutas + paginação real

Auditar e reduzir 3 telas específicas onde o `select` ainda puxa colunas demais ou não pagina:

1. `HistoricoTriagem.tsx` — hoje faz paginação recursiva de todas as colunas de `triage_records`. Reduzir para `id, paciente_id, paciente_nome, criado_em, prioridade, unidade_id` no listing e buscar detalhes só ao expandir.
2. `Auditoria.tsx` — trocar fetch total por `range(0, 99)` com botão "Carregar mais".
3. `Faltosos.tsx` — trocar `select('*')` por colunas usadas na tabela.

Sem mudar filtros/ordenação — só payload.

## Frente 4 — Cleanup de listeners e efeitos

Varredura por `supabase.channel(` e `useEffect` sem retorno:
- Confirmar `removeChannel` em todos os hooks (após consolidação já feita)
- Garantir cleanup de `setTimeout`/`setInterval` em `WhatsappPausedBanner`, `AtendimentoTimer`, `ConfigSyncIndicator`
- Cancelar fetches em modais de detalhe com `AbortController` quando o modal fecha durante request

---

## Fora do escopo (não vou tocar)

- Lógica de negócio, RLS, edge functions, schema
- Fluxos clínicos (SOAP, PTS, triagem, ciclos)
- Fase C de bundle (assunto separado, já mapeado)

## Ordem de execução

1. Frente 1 (AsyncButton + 5 telas piloto) — maior ganho percebido
2. Frente 4 (cleanup) — invisível mas elimina leaks
3. Frente 3 (payload) — reduz TTI das 3 telas citadas
4. Frente 2 (rollback em optimistic) — polimento

Cada frente é commit isolado, reversível.

## Detalhes técnicos

- `AsyncButton` estende `ButtonProps`, não quebra tipos existentes
- Todas as chamadas de Supabase mantêm `.eq/.in/.order` idênticos — só a lista de colunas do `select` muda
- Nenhum canal Realtime novo; só cleanup
- Zero migração de banco

Posso executar as 4 frentes em sequência?