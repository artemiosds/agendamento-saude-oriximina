# Fase 4B — Histórico Completo progressivo

## Objetivo
Carregar primeiro os 90 dias mais recentes do Histórico Completo e buscar períodos anteriores somente por ação do usuário, sem perder, repetir ou misturar eventos.

## Implementação
- Alterar apenas `src/components/HistoricoCompletoModal.tsx` e, se necessário, testes diretamente ligados a ele.
- Consultar separadamente prontuários, faltas, sessões e altas dentro de faixas consecutivas e não sobrepostas de 90 dias.
- Usar projeções resumidas para os cartões, limites e cursores próprios por fonte quando uma faixa exceder o limite.
- Buscar triagens e ciclos somente para os IDs resumidos recebidos naquela página; buscar conteúdo clínico completo do prontuário somente ao expandir ou visualizar.
- Consolidar por chave canônica `fonte:id` e ordenar por data, hora, prioridade fixa da fonte e ID, todos de forma determinística.
- Manter os eventos carregados ao avançar e só liberar a faixa anterior quando todas as fontes da faixa atual estiverem esgotadas.
- Cancelar requisições e zerar paginação, expansão e continuação ao fechar ou trocar o paciente.
- Fazer os dois comandos atuais de relatório/impressão drenarem todas as faixas ainda pendentes, com indicador de progresso, antes de chamar as rotinas existentes e respeitando os filtros atuais.

## Verificação
- Cobrir ausência de histórico, faixas recente/antiga, empates entre fontes, excesso em uma faixa, múltiplos carregamentos e deduplicação.
- Confirmar carregamento pontual de detalhes e isolamento em troca rápida de paciente.
- Comparar os IDs drenados para impressão com consultas integrais somente leitura quando houver sessão autenticada disponível.
- Executar testes, tipos, lint dos arquivos alterados, `git diff --check` e conferir o build da prévia.

## Limites
Nenhuma mudança em banco, permissões, persistência clínica, BPA, SIGTAP, PDF, Fases 1–3, Fase 4A ou `HistoricoPacientePanel`.
