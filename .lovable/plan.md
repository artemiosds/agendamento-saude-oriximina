# Faltas reconhecidas nos dois formatos na Gestão de Tratamentos

## Situação confirmada
O banco tem dois registros diferentes para falta: 802 sessões gravadas como `falta` e 228 como `paciente_faltou`. Hoje a tela e a contagem da lista só entendem `paciente_faltou`. Por isso as 802 faltas antigas não ficam vermelhas, aparecem sem rótulo e não entram nos alertas de absenteísmo.

## O que muda (só na leitura e na exibição)
1. **Cores e rótulo:** sessões com `falta` passam a aparecer em vermelho com o rótulo "Faltou", iguais às `paciente_faltou`.
2. **Alertas de absenteísmo:** o total de faltas e as faltas seguidas do ciclo passam a contar os dois formatos.
3. **Contador de faltas na lista paginada dos ciclos:** a função do banco passa a contar `falta` e `paciente_faltou` (só essa linha da contagem muda, nenhuma outra regra).

## O que NÃO muda
- Nenhuma sessão é alterada ou convertida. Os 1.030 registros continuam como estão.
- Uma falta nova continua sendo gravada como `paciente_faltou`.
- Os agendamentos da Agenda não mudam: ali `falta` continua liberando a vaga.
- Regras de carência, bloqueio por faltas, Agenda, Prontuário e BPA-I continuam iguais.

## Detalhes técnicos
- `src/pages/painel/Tratamentos.tsx`: adicionar `falta` em `sessionStatusColors` e `sessionStatusLabels`; criar o auxiliar `isSessionFalta(status)` e usá-lo em `faltaStats` (linhas 688 e 694).
- Migration: `CREATE OR REPLACE` de `get_treatment_cycles_paginated` com o corpo atual idêntico, trocando só `ts.status = 'paciente_faltou'` por `ts.status IN ('paciente_faltou','falta')`. Antes, o corpo publicado será lido do banco para não perder nenhum ajuste posterior.
- Não mexer nos filtros `.not('status','in','("cancelado","falta","remarcado")')`, porque eles tratam o status do agendamento, não o da sessão.
- Teste unitário de `isSessionFalta` cobrindo `falta` e `paciente_faltou` como verdadeiros e `realizada` como falso. Depois, rodar tsgo e a suíte de testes.
