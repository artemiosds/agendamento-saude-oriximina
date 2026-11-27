# Fase 4 — Motor de monitoramento
- Primeira consulta: 11 contagens totais + alertas (Master) + medidor RPC existente (Master Global). As 20 contagens temporais são carregadas somente na aba Banco de Dados. No máximo 13 requisições de dados na abertura global, em vez de 33; sessão/autenticação e infraestrutura não incluídas.
- Até quatro contagens simultâneas por rodada. Cache de períodos em memória por 120 segundos ao revisitar a aba; botão de atualização invalida. Sem polling, sem persistência de dados e sem cache compartilhado entre usuários. Dados gerais são recarregados ao remontar a área.
- AbortSignal, timeout de 45 segundos por rodada, proteção contra concorrência e respostas obsoletas. A troca de seção desmonta e cancela consultas. A saída da aba de tabelas cancela períodos em andamento.
- Contagens nulas não equivalem a zero; períodos não solicitados não são falhas; contagens divergentes são sinalizadas. Alertas limitados a 100 com verificação de cobertura; sem falso zero. Diagnóstico restrito às consultas realizadas, sem sondar Realtime/Auth.
- CSV mantém medições disponíveis, indicação dos períodos e proteção contra fórmulas. Sem novos dados clínicos, alterações no banco, políticas ou funções. Sem telemetria histórica inventada.
- Validar compilação, testes Vitest, permissões, latência e cancelamento no navegador autenticado antes da homologação.
