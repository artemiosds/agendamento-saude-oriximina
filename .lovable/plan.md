# Correção geral da regra de CBO no BPA (I e C)

## Achados confirmados (SIGTAP 202609, leitura)
- `tb_detalhe.txt`: atributo **021 = "Não Exige CBO"** existe (layout `rl_procedimento_detalhe`: procedimento 1-10, detalhe 11-13, competência 14-19).
- 56 procedimentos têm o 021 e **nenhum** deles tem linhas em `rl_procedimento_ocupacao`.
- **0301040079**: nenhum CBO listado e **não tem o 021**, só o 009 (Exige CPF/CNS). Instrumentos 01 e 02. Pelas regras que você definiu, ele cai no caso "lista vazia sem confirmação": a compatibilidade não pode ser confirmada. Isso gera um aviso, sem erro de cadastro e sem descartar a produção.
- Hoje a regra `!cbos.has(cbo)` aparece em 5 pontos, e todos recusam quando a lista está vazia:
  - `sigtapClinicalValidation.ts:231` (referência anterior) e `:293` (tela e seletor)
  - `bpaFinalValidation.ts:279` (validação final)
  - `BpaExportar.tsx:2708` (contagem de exceções) e `:2830` (auditoria do TXT)
- `generate-bpa` (função remota) só confere se o CBO existe. Fica fora da mudança, como você pediu.

## Regra única (nova função `avaliarCboSigtap` em `bpaSigtapCatalog.ts`)
Resultado possível: `permitido` | `incompativel` | `nao_exige_cbo` | `nao_confirmavel`.
1. Lista com CBOs: o CBO precisa estar nela (`permitido` ou `incompativel`).
2. Lista vazia e atributo 021: `nao_exige_cbo`. Válido, com uma observação.
3. Lista vazia sem 021: `nao_confirmavel`. Aparece um aviso "compatibilidade de CBO não confirmada pelo SIGTAP X". Não conta como incompatível, não aponta erro no profissional e não exclui a linha.
- CID, idade, sexo, instrumento, competência e as listas do Master continuam iguais.

## Mudanças
- `bpaSigtapCatalog.ts`: incluir `rl_procedimento_detalhe.txt` como arquivo opcional. Se faltar, o 021 fica como "desconhecido" e o caso vira `nao_confirmavel`. Novo campo `detalhes: Set<string>`. A competência de referência efetiva continua exposta.
- `sigtapClinicalValidation.ts`, `bpaFinalValidation.ts` e `BpaExportar.tsx` passam a usar `avaliarCboSigtap`. Assim a tela, a validação final e o TXT seguem a mesma regra.
- As mensagens mostram a competência de referência usada quando for diferente da selecionada.

## Testes (vitest)
- CBO listado e permitido
- CBO listado e não permitido
- Lista vazia com 021
- Lista vazia sem 021
- Competência indisponível
- 0301040079 com CBO 251605, que deve resultar em `nao_confirmavel`, sem rejeição
- Atualizar os testes atuais de `sigtapClinicalValidation` e `bpaExportSafety` se forem afetados.

## Fora do escopo
Banco, migrations, funções remotas, cadastros, publicação e arquivos de documentação.
