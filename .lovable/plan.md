# BPA-Exportar: lista de profissionais rápida e filtro de turno correto

Dois problemas confirmados nos testes. Nenhuma regra de coleta, consolidação, validação, Registro 03, TXT ou Procedimentos Padrão será alterada.

## Problema 1 — o campo Profissional demora muito para abrir

Hoje, ao informar a competência (e a unidade), a tela baixa para o navegador:

- todos os prontuários finalizados do mês, de mil em mil linhas (agosto/2026 tem 2.615);
- todas as triagens do mês, e depois todos os agendamentos ligados a elas, em lotes de 500;
- todos os agendamentos do mês com presença.

Tudo isso só para descobrir **quais nomes** entram na lista. É por isso que a seleção demora a abrir.

### Correção

Criar uma função no banco que devolve apenas os profissionais que tiveram atendimento na competência/unidade (uma única resposta, poucas linhas, já com nome, CNS e CBO). A tela passa a fazer uma única chamada em vez de milhares de linhas baixadas.

A lista continuará com exatamente o mesmo critério de hoje: prontuários finalizados + triagens de técnicos + agendamentos com presença, apenas funcionários ativos.

## Problema 2 — 19/08/2026, turno Manhã, profissional Madson não trouxe nada

Causa confirmada nos dados: o horário usado pelo filtro de turno é o horário em que o prontuário foi digitado, não o horário do atendimento. Os atendimentos de Madson do dia 19/08 estavam agendados às 08:00, 09:00 e 13:00, mas os prontuários foram registrados entre 16:26 e 17:53. O filtro classificou tudo como "Tarde" e a Manhã ficou vazia.

### Correção

O turno passará a usar o horário do atendimento agendado:

1. horário do agendamento vinculado ao prontuário (fonte principal);
2. se não houver agendamento vinculado, o horário do próprio prontuário;
3. registros vindos direto da agenda continuam usando o horário da agenda;
4. registros sem nenhum horário conhecido passam a ser **mantidos** na exportação, com aviso informando quantos foram, para não perder produção válida.

O resumo antes do download passará a mostrar quantos atendimentos ficaram de fora por turno e quantos entraram sem horário identificado.

## Detalhes técnicos

- Nova função `public.bpa_profissionais_com_atendimento(p_start date, p_end date, p_unidade_id text)` — `security definer`, `stable`, `search_path = public`, com `grant execute` para `authenticated`. Retorna id, nome, cns, cbo distintos, unindo as três fontes atuais em SQL.
- `src/pages/painel/BpaExportar.tsx`: o `useEffect` das linhas ~1023-1215 passa a chamar essa RPC; a paginação recursiva de `prontuarios`/`triage_records`/`agendamentos` desse trecho é removida (o restante do pipeline de exportação continua igual).
- Filtro de turno (~linha 1640): antes de classificar, resolver `agendamento_id` dos prontuários selecionados em uma consulta em lote a `agendamentos(id, hora)` e usar essa hora; fallback para `hora_atendimento`. Manter a convenção existente do sistema (< 12:00 Manhã, < 18:00 Tarde, senão Noite).
- Registros sem hora deixam de ser descartados; passam a ser incluídos com contagem em `warnings`.
- Nenhuma alteração em geração de TXT, cabeçalho, checksum, Registro 03, reaproveitamento SIGTAP/CID ou Procedimentos Padrão.
