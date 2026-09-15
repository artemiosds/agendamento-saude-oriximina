# Corrigir resolução assíncrona do documentoOrigem BPA-I

## Objetivo
Corrigir somente a ordem de resolução do CNPJ institucional usado no cabeçalho BPA-I, sem alterar seleção de atendimentos, procedimentos, validações, filtros, layouts ou banco de dados.

## Alterações
- Criar uma resolução assíncrona explícita em `bpaHeaderSource.ts` com a hierarquia já definida: CNPJ válido da unidade selecionada → configuração institucional → CNPJ único das unidades ativas.
- Reutilizar a mesma Promise quando uma consulta já estiver em andamento e evitar que uma tentativa vazia fique permanentemente armazenada como resultado válido.
- No clique de geração, aguardar essa resolução antes de chamar `buildHeaderBpa()` e passar diretamente o CNPJ final resolvido.
- Manter o cabeçalho obrigatório. Se nenhuma fonte real tiver CNPJ válido, bloquear com mensagem específica de configuração, sem valor fictício e sem usar CPF.
- Ampliar o diagnóstico de desenvolvimento com valores mascarados, fonte escolhida e estado do carregamento.
- Remover do construtor do cabeçalho a dependência implícita do getter em memória; ele validará exclusivamente o valor já resolvido recebido pelo fluxo.

## Validação
- Adicionar testes para CNPJ direto da unidade, fallback institucional aguardado, rejeição de CPF e bloqueio sem fonte real.
- Executar os testes BPA-I existentes e confirmar compilação/build.
- Verificar o banco apenas por leitura. A auditoria atual confirmou que o CNPJ institucional configurado e o CNPJ da unidade ativa estão vazios; portanto, após a correção assíncrona, o sistema continuará bloqueando corretamente até existir um CNPJ real configurado, mas exibirá a causa correta.

## Fora do escopo
Nenhuma alteração em SIGTAP, CBO, idade, DNE, endereço, Registro 03, filtros, Procedimentos Padrão, histórico, banco de dados ou layout do TXT.
