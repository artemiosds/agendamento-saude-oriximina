# Fase Agenda A1 — Dados sob demanda sem mudar o fluxo

## Resumo da causa

Os quatro providers de domínio envolvem todas as rotas e são montados antes delas. Após a autenticação, `PacientesContext` percorre todos os pacientes em lotes de 1.000 e `AgendamentosContext` carrega os últimos 14 dias mais todos os agendamentos antigos não finalizados, mesmo quando a rota aberta não precisa desses dados. Os dois também mantêm Realtime ativo desde o login. A Agenda já possui carregamento complementar por data/faixa, mas ele hoje apenas acrescenta registros à carga inicial ampla.

A retirada direta desses carregamentos não é segura: 15 arquivos consomem `usePacientes`, 11 consomem `useAgendamentos`, e os cálculos de vagas do `OperacionalContext` leem agendamentos pelo bridge. A migração deve manter as APIs e mutações atuais enquanto ativa cada conjunto somente na rota que realmente o utiliza.

## Arquivos envolvidos

### Núcleo a modificar
- `src/App.tsx` e/ou `src/contexts/DomainProviders.tsx`: informar a necessidade de dados conforme a rota autenticada, sem desmontar os providers.
- `src/contexts/PacientesContext.tsx`: remover a carga total automática no login; adicionar hidratação por IDs, busca remota e modo legado sob demanda.
- `src/contexts/AgendamentosContext.tsx`: remover a carga ampla automática; manter cache delimitado por unidade/faixa e atualizar somente escopos ativos.
- `src/contexts/_agendamentosBridge.ts`: preservar o contrato do snapshot usado nos cálculos de vagas; alterar somente se necessário para identificar o escopo carregado.
- `src/pages/painel/Agenda.tsx`: declarar as faixas e conjuntos necessários, hidratar pacientes dos agendamentos exibidos e manter as ações existentes.
- `src/pages/painel/CalendarioAgenda.tsx`: somente comunicar a faixa visível já calculada; nenhuma alteração visual ou de regra.
- `src/components/BuscaPaciente.tsx`: consolidar busca remota com escopo de unidade, debounce e proteção contra respostas antigas.
- `src/components/AgendaNotificacoes.tsx`: receber/hidratar apenas contatos dos agendamentos que serão avisados.
- `src/hooks/queries/queryKeys.ts`: chaves por unidade, faixa, data, pendências e IDs.

### Compatibilidade a revisar ou adaptar
- `src/pages/painel/Dashboard.tsx`: substituir dependência dos arrays completos por consultas mínimas para os indicadores e períodos já exibidos; isso é necessário para o login não reativar a carga ampla na rota inicial.
- Consumidores legados de pacientes/agendamentos: Agenda, Dashboard, Pacientes, Prontuário, Fila, Triagem, Tratamentos, PTS, Relatórios, Relatório de Alta, Atualização Cadastral, Avaliações e componentes auxiliares. Nesta fase, cada rota ainda dependente do conjunto completo acionará explicitamente o modo legado ao abrir, preservando seu comportamento atual.
- `src/contexts/OperacionalContext.tsx`, `src/contexts/FilaContext.tsx` e `src/contexts/_filaBridge.ts`: somente ajustes mínimos de ativação/compatibilidade se necessários; regras, cálculos e mutações permanecem iguais.

## Dados realmente necessários pela Agenda

| Necessidade | Consulta sob demanda |
|---|---|
| Calendário mensal/semanal/diário | `agendamentos` entre o início e o fim exatos da faixa visível, com a projeção atual e escopo de unidade/profissional aplicável |
| Lista do dia | todos os status da data selecionada; a consulta da faixa é reaproveitada e a data é garantida separadamente quando necessário |
| Pendências antigas | somente status atualmente considerados pendentes, anteriores ao momento atual, com o mesmo escopo e campos usados no painel |
| Pendentes online | somente `origem = online` e `status = pendente`, mantendo a ordenação atual |
| Busca de paciente | consulta remota após 2 caracteres, debounce de 300 ms, limite de 20 e escopo permitido |
| Dados dos cartões/ordenação | pacientes únicos referenciados pelos agendamentos carregados, buscados em lotes por UUID |
| Novo Agendamento | paciente selecionado por UUID; profissionais, unidades, salas, disponibilidades e bloqueios atuais; ocupação da data escolhida |
| Notificações | telefone/e-mail apenas dos pacientes pertencentes à lista efetivamente escolhida |
| Tempos e triagem | somente IDs visíveis do dia, preservando a otimização da Fase A0 |
| Realtime | eventos de agendamentos e pacientes relevantes aos escopos atualmente carregados |

