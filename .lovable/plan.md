# Otimização da Fila de Espera

Verifiquei antes de planejar: a Agenda decide "Apto p/ Atendimento" pelo status
do próprio agendamento, não pela fila. Por isso retirar o backlog de triados da
fila não afeta Agenda, Triagem nem o encaixe — seu teste prático confere. Fica
como você decidiu: remover de vez.

## O que será feito

1. **Fila só com a demanda do dia** — a fila passa a carregar estritamente os
   registros operacionais (aguardando, chamado, aguardando enfermagem,
   aguardando agendamento interno). O backlog de ~11 mil triados aguardando
   agendamento sai da carga: continua no banco e visível em Pacientes, Agenda e
   Relatórios, mas não pesa mais na recepção. Sem janela de 180 dias.

2. **Atualização ponto a ponto no tempo real** — cada aviso do servidor passa a
   inserir, atualizar ou remover apenas aquele paciente na lista em memória.
   A releitura completa só acontece se a conexão cair (fallback já existente) ou
   quando alguma tela pedir atualização manual.

3. **Fim do canal duplicado na Avaliação de Enfermagem** — a tela deixa de abrir
   conexão própria e de trazer todas as colunas; passa a filtrar a lista já
   centralizada, com o mesmo formato de item de hoje.

4. **Trava de chamada respeitada** — o seletor de Configurações
   (Fila de espera → Automático / Assistido) existe mas ninguém lê. Passa a
   valer: em modo assistido, ao liberar vaga por cancelamento ou falta o sistema
   apenas avisa que há paciente elegível, sem mudar status — a chamada só ocorre
   pelo clique da recepção. Em modo automático nada muda.

## Garantias de fluxo

- A fila continua entregando a mesma lista e as mesmas funções (adicionar,
  atualizar, remover, atualizar tudo, candidatos do slot, encaixar) com formato
  e assinaturas idênticos.
- Encaixe, ordenação (prioridade, risco, chegada) e regras da Agenda intactos.
- Nenhuma migração, tabela, coluna ou regra de acesso alterada. Só leitura.

## Detalhes técnicos

- `src/contexts/FilaContext.tsx`: `loadFila` troca o `not(status in terminais)`
  por `in("status", STATUS_OPERACIONAIS)` (sem `apto_atendimento`), mantendo
  paginação recursiva, colunas enxutas e filtro por unidade; `onEvent` vira
  reducer por `eventType` (INSERT/UPDATE/DELETE) usando `mapFilaRow`, com
  descarte de itens cujo status saia da lista operacional; `poll: refreshFila`
  preservado como fallback.
- `src/pages/painel/AvaliacaoEnfermagem.tsx`: remove `loadFila`, o canal
  `enfermagem-fila-espera` e o `select('*')`; lista derivada por `useMemo` sobre
  `useFila()` filtrando `status === 'aguardando_enfermagem'` (+ unidade).
- `src/hooks/useFilaAutomatica.ts`: `handleVagaLiberada` lê
  `configuracoes.filaEspera.modoEncaixe` do `OperacionalContext`; em
  `assistido` não chama `chamarProximoDaFila` — apenas toast informativo e log.
- `Agenda.tsx` não é alterada.
