## Objetivo

Refinar a ordenação visual da Agenda do Profissional em `src/pages/painel/Agenda.tsx` para seguir EXATAMENTE as regras pedidas, sem mexer em banco de dados, agendamento, cancelamento ou confirmação.

## Regras de ordenação (final)

Dois blocos de turno: **Manhã** (< 12:00) e **Tarde** (≥ 12:00, considerando o início real configurado no dia, com fallback 13:30; noite entra junto da tarde).

Ordem dos blocos:
- **Antes do início da tarde:** Manhã → Tarde
- **A partir do início da tarde:** Tarde → Manhã (manhã desce inteira para baixo, como "pendentes da manhã")

Dentro de cada bloco, ordenação ÚNICA e nesta sequência exata:
1. **Não-concluído** vem antes de **Concluído** (concluído sempre desce ao final do próprio grupo).
2. **Classificação de risco Manchester**: vermelho → laranja → amarelo → verde → azul → sem classificação.
3. **Hora de chegada** (ascendente): usa `arrivalMap[id] || horaChegada`; se não houver chegada registrada, usa a hora agendada como fallback.

Status `confirmado`, `cancelado`, `apto_atendimento`, `em_atendimento`, `chamado` etc. NÃO afetam a ordem — só `concluido/finalizado/atendido/...` desce. Cancelado/falta seguem a mesma regra (não descem por status, apenas pela hora de chegada/agendada dentro do grupo, conforme pedido: "apenas concluído desce para o final do grupo").

## Mudanças no código

Arquivo único: `src/pages/painel/Agenda.tsx`, dentro do `useMemo` `filtered` (linhas ~437–634). Nenhuma outra parte do arquivo é tocada.

1. **Simplificar `getTurnoSortGroup`** para retornar apenas 2 buckets de turno (manhã/tarde), respeitando o turno atual quando `isToday`:
   - Calcula `turno` do agendamento: `min < 12*60 ? 'manha' : 'tarde'`.
   - Se hora atual ≥ `TARDE_INICIO_MIN` e for hoje → tarde = 0, manhã = 1.
   - Caso contrário → manhã = 0, tarde = 1.
   - Mantém `TARDE_INICIO_MIN` dinâmico já existente (menor horário ≥12:00 do dia, fallback 13:30).

2. **Substituir o comparador `.sort(...)`** por exatamente três critérios, na ordem:
   ```
   a) bloco de turno (manhã/tarde conforme regra acima)
   b) concluído desce: CONCLUIDO_STATUSES → 1, demais → 0
   c) peso Manchester (1..6)
   d) hora de chegada asc (arrivalMap[id] || horaChegada || hora agendada)
   ```
   Remover os critérios atuais de "ativo no topo", "prontidão", "checked-in", "prioridade legal/idade" do comparador (eles violam a especificação que pede só risco + chegada). Risco vermelho continuará no topo automaticamente; gestante/PNE/autista deixam de subir por idade — conforme pedido explícito do usuário ("apenas classificação de risco e hora de chegada"). Manter `getPesoClassificacaoRisco`, remover funções não usadas (`getProntidaoPeso`, `getPrioridadeIdade`, `calcAge`) para manter o arquivo limpo.

3. **Label "Pendentes da manhã"** na renderização (linha ~2255):
   - Antes do `.map`, derivar `idxPrimeiroPendenteManha` quando `isToday && nowMinutes >= TARDE_INICIO_MIN` — o primeiro item cujo turno é manhã e que não está concluído.
   - No render, ao alcançar esse índice, inserir um separador visual (div com label "Pendentes da manhã") imediatamente acima do card. Pequeno componente inline, sem novos arquivos.

4. **Realtime** — já está ativo via assinaturas existentes (`agendamentos`, `fila_espera`, etc.) que disparam refetch + re-render. O `useMemo` depende de `agendamentos`, `arrivalMap`, `triageMap`, `nowMinutes` (atualizado a cada 60s) — a transição manhã→tarde e o "concluído desce" acontecem automaticamente. Nada a alterar aqui.

## O que NÃO muda

- Schema do banco, RLS, Edge Functions.
- Filtros por unidade/profissional, busca, isolamento `useUnidadeFilter`/`admin.sms`.
- Cards, ações (iniciar atendimento, cancelar, confirmar chegada, etc.).
- Lógica de triagem, fila, prontuário, tratamento.
- Outros `useMemo` da página.

## Arquivos editados

- `src/pages/painel/Agenda.tsx` — apenas dentro do `useMemo` `filtered` e um separador visual no `.map` da lista.