# Correção segura de endereços no TXT BPA-I

## Diagnóstico confirmado

- A exportação ativa busca o paciente por `paciente_id` em `pacientes` e lê os campos estruturados `tipo_logradouro`, `logradouro`, `numero`, `complemento`, `bairro`, `cep`, `municipio` e `custom_data` em `BpaExportar.tsx`.
- O Registro 03 é montado por `buildRegistro03()` em `src/lib/bpaTxtLayout.ts`; os campos de endereço ocupam as posições oficiais 192–338 e a função já garante linha com exatamente 338 caracteres.
- A geração ativa ainda resolve o tipo por um mapa manual dentro de `BpaExportar.tsx`, não pela tabela `logradouros_dne`. Há divergências confirmadas: o mapa usa Estrada `035`, Rodovia `072` e Alameda `003`, enquanto a tabela existente registra Estrada `031`, Rodovia `090` e Alameda `004`. O código `072` pertence a Parque.
- `bpaService.ts` já consulta todas as 365 entradas de `logradouros_dne`, com paginação e cache, mas essa resolução não é usada diretamente na montagem final do TXT. Ela também resolve apenas o código; não remove o tipo do texto nem o número duplicado.
- A resolução atual aceita qualquer código salvo sem verificar se ele existe e é compatível com a descrição.
- O município já prioriza o IBGE estruturado válido e usa o CEP somente quando o cadastro está ausente/inválido; divergências são preservadas, mas precisam aparecer claramente como alerta.
- O fluxo auditado faz somente leituras de `pacientes` durante a exportação. Não existe `UPDATE`, `UPSERT` ou gravação de endereço nesse caminho.

## Implementação

### 1. Uma única normalização DNE para a exportação

Criar uma função pura e reutilizável de normalização do endereço BPA que receba:

- catálogo real de `logradouros_dne`;
- código DNE salvo;
- tipo de logradouro salvo;
- texto do logradouro;
- número estruturado.

Ela devolverá `codigoLogradouro`, `logradouro`, `numero`, tipo reconhecido, ajustes determinísticos e alertas, sem persistir dados.

### 2. Consultar a tabela existente antes de montar as linhas

Na geração, carregar `codigo, descricao` de `logradouros_dne` uma vez, com paginação para não depender do limite de 1.000 linhas, e criar índices normalizados por código e descrição.

- Não criar tabela, coluna ou lista manual de códigos.
- Não alterar o cadastro.
- Falha ao carregar o catálogo não inventará código: manterá o texto disponível e produzirá alerta auditável.

### 3. Correspondência segura do tipo

A resolução seguirá esta ordem:

1. preservar código salvo somente quando existir no catálogo e for compatível com o tipo/texto reconhecido;
2. resolver descrição completa do tipo pela tabela;
3. resolver abreviações explicitamente seguras e sem ambiguidade, vinculadas às descrições existentes no catálogo;
4. se não houver correspondência única, deixar o código em branco e registrar alerta.

Serão reconhecidos todos os tipos existentes no catálogo, inclusive nomes compostos. Prefixos repetidos serão removidos do campo textual apenas quando forem o mesmo tipo confirmado.

### 4. Normalizar somente os campos enviados ao Registro 03

Antes de `buildRegistro03()`:

- retirar do `logradouro` somente o prefixo de tipo confirmado, inclusive repetições como `RUA RUA`;
- remover acentos, converter para maiúsculas e compactar espaços;
- remover o número final somente quando ele coincidir exatamente com o campo estruturado `numero`, após normalização segura;
- não remover números legítimos do nome e não alterar `35B`, `12A`, `SN` ou `S/N` quando não forem duplicação exata;
- manter número, complemento e bairro em seus campos próprios;
- deixar o corte de tamanho exclusivamente a cargo do construtor posicional já existente.

A tela de conferência e os alertas usarão o mesmo resultado normalizado enviado ao TXT, evitando duas interpretações do endereço.

### 5. Município, IBGE e CEP

Manter a precedência atual do IBGE estruturado válido. Quando CEP e IBGE válido divergirem, preservar o IBGE e registrar alerta informativo; nunca substituir silenciosamente nem gravar correção.

### 6. Validação final e auditoria

Antes do download:

- validar o código contra o catálogo DNE carregado;
- validar logradouro e número normalizados;
- anexar ajustes determinísticos aos avisos existentes;
- anexar situações sem correspondência ou conflitantes às pendências de auditoria;
- manter o bloqueio estrutural existente para qualquer Registro 03 diferente de 338 posições.

## Testes

Adicionar testes unitários com um catálogo DNE controlado para:

- Rua João Stumano → código oficial de Rua + `JOAO STUMANO`;
- Avenida Brasil → código oficial + `BRASIL`;
- Travessa da Conquista → código oficial + `DA CONQUISTA`;
- código salvo válido e compatível preservado;
- `RUA RUA JOAO STUMANO` sem tipo duplicado;
- `TR DA CONQUISTA 632` + `632` sem número duplicado;
- `INDEPENDENCIA 2287` + `2287` sem número duplicado;
- número legítimo no nome preservado;
- ausência ou ambiguidade no DNE preservando texto e gerando alerta;
- Acesso, Atalho, Alameda, Estrada, Rodovia, Viela, Passagem e outros tipos reais;
- código salvo inexistente ou incompatível não aceito silenciosamente;
- município estruturado preservado diante de CEP divergente;
- Registro 03 final com exatamente 338 caracteres.

Executar os testes BPA existentes, os novos testes, verificação de tipos e validação no navegador com uma geração real, sem modificar dados.

## Arquivos previstos

- Novo módulo pequeno em `src/lib/` para a normalização DNE de exportação.
- Teste unitário correspondente em `src/lib/`.
- Alteração pontual em `src/pages/painel/BpaExportar.tsx` para carregar o catálogo, aplicar a normalização antes de `buildRegistro03()` e exibir alertas.
- Ajuste mínimo em `src/lib/bpaTxtLayout.test.ts` apenas se necessário para validar a integração posicional.

Nenhuma tabela, coluna, política, cadastro de paciente ou histórico clínico será alterado.