## Plano de implementação por etapas

### A1.1 — Ativação explícita e compatibilidade
1. Manter os providers globais e suas APIs públicas para não quebrar consumidores.
2. Remover apenas os efeitos que carregam pacientes e agendamentos automaticamente ao autenticar.
3. Introduzir estados explícitos de carga (`idle/loading/ready/error`), geração por unidade e funções idempotentes: carregar modo legado, faixa, data, pendências, IDs de pacientes e atualizar escopos ativos.
4. Criar uma política de necessidade por rota. Rotas ainda não migradas acionam o carregamento legado somente ao serem abertas; rotas públicas e a rota inicial não pagam esse custo.
5. Adaptar o Dashboard para consultas mínimas dos mesmos períodos e indicadores, evitando que ele reative os arrays completos logo após o login.

### A1.2 — Agenda com agendamentos por escopo
1. Ao abrir a Agenda, buscar em paralelo a faixa visível inicial, a data selecionada, pendências antigas e pendentes online.
2. Reutilizar o callback de faixa do calendário para mês, semana e dia; deduplicar por `id`.
3. Preservar integralmente a projeção/mapeamento atual, filtros, ordem, contadores, ocupação, bloqueios, salas, cotas e disponibilidade.
4. Fazer `refreshAgendamentos` atualizar somente os escopos ativos na Agenda. As mutações continuam com os mesmos payloads, auditoria e atualização otimista.
5. Garantir a data de destino antes de calcular vaga em Novo Agendamento, retorno, edição ou remarcação.

### A1.3 — Pacientes mínimos na Agenda
1. Extrair os UUIDs únicos dos agendamentos carregados e hidratar apenas esses pacientes, em lotes limitados e com projeção dos campos realmente usados.
2. Usar a busca remota já existente no Novo Agendamento, aplicando de fato o filtro de unidade e mantendo o limite de 20.
3. Ao selecionar, abrir detalhe, aprovar, rejeitar, cancelar, registrar falta, iniciar atendimento, imprimir ou notificar, garantir o paciente por UUID antes da ação quando ele não estiver no cache.
4. Preservar o nome desnormalizado do agendamento como fallback visual, sem inventar CPF, contato, idade ou condição clínica.

### A1.4 — Cache delimitado e concorrência
1. Chavear todo cache por usuário/unidade e por faixa ou ID; nunca reutilizar dados entre unidades.
2. Usar `AbortController` e contador monotônico de requisição para que uma resposta antiga não substitua unidade, data ou pesquisa mais recente.
3. Compartilhar promessas em andamento e deduplicar IDs/faixas sobrepostas.
4. Manter somente a faixa atual, a anterior e a próxima, além da data selecionada, pendências e registros alterados na sessão. Descartar faixas mais antigas por LRU/TTL; não acumular meses indefinidamente.
5. Na troca de usuário ou unidade, cancelar requisições, limpar arrays, índices, bridges, IDs carregados e caches antes da nova consulta.

### A1.5 — Realtime e consumidores legados
1. Ativar canais de pacientes/agendamentos somente depois que o respectivo conjunto tiver sido solicitado.
2. Aplicar INSERT/UPDATE/DELETE por ID. Na Agenda, manter o evento apenas se ele pertencer à faixa, data, pendências ou pendentes online ativos; remover quando deixar de pertencer.
3. No fallback de conexão, recarregar somente os escopos ativos, nunca a tabela inteira por padrão.
4. Manter o bridge de agendamentos sincronizado com o cache atual para que `getTurnoInfo`, `getAvailableSlots` e `getDayInfoMap` preservem os cálculos atuais.
5. Nas rotas legadas, ativar o carregamento atual somente ao entrar e manter seu comportamento até uma fase futura específica; não migrar Prontuário, BPA ou regras clínicas nesta fase.

## Dados que deixarão de carregar após o login

- Todos os pacientes da unidade — e todas as unidades para `admin.sms`.
- A janela global de agendamentos dos últimos 14 dias.
- Todo o histórico antigo de agendamentos ainda não finalizados.
- Recarregamentos completos de pacientes causados por Realtime quando nenhuma tela solicitou esses dados.
- Canal/poll de pacientes e agendamentos quando nenhum consumidor ativo os requisitou.

