# Fase A0 — Correção interna de travamentos da Agenda

## Objetivo
Reduzir processamento e requisições repetidas somente dentro da Agenda, mantendo exatamente a interface, regras, dados, ações e impressão atuais.

## Implementação

1. **Calendário sem recálculo por célula**
   - Em `CalendarioAgenda.tsx`, criar índices memoizados dos agendamentos por data e por combinação de profissional/unidade.
   - Produzir os resumos dos dias visíveis em uma passagem pelos agendamentos relevantes e reaproveitá-los nas células mensal, semanal e diária.
   - Preservar sem alterações a normalização de status futuros, ocupação, capacidade, bloqueios e disponibilidade.

2. **Lista e ordenação com consultas locais constantes**
   - Em `Agenda.tsx`, centralizar o mapa memoizado `pacienteId → paciente` já existente e usá-lo nos filtros, contadores, impressão, cartões e detalhes aplicáveis.
   - Pré-calcular por agendamento as chaves atuais de turno, conclusão, Manchester, idade, prioridade legal, aptidão e chegada antes da ordenação.
   - Consolidar a seleção do dia, busca e contadores para evitar varreduras repetidas, sem mudar ordem, resultados ou totais.

3. **Consultas incrementais e efeitos estáveis**
   - Criar uma chave estável e ordenada dos IDs visíveis do dia.
   - Manter cache por ID de `iniciado_em`/`concluido_em`, buscando somente IDs visíveis ainda não carregados ou que mudaram.
   - Evitar recriar a busca e a assinatura de triagem quando o conjunto de IDs do dia permanecer igual.
   - Atualizar somente o registro recebido no Realtime, preservando regras de chegada, triagem e atendimento.

4. **Cartões**
   - Manter `AgendaItemCard` memoizado e reduzir apenas cálculos repetidos seguros.
   - Não aplicar virtualização nesta fase se ela alterar o contêiner de rolagem, a impressão, o marcador “Pendentes da manhã” ou a navegação por teclado. A lista atual não possui uma área de altura fixa; portanto, a implementação priorizará estabilidade funcional.

5. **Testes e comparação**
   - Adicionar testes determinísticos diretamente relacionados aos índices/resumos, ordenação clínica e contadores, comparando a lógica otimizada com a lógica atual.
   - Validar busca, filtros, calendário mensal/semanal/diário e ações da Agenda sem persistir dados reais.
   - Medir no navegador o tempo e as requisições ao abrir a Agenda e após uma atualização isolada, registrando antes/depois.
   - Executar testes, verificação de tipos e lint; conferir também o resultado automático da compilação e `git diff --check`.

## Arquivos permitidos
- `src/pages/painel/Agenda.tsx`
- `src/pages/painel/CalendarioAgenda.tsx`
- `src/pages/painel/agenda/AgendaItemCard.tsx`, somente se necessário
- testes diretamente relacionados

## Proteções
Nenhum contexto, banco, regra de negócio, payload, fluxo de ação, impressão, texto ou desenho visual será alterado. Se a equivalência não puder ser comprovada, a otimização correspondente não será aplicada.
