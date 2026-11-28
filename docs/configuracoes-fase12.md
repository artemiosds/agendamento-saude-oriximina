# Fase 12 — Homologação técnica das Configurações do Sistema
Base auditada: 798eb5783708f4bdafa920247d7da94f75e514a3; antes da fase 1: 37fc572290c7d975ba90022f5ae92e39262bc66d. Comparação: 21 commits e 67 arquivos; nenhuma migration/Edge Function, página Triagem/Agenda/Prontuario/Tratamentos/BpaExportar, leitor clínico useCustomFields, motor printLayout ou seed de documento na lista alterada. Não houve operação em dados reais nesta auditoria.
## Evidência anterior à revisão final
- CI 46099076598: TypeScript, bundle e clean-install aprovados; 1471/1504 testes aprovados, 33 falhas em oito arquivos; mesmos nomes da execução 46098598458. Todos os 53 testes novos dos onze módulos de configuração passaram.
- Deno 46099076737, segurança Portal 46099076595, PostgreSQL quota 46099076613: sucesso. Vercel success e Lovable ready na mesma SHA.
## Correções da fase 12
- Editor administrativo compartilhado: invalida leitura antiga e gravações enfileiradas quando uma nova leitura/escopo substitui a anterior; preserva serialização, guarda de seção, auditoria e confirmação do banco. Não cancela uma requisição já enviada; novo salvamento ainda depende da versão observada.
- Testes de escala e histórico: contextos/escopos simulados explicitamente. Verificação de recuperação: ambiente Node para WebCrypto e ArrayBuffer compatíveis. Menu: seleciona link no grupo de recepção, mantendo checagens de permissão. Encaminhamentos: duas ocorrências do indicador de paginação. Monitoramento: mocks de consulta com AbortSignal e filtros temporais. Triagem: usa o nome atual Finalizar Triagem, preservando verificações de payload, validação, erro e ausência de fallback clínico. Nenhum teste removido ou desabilitado. Resultado final deve ser conferido no CI do commit, sem pressupor resolução de todas as 33 falhas.
## Matriz de homologação autenticada (a executar em ambiente isolado)
| Fase | Cenários obrigatórios | Resultado |
|---|---|---|
| 1 | falha de rede, conflito entre dois Masters, sessão expirada | Pendente |
| 2 | 12 seções Master global, 10 Master local, mobile, busca e teclado | Pendente |
| 3 | abrir e salvar configuração de prontuário fictícia, testar todos os perfis | Pendente |
| 4 | catálogo, alteração de disponibilidade, importação e permissões | Pendente |
| 5 | impressão real dos modelos atuais, carimbo, layout, PDF A4 | Pendente |
| 6 | campo personalizado, condição, escopo de unidade, conflito | Pendente |
| 7 | chegada, triagem, fila, faltas, carência e retroatividade fictícia | Pendente |
| 8 | cada provedor, teste de envio autorizado, pausa e reprocessamento fictício | Pendente |
| 9 | permissões, portal, transferência/reativação sem vínculo clínico e bloqueios | Pendente |
| 10 | importação de teste, CID, webhook, OAuth e SMTP autorizados | Pendente |
| 11 | rascunho, identidade e dados, navegação, backup isolado | Pendente |
## Limites e critérios
Sem sessão de homologação autenticada e banco isolado confirmados; não simular operação real nem declarar aprovação funcional integral. Conflitos entre leitores/escritores legados, operações com múltiplas tabelas, importação parcial, credenciais legadas (rotação e migração server-side), RLS e recuperação integral precisam revisão específica. Não execute backup/restauração, disparos, transferências, importações ou mudanças de permissões em produção como teste. Build verde não equivale a homologação operacional. Preservar testes clínicos e não flexibilizar proteção para aprovar CI.
