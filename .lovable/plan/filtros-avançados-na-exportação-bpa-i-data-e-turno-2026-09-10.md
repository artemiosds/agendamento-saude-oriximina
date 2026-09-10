# Filtros avançados na exportação BPA-I (data e turno)

Camada opcional de filtro sobre a seleção de atendimentos. Nada do processamento atual muda: coleta, consolidação, deduplicação, reaproveitamento de SIGTAP/CID, validações, Registros 03, cabeçalho, checksum e TXT continuam idênticos.

## O que o usuário verá

Na área "Filtros e Configurações", abaixo de Competência (AAAAMM):

- Um bloco recolhível **Filtros avançados (opcional)** com:
  - **Data do atendimento** — campo de data, vazio por padrão.
  - **Turno** — Todos os turnos (padrão), Manhã, Tarde, Noite.
  - Botão **Limpar filtros**: apaga a data, volta o turno para "Todos os turnos" e mantém competência, unidade, profissional, CNES, CNS, CBO e Procedimentos Padrão intactos.
- Se a data escolhida não pertencer à competência, aviso: "A data selecionada não pertence à competência AAAAMM. Selecione uma data dentro de <mês/ano>." e a geração é bloqueada até corrigir.
- No resumo já existente antes dos botões de download, passam a aparecer as linhas Competência, Data e Turno junto dos totais atuais (atendimentos, procedimentos válidos, Registros 03, pendências).

Com data vazia e turno "Todos os turnos", o resultado é exatamente o de hoje: competência inteira.

## Detalhes técnicos

Arquivo único: `src/pages/painel/BpaExportar.tsx`.

1. `formData` ganha `data_especifica: ""` e `turno: "todos"`. `handleLimpar` continua limpando tudo (comportamento atual); o novo botão "Limpar filtros" mexe só nesses dois campos.
2. Validação em `handleGerar`: se `data_especifica` preenchida e `AAAAMM` da data ≠ competência, `toast.error` e retorno antes de qualquer consulta.
3. Janela de consulta: quando há data específica, `startDate`/`endDate` (hoje derivados da competência) passam a ser a própria data. Isso reduz o volume em todas as consultas que já usam esse par (`prontuarios`, `agendamentos`, triagens, histórico de reaproveitamento) sem trocar nenhum filtro de campo. A data usada continua sendo a mesma fonte de verdade atual: `prontuarios.data_atendimento` e, nos registros sintéticos, `agendamentos.data` mapeada para `data_atendimento`.
4. Turno: filtro aplicado ao final da montagem da lista `prontuarios` (antes de qualquer coleta de procedimentos), por hora do atendimento, usando a mesma convenção de período já adotada no sistema (`OperacionalContext`: `< 12:00` Manhã, `< 18:00` Tarde, senão Noite). Fonte da hora, em ordem: `prontuarios.hora_atendimento`; para sintéticos de agenda, `agendamentos.hora` (campo adicionado ao `select` existente, sem mudar filtros); para triagem, a hora de `criado_em`. Registro sem hora nenhuma é mantido quando o turno é "Todos" e, com turno específico, contabilizado como não classificável e reportado no resumo em vez de sumir silenciosamente.
5. Nenhuma alteração em `bpaService.ts`, na edge function `generate-bpa`, nos Procedimentos Padrão, nas regras de múltiplos procedimentos por CBO (223810, 251510, 223710) nem na validação final.

## Verificação

Typecheck + build, e conferência de que competência sem filtros produz a mesma contagem de atendimentos e Registros 03 de antes da mudança.