`unidades`, `salas`, `funcionarios`, `configuracoes`, `disponibilidades`, `bloqueios` e a fila operacional permanecem como estão nesta fase, pois têm menor volume e ampla dependência. A sua migração não faz parte da A1.

## Dados carregados somente ao abrir a Agenda

- Agendamentos da faixa visível do calendário e da data selecionada.
- Agendamentos antigos realmente pendentes e solicitações online pendentes.
- Pacientes referenciados por esses agendamentos, sem varrer o cadastro inteiro.
- Resultados de pacientes somente após pesquisa.
- Tempos de atendimento e triagens somente para os IDs visíveis do dia.
- Dados operacionais já usados hoje: profissionais, unidades, salas, disponibilidades, bloqueios, configurações e fila operacional.

## Riscos e proteções

- **Dados incompletos confundidos com ausência:** cada escopo terá estado de carregamento próprio; contadores só serão considerados prontos após todas as fontes necessárias concluírem.
- **Cálculo incorreto de vagas:** nenhuma vaga será calculada antes da hidratação da data/faixa correspondente; bridge e funções atuais serão preservados.
- **Mistura entre unidades:** chaves incluem unidade/usuário, e a troca limpa estado e cancela respostas antigas. `admin.sms` mantém visão global quando nenhum filtro de unidade é aplicado.
- **Eventos perdidos no Realtime:** upsert por ID mais reconciliação limitada dos escopos ativos; fallback nunca transforma uma atualização em carga global silenciosa.
- **Ações sem contato/dados clínicos:** hidratação por UUID antes da ação; em falha, a ação informa o erro em vez de usar dado vazio.
- **Diferenças em pendências e notificações:** reproduzir exatamente os conjuntos de status, recortes de tempo, ordenação e permissões existentes em testes de equivalência.
- **Regressão em outras telas:** modo legado explícito por rota durante a transição; nenhuma assinatura pública ou payload de mutação é removido.
- **Crescimento de memória:** limite de faixas, deduplicação por ID, TTL/LRU e limpeza em logout/troca de unidade.

## Testes obrigatórios

1. **Login:** recepção, profissional, Master de unidade e `admin.sms`; confirmar ausência de consultas completas a pacientes/agendamentos antes de uma rota solicitá-las.
2. **Agenda:** mesma lista, ordem clínica, busca, filtros, abas, contadores, pendências, pendentes online, calendário mensal/semanal/diário, ocupação, vagas e bloqueios.
3. **Ações:** Novo Agendamento, retorno, editar, remarcar, concluir, cancelar, falta, excluir, iniciar atendimento, impressão e notificações individuais/em massa, com os mesmos payloads e resultados.
4. **Navegação:** trocar dia/semana/mês rapidamente; confirmar deduplicação, cancelamento de respostas antigas e ausência de mistura entre pacientes.
5. **Realtime:** inserir, editar, mover de data, alterar status e excluir um agendamento; atualizar um paciente carregado; simular queda e reconexão.
6. **Unidades e perfis:** trocar unidade como Master autorizado; profissional vê somente sua agenda; Master de unidade permanece isolado; `admin.sms` mantém visão global.
7. **Outros módulos:** Dashboard, Pacientes, Fila, Prontuário, Triagem, Tratamentos, PTS, Relatórios e Avaliações mantêm dados e ações atuais ao navegar diretamente e ao voltar da Agenda.
8. **Cache:** navegar por muitos meses e verificar limite de memória; logout/login e troca de unidade devem zerar dados anteriores.
9. **Medição antes/depois:** quantidade de requisições, linhas transferidas, bytes, tempo até interatividade e memória após login, ao abrir Agenda e após alterar um agendamento.
10. **Automação:** testes determinísticos de merge/deduplicação/expulsão, equivalência de pendências/contadores/ordem/vagas, testes de corrida; suíte existente, tipos, build, lint e `git diff --check`.

## Limites desta fase

Nenhuma alteração em banco, tabelas, migrations, RPC, RLS, permissões, BPA, Prontuário, SIGTAP, regras da Agenda, disponibilidade, pendências, status, prioridade, bloqueios, salas, notificações, interface ou fluxo. A implementação deve ser interrompida se a equivalência depender de modificar qualquer item proibido.

Nenhum arquivo de aplicação ou banco foi alterado nesta etapa; somente este plano foi registrado para revisão.
