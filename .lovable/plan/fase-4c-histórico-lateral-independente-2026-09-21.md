# Fase 4C — histórico lateral independente

## Implementação
- Alterar `HistoricoPacientePanel` para consultar diretamente `prontuarios` pelo `paciente_id`, somente enquanto a edição estiver aberta.
- Usar chave de consulta com paciente, prontuário atual, unidade/escopo e datas do próprio painel; cancelar automaticamente respostas obsoletas pelo sinal da consulta.
- Projetar apenas os campos usados nos cartões e ações existentes, excluir o prontuário atual no servidor e ordenar por data, hora e ID decrescentes.
- Buscar 21 registros por página para exibir até 20 e detectar continuação; manter as páginas já carregadas e oferecer “Carregar atendimentos anteriores”.
- Aplicar os filtros de data do painel no servidor e distinguir carregamento, erro, vazio real e fim do histórico.
- Ajustar somente a integração em `Prontuario.tsx`, removendo a dependência do histórico derivado da lista principal e informando paciente, edição aberta e escopo vigente.

## Proteções
- Não alterar salvamento, autosave, sessão, exclusão, regras clínicas, Fases 1–4B, BPA, SIGTAP, PDF, banco ou permissões.
- Não reutilizar nem duplicar o carregamento multifonte do Histórico Completo.

## Verificação
- Cobrir consulta, exclusão do registro atual, ordenação, paginação, filtros e estados de carregamento/vazio com testes focados.
- Conferir os caminhos de abertura normal, por pesquisa e por Agenda quando houver sessão disponível.
- Executar testes, tipos, lint dos arquivos alterados, `git diff --check` e conferir o build da prévia.
