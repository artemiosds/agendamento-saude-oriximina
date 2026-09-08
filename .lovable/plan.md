# Otimização da Fila de Espera (com 1 ajuste crítico ao pedido)

## Achado que muda o item 1 do pedido

Consultei o banco antes de planejar. A distribuição real da fila hoje é:

```text
apto_atendimento                 11.436   (criados hoje: 0)
excluido_da_fila_triagem             97
chamado                              67
atendido                             32
aguardando_enfermagem                25
aguardando_agendamento_interno       18
encaixado                            16
removido_triagem                      2
```

Os 11.436 registros de `apto_atendimento` são pacientes já triados esperando
agendamento — backlog legítimo, distribuído de março a setembro/2026, e
**nenhum foi criado hoje**. Aplicar o filtro "somente hoje" deixaria a fila
com **zero registros**, esvaziando Triagem, Enfermagem, Fila e os candidatos de
encaixe da Agenda. Ou seja, o filtro de data como descrito quebraria o fluxo.

Então mantenho o objetivo (payload pequeno) mudando o método:

- **Fila operacional do dia** (statuses `aguardando`, `chamado`,
  `aguardando_enfermagem`, `aguardando_agendamento_interno`): carregada
  integralmente — hoje são ~110 linhas.
- **Backlog `apto_atendimento`**: carregado com janela deslizante de 180 dias e
  colunas enxutas, mantendo o array no mesmo formato para quem consome. Isso já
  corta a leitura e, principalmente, deixa de ser relido a cada evento.

O ganho maior vem do item 2 (patch incremental): hoje qualquer INSERT/UPDATE em
`fila_espera` relê tudo; depois da mudança, relê nada.

## O que será feito

1. **Query enxuta no FilaContext** — divide a carga em fila ativa (completa) e
   backlog triado (janela de 180 dias), mantendo a paginação recursiva e o
   isolamento por unidade já existentes.

2. **Atualização incremental no realtime** — o evento passa a aplicar o próprio
   payload no estado (inserir, atualizar, remover; sair do estado quando o
   status virar terminal). O `SELECT` completo só volta a rodar no fallback de
   queda de conexão e no `refreshFila()` manual, que continua exportado.

3. **Fim do canal duplicado** — a Avaliação de Enfermagem deixa de ter canal
   próprio e `select('*')` e passa a filtrar a lista já centralizada, com o
   mesmo formato de item que a tela usa hoje.

4. **Trava de chamada respeitada** — o seletor de Configurações
   (`Fila de espera → Modo de encaixe: Automático / Assistido`) existe mas
   nunca é lido por ninguém. Passa a ser respeitado: em modo assistido, ao
   liberar vaga por cancelamento/falta, o sistema apenas avisa que há paciente
   elegível e não muda status; a chamada só ocorre pelo clique da recepção na
   tela de Fila. Em modo automático, o comportamento atual é preservado.

## Garantias de fluxo

- O contexto continua entregando `fila`, `addToFila`, `updateFila`,
  `removeFromFila`, `refreshFila`, `checkFilaForSlot` e `encaixarDaFila` com as
  mesmas assinaturas e o mesmo formato de item.
- Encaixe, ordenação (prioridade → Manchester → chegada) e regras de negócio da
  Agenda ficam inalterados.
- Nada de migração, nova tabela, mudança de RLS ou de coluna. Somente leitura.

## Detalhes técnicos

- `src/contexts/FilaContext.tsx`: `loadFila` em duas consultas paralelas;
  `onEvent` com reducer por `eventType` usando `mapFilaRow`; `poll: refreshFila`
  mantido; filtro de unidade preservado; `TERMINAL_STATUSES` reutilizado para
  expulsar itens do estado em UPDATE.
- `src/pages/painel/AvaliacaoEnfermagem.tsx`: remove `loadFila`, o canal
  `enfermagem-fila-espera` e o `select('*')`; deriva a lista via `useMemo` sobre
  `useFila()` filtrando `status === 'aguardando_enfermagem'`.
- `src/hooks/useFilaAutomatica.ts`: `handleVagaLiberada` lê
  `configuracoes.filaEspera.modoEncaixe` do `OperacionalContext` e, em
  `assistido`, retorna sem chamar `chamarProximoDaFila`, apenas notificando a
  recepção e registrando log.
- Sem alteração em `Agenda.tsx` além de nada — os pontos de chamada continuam
  os mesmos.
