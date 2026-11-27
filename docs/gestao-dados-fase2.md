# Fase 2 — Integração da Gestão Operacional e Dados
- /painel/configuracoes-avancadas é o destino único; /painel/monitoramento redireciona com replace para ?aba=monitoramento.
- Menu, busca de módulos e favoritos usam um item único. O favorito legado é associado ao item novo após a filtragem por autorização.
- Master ativo mantém as duas seções existentes; não Master ativo somente com monitoramento_sistema.can_view. ?aba=dados sem autorização mostra negativa e não monta DadosSection. A regra do Master Global para exportações administrativas da fase 1 permanece intacta.
- Uma única seção é montada de cada vez. O monitoramento mantém as sete abas internas e suas rotinas; o backup mantém seus quatro fluxos e a suspensão preventiva do ZIP auxiliar. Troca de aba desmonta o painel anterior; uma nova visita pode disparar a consulta normal existente, sem pré-carregar o outro painel. Otimização/cancelamento integral do monitoramento é escopo da fase 4.
- Nenhuma mudança em tabelas, políticas RLS, edge functions, permissões persistidas ou atendimento. Validar em navegador autenticado com Master Global, Master de unidade, usuário somente monitoramento e usuário sem acesso.
- O desenho institucional completo pertence à fase 3.
