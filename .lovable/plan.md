# Correção definitiva do gerador TXT BPA-I

## Diagnóstico confirmado

- A exportação usada pela tela é montada diretamente em `BpaExportar.tsx`; ela não chama a função antiga `generate-bpa` do backend.
- O Registro 03 ativo segue o layout oficial de **338 posições**, incluindo endereço nas posições 192–338. O cabeçalho possui **130 posições**. A referência oficial disponível no DATASUS foi atualizada em 09/07/2026; a tabela posicional conferida corresponde ao layout publicado.
- Hoje os campos são concatenados manualmente e, no fim, a linha inteira é cortada para 338 caracteres. Esse corte global pode esconder um campo malformado e produzir deslocamentos sem apontar a origem.
- O endereço ainda aceita `pacientes.endereco` como fallback de `logradouro`. Esse campo legado pode conter número/bairro misturados e explica casos como “CESAR GUERREIRO 1021 CIDADE NOVA”.
- A resolução atual de município pode substituir um município cadastrado válido pelo resultado do CEP. Isso contraria a regra solicitada de preservar o município real quando o cadastro estruturado é válido.
- A validação SIGTAP atual confirma código ativo global e regras CBO configuradas, mas a tabela local não possui vigência por competência nem tabela oficial completa CBO × SIGTAP. Portanto, o sistema não deve afirmar uma validação oficial por competência quando esses dados não existem; deve bloquear/indicar ausência da base necessária em vez de inventar compatibilidade.
- Existe uma função antiga `generate-bpa` no backend com layout divergente de 250 posições, mas ela não possui chamador no aplicativo. Ela não será usada nem misturada nesta correção.

## Implementação

### 1. Centralizar o layout oficial

Criar um módulo único de layout BPA-I com:

- versão/data da referência oficial;
- constantes de posição, tamanho, tipo e preenchimento de todos os campos do cabeçalho e Registro 03;
- sanitização textual própria para BPA, sem alterar o cadastro;
- formatadores estritos para texto, números e campos opcionais;
- `buildRegistro03(dados)` que recebe somente dados estruturados;
- `buildHeaderBpa(dados)` e cálculo oficial do campo de controle;
- validação campo a campo e validação final de 130/338 posições.

A montagem não fará corte global da linha pronta. Cada campo será normalizado e limitado dentro da própria posição. Qualquer tamanho inesperado bloqueará o arquivo e identificará campo, posição, valor e correção necessária.

### 2. Corrigir endereço na origem

Separar explicitamente:

- CEP;
- código DNE do tipo de logradouro;
- logradouro;
- complemento;
- número;
- bairro;
- telefone;
- e-mail.

Usar primeiro os campos estruturados de `pacientes`. O campo legado `endereco` só poderá ser usado como logradouro quando não houver dado estruturado e não será repartido nem usado para preencher número/bairro. Número e bairro nunca serão concatenados ao logradouro.

### 3. Município e IBGE

- Priorizar o código IBGE estruturado válido do paciente.
- Validar município + UF + IBGE usando a referência municipal já existente no projeto quando houver correspondência conhecida.
- Consultar CEP apenas como apoio quando o IBGE cadastrado estiver ausente ou inválido; nunca substituir silenciosamente um IBGE cadastrado válido.
- Usar município padrão somente como último recurso sinalizado, preservando o comportamento atual de exportação com pendências.

### 4. Integrar sem mudar as regras clínicas atuais

Substituir apenas o bloco que monta as strings por chamadas ao novo construtor. Permanecem intactos:

- seleção por competência, data, turno, unidade e profissional;
- coleta em Prontuário, PTS, histórico e Agenda;
- reaproveitamento por paciente + profissional + competência;
- consolidação e remoção de duplicados;
- múltiplos procedimentos para 223810, 251510 e 223710;
- procedimentos padrão;
- validação final existente de SIGTAP/CBO/CID;
- contadores, resumo, Excel e impressão.

O SIGTAP será normalizado para 10 dígitos antes do construtor. O CID será normalizado sem ponto e terá preenchimento fixo de quatro posições, sem deslocar campos posteriores.

### 5. Validação estrutural antes do download

Antes de criar o arquivo:

- validar todos os campos de cada Registro 03 por posição e tipo;
- validar comprimento exato de cada linha;
- validar cabeçalho, contagens, folhas, sequências e campo de controle;
- confirmar que cada linha emitida corresponde a um procedimento já aprovado pela validação clínica;
- bloquear o link de download quando existir erro estrutural;
- incluir no resultado linha, paciente, campo, valor, problema e correção necessária.

Produção múltipla válida continuará informativa, não crítica.

### 6. Testes de regressão

Adicionar testes automatizados para:

- cabeçalho de 130 posições e Registro 03 de 338 posições;
- offsets exatos de todos os campos;
- logradouro, número, complemento e bairro isolados;
- textos longos, acentos, TAB, CR/LF e espaços duplicados;
- CID `F84.0` → `F840` sem deslocamento;
- SIGTAP mascarado → 10 dígitos;
- CNS, quantidade, folha e sequência com largura fixa;
- múltiplos procedimentos gerando múltiplas linhas;
- erro estrutural bloqueando o download;
- exportação somente por competência mantendo o resultado e o fluxo existentes.

Também será feita uma verificação no navegador com um arquivo real gerado pela tela, sem alterar dados do banco.

## Arquivos previstos

- Novo módulo de layout em `src/lib/`.
- Novo teste de regressão em `src/test/`.
- Alteração pontual em `src/pages/painel/BpaExportar.tsx` para usar o construtor e exibir erros estruturais.
- Ajuste pontual em `src/lib/bpaNormalization.ts` para a precedência correta de município/IBGE.

Nenhuma tabela, coluna, política ou dado do backend será alterado.
