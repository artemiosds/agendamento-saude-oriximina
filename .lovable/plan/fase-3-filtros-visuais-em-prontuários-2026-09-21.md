# Fase 3 — Filtros visuais em Prontuários

## Objetivo
Adicionar filtros compactos de período e profissional à listagem principal, preservando integralmente a busca e a paginação por cursor já existentes.

## Implementação
- Alterar somente `src/pages/painel/Prontuario.tsx`.
- Manter a busca atual e adicionar o botão “Filtros”, fechado inicialmente, com contador de filtros aplicados.
- Exibir abaixo da busca uma área responsiva com Data inicial, Data final, Profissional responsável, “Aplicar” e “Limpar filtros”.
- Usar os calendários Shadcn existentes para as datas e o seletor de profissionais já disponibilizado pelo contexto operacional, respeitando unidade e permissões atuais.
- Separar valores em edição dos filtros efetivamente aplicados; nenhuma consulta será disparada enquanto o usuário apenas preenche os campos.
- Validar data final anterior à inicial, exibir mensagem clara e impedir a aplicação.
- Permitir limpar somente o profissional sem apagar o período.

## Consulta e paginação
- Incluir data inicial, data final e profissional aplicado em `listScope` e na chave React Query.
- A coluna `data_atendimento` foi confirmada no banco como tipo `date`; aplicar `>= dataInicial` e `<= dataFinal`, sem conversão de fuso. Aplicar `profissional_id = profissional` diretamente no servidor.
- Não enviar condição de data ou profissional quando o respectivo filtro estiver vazio.
- Ao aplicar ou limpar filtros, reiniciar o cursor e as páginas acumuladas para começar novamente pela primeira página.
- Preservar os filtros no escopo usado por “Carregar mais”, mantendo páginas de 50 e o cursor composto `data_atendimento`, `criado_em`, `id`.
- Manter o debounce de busca em 350 ms e a combinação entre busca textual, período e profissional.

## Proteções
- Não alterar Fase 1 SIGTAP, funções de abertura/carregamento completo, salvamento, autosave, registro de sessão, exclusão, histórico, BPA, PDF, banco ou permissões.
- Comparar os corpos das funções protegidas antes/depois para comprovar que permaneceram idênticos.

## Validação
- Testar consulta sem filtro, data inicial, período completo, período inválido, profissional, combinação com busca, “Carregar mais” e limpeza.
- Validar abertura/visualização/edição quando houver sessão autenticada disponível.
- Executar testes existentes, verificação de tipos, build, lint e `git diff --check`.
