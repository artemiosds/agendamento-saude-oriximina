# Fase 2 — listagem principal paginada de Prontuários

## Objetivo

Substituir a carga automática de todos os prontuários por páginas de 50 registros consultadas no servidor, preservando a aparência, a virtualização e todas as ações atuais da lista.

## Escopo confirmado

- Alterar somente `src/pages/painel/Prontuario.tsx`.
- Preservar integralmente a Fase 1 de pesquisa SIGTAP.
- Não alterar banco, tabelas, migrations, funções remotas, índices ou RLS.
- Não alterar `openNew`, `openEdit`, `loadFullProntuario`, `handleSave`, `performAutosave` ou `handleRegistrarSessaoOnly`.
- Não alterar criação, edição, autosave, sessão, procedimentos, histórico clínico, BPA, PDF ou permissões.

## Implementação

### 1. Paginação no servidor

- Trocar a consulta React Query atual por uma consulta infinita paginada.
- Buscar inicialmente 50 prontuários e somente buscar a próxima página após “Carregar mais”.
- Priorizar cursor composto por `data_atendimento`, `criado_em` e `id`, todos em ordem decrescente, para garantir desempate estável.
- Usar intervalo controlado por página somente se o cursor for tecnicamente inviável sem alterar contratos; nesse caso, documentar explicitamente o risco de duplicação ou ausência temporária durante inclusões ou exclusões simultâneas.
- Manter na listagem apenas a projeção leve já existente em `LIST_COLS`.
- Preservar a virtualização sobre a união das páginas já carregadas.

### 2. Busca no servidor

- Aplicar debounce de 350 ms ao texto.
- Reiniciar a paginação quando a busca, paciente da URL ou escopo de unidade mudar.
- Pesquisar nome do paciente e nome do profissional diretamente na consulta de prontuários.
- Para CPF/CNS, consultar `pacientes` primeiro com projeção somente de `id`, busca limitada e escopo de unidade; usar apenas os IDs encontrados na consulta de prontuários.
- Não construir nem usar o mapa completo de pacientes para filtrar a lista.
- Quando CPF/CNS não localizar paciente, retornar lista vazia sem carregar prontuários em massa.
- Manter o filtro direto por `pacienteId` da URL no servidor.
- Não adicionar filtros visuais inexistentes: atualmente a página não possui controles de período ou status.

### 3. React Query e Realtime

- Incluir escopo da unidade, paciente da URL e busca debounced na chave da consulta; manter o cursor/página em `pageParam` da consulta infinita.
- Conservar páginas anteriores na tela enquanto a próxima página é buscada.
- Usar o cancelamento/sinal da React Query e a identidade da chave para impedir que respostas antigas substituam a busca atual.
- Em eventos Realtime, invalidar somente a consulta da listagem/filtro atual, sem recarregar todas as páginas automaticamente.
- Não modificar `handleSave`, `performAutosave`, `handleRegistrarSessaoOnly`, rotinas de exclusão nem seus fluxos de atualização otimista.
- Após salvar ou excluir, preservar o comportamento atual; qualquer invalidação necessária será feita fora dessas funções e limitada à consulta paginada atualmente visível.

### 4. Interface e ações

- Manter cartões, virtualização e ações de visualizar, editar, imprimir, baixar, histórico e excluir.
- Exibir carregamento inicial discreto, indicador de carregamento da próxima página e botão “Carregar mais”.
- Exibir “Nenhum prontuário encontrado” quando a primeira página estiver vazia.
- Indicar que existem mais registros enquanto houver próxima página.
- Para entrada vinda da Agenda com `agendamentoId`, resolver pontualmente o prontuário por esse identificador quando ele não estiver nas páginas carregadas, preservando o comportamento atual sem varrer toda a lista.
- A impressão do histórico completo continuará obtendo todos os registros do paciente somente quando essa ação específica for solicitada, sem restaurar carga global na abertura.

## Verificação

- Confirmar pela rede que a abertura solicita somente 50 registros e não inicia paginação automática.
- Validar busca por nome, profissional, CPF e CNS, filtro por paciente da URL, ausência de resultados e “Carregar mais”.
- Validar abertura, visualização e edição em páginas inicial e posterior, sem salvar dados de teste desnecessários.
- Confirmar que a Fase 1 SIGTAP e as funções protegidas permanecem byte a byte inalteradas.
- Executar testes existentes, verificação de tipos, build e `git diff --check`.
- Executar lint e comparar o resultado com a linha de base preexistente.
- Se a sessão autenticada não estiver disponível, registrar claramente quais testes de interface não puderam ser concluídos.

## Critérios de aceite

- Nenhuma consulta automática percorre todos os prontuários.
- Primeira página limitada a 50 registros.
- Próximas páginas somente por ação explícita.
- Busca e filtro de paciente executados no servidor.
- CPF/CNS resolvidos por consulta limitada de IDs de pacientes.
- Ordem estável por data, criação e ID.
- Nenhuma alteração em salvamento, edição clínica, SIGTAP, BPA, banco ou permissões.
