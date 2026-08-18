# Ficha de Atendimento Clínico na Agenda

Objetivo: ter o mesmo documento "Ficha de Atendimento Clínico Completa" (hoje só na tela Pacientes) disponível direto na Agenda, ao lado de cada paciente agendado, pronto para imprimir — sem alterar o fluxo da agenda.

## O que o usuário vai ver

- Em cada cartão de paciente da Agenda, na mesma barra de ações onde já ficam os botões (olho/detalhe, editar, etc.), entra um botão discreto de impressora com tooltip "Imprimir Ficha de Atendimento".
- Ao clicar, abre o mesmo diálogo já usado em Pacientes, com os dois modos:
  - **Completa** (Ficha de Atendimento Clínico)
  - **Só Dados Pessoais** (Ficha Cadastral)
- O layout impresso é exatamente o atual (A4 institucional, `FichaImpressao` + `printLayout`), sem nenhuma mudança visual no documento.
- O botão fica junto às ações já existentes, agrupado por ordem, para não competir com "Confirmar chegada" nem outros cliques críticos.

## Como será feito (técnico)

1. **Extrair o builder de dados** — `fetchFichaData` está hoje embutido em `src/pages/painel/Pacientes.tsx` (linha ~1037). Mover para um módulo compartilhado `src/lib/fichaAtendimentoData.ts`, exportando `buildFichaAtendimentoData({ pacienteId, unidades, user })` com o mesmo retorno (`paciente`, `dadosClinicos`, `sinaisVitais`, `profissional`, `evoluciones`) e os mesmos campos/mapeamentos de `custom_data`. Nenhuma regra de negócio muda; campos clínicos continuam em branco para preenchimento manual.
2. **Pacientes passa a consumir o módulo** — trocar a função local pelo import, mantendo `handleOpenFicha` e o diálogo como estão. Zero mudança de comportamento nessa tela.
3. **Prop opcional no cartão da Agenda** — em `src/pages/painel/agenda/AgendaItemCard.tsx`, adicionar `onImprimirFicha?: (ag: any) => void` e renderizar o botão de impressora dentro do bloco de ações existente (`flex gap-1 flex-wrap`, ~linha 324), só quando a prop existir. Prop opcional = nenhum outro consumidor quebra.
4. **Diálogo na Agenda** — em `src/pages/painel/Agenda.tsx`, adicionar estados locais (`fichaOpen`, `fichaData`, `fichaLoading`, `fichaPrintMode`), o handler que chama `buildFichaAtendimentoData` com o `paciente_id` do agendamento, e o `Dialog` com `<FichaImpressao />` e os dois botões de modo — espelhando o que já existe em Pacientes.
5. **Estabilidade de performance** — o handler entra via `useRef` (padrão já adotado na Agenda para handlers passados a componentes memoizados), então a memoização do `AgendaItemCard` continua efetiva e a lista não re-renderiza a mais.

## Fora de escopo

- Não altera ordenação da fila, status, cascata de prioridade nem qualquer regra de agendamento.
- Não altera o layout do documento impresso nem `printLayout.ts`.
- Não cria tabelas nem colunas; apenas leitura de `pacientes` já existente.
