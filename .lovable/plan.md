# Auditoria e correção da contagem BPA-I

## Causa confirmada

A tela soma duas situações diferentes no mesmo número “Duplicados removidos”:

1. **Repetições entre fontes no mesmo prontuário**: `codigosColetados.length - codigosParaExportar.length`. No caso informado, são **1.631 ocorrências** repetidas entre Prontuário, PTS, procedimentos vinculados, sessão e histórico.
2. **Linhas finais eliminadas**: mais **23 linhas**, contadas durante a emissão do Registro 03.

Por isso aparece **1.654 = 1.631 + 23**. O valor “Procedimentos encontrados: 1.139” já representa os procedimentos consolidados, não as ocorrências brutas. A tela mistura etapas e impede conferir a matemática.

Também foi confirmado um risco na chave final: ela usa apenas paciente + profissional + unidade + data + SIGTAP (e, conforme o CBO, CID). Assim, dois atendimentos reais do mesmo paciente, profissional e dia podem ser confundidos. A chave não usa primeiro o identificador do agendamento/prontuário.

## Correção

- Separar os contadores em: ocorrências brutas, repetições entre fontes no mesmo atendimento, procedimentos consolidados, rejeitados, válidos, eliminações finais reais e Registros 03.
- Não somar repetições entre fontes com linhas finais repetidas.
- Tornar a chave final específica do atendimento: usar `agendamento_id`; quando ausente, usar `prontuario.id`; somente no último fallback usar paciente + profissional + unidade + data.
- Preservar todos os SIGTAPs diferentes dos CBOs multiprocedimento.
- Registrar no console de desenvolvimento a chave, IDs do atendimento, paciente, profissional, unidade, data, SIGTAP, origem e motivo de cada repetição confirmada, sem expor isso na produção.
- Não alterar SIGTAP, idade, CBO, DNE, cabeçalho, layout, banco ou cadastro.
- Criar testes cobrindo: repetição entre fontes; dois e três SIGTAPs diferentes no mesmo atendimento; dois atendimentos distintos no mesmo dia; fallback por prontuário; e vários SIGTAPs no mesmo prontuário.
- Executar testes, validação do projeto e uma geração real da competência 202608 pela interface, comparando a sequência matemática antes/depois.

## Resultado esperado na interface

```text
Ocorrências brutas
− Repetições entre fontes
= Procedimentos consolidados
− Rejeitados
= Procedimentos válidos
− Eliminações finais reais
= Registros 03 gerados
```

Cada eliminação final continuará registrada separadamente com seu motivo. Procedimentos diferentes do mesmo atendimento nunca compartilharão a mesma chave final.
