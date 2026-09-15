# Auditoria e correção da contagem BPA-I

## Causa confirmada

A tela soma duas situações diferentes no mesmo número “Duplicados removidos”:

1. **Repetições entre fontes no mesmo prontuário**: `codigosColetados.length - codigosParaExportar.length`. No caso informado, são **1.631 ocorrências** repetidas entre Prontuário, PTS, procedimentos vinculados, sessão e histórico.
2. **Linhas finais eliminadas**: mais **23 linhas**, contadas durante a emissão do Registro 03.

Por isso aparece **1.654 = 1.631 + 23**. O valor “Procedimentos encontrados: 1.139” já representa os procedimentos consolidados, não as ocorrências brutas. A tela mistura etapas e impede conferir a matemática.

Também foi confirmado um risco na chave final: ela usa apenas paciente + profissional + unidade + data + SIGTAP (e, conforme o CBO, CID). Assim, dois atendimentos reais do mesmo paciente, profissional e dia podem ser confundidos. A chave não usa primeiro o identificador do agendamento/prontuário.

## Correção

- Separar os contadores em: ocorrências brutas, repetições entre fontes no mesmo atendimento, procedimentos consolidados, rejeitados, válidos e Registros 03.
- Não somar repetições entre fontes com linhas finais repetidas.
- Tornar a chave final específica do atendimento: usar `agendamento_id`; quando ausente, usar `prontuario.id`.
- Preservar todos os SIGTAPs diferentes dos CBOs multiprocedimento.
- Registrar no console de desenvolvimento a chave, origem e contexto de cada repetição confirmada, sem expor isso na produção.
- Não alterar SIGTAP, idade, CBO, DNE, cabeçalho, layout, banco ou cadastro.
- Executar testes e uma geração real com os mesmos filtros disponíveis, comparando a nova sequência matemática.
