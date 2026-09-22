# Fase Agenda A1.1 — Ativação explícita e compatibilidade

## Objetivo

Impedir a carga integral de pacientes e agendamentos imediatamente após o login, mantendo os providers montados, as APIs públicas atuais dos contexts e o comportamento de todas as rotas.

Esta implementação será limitada à A1.1. Não inclui consultas da Agenda por faixa, pacientes mínimos, LRU/TTL, Realtime por escopo nem qualquer mudança no calendário, lista, pendências ou Novo Agendamento.

## Causa confirmada

`DomainProviders` envolve todas as rotas. Assim que o usuário autentica:

- `PacientesContext` percorre todos os pacientes permitidos em páginas de 1.000.
- `AgendamentosContext` carrega os últimos 14 dias e todos os registros antigos não finalizados.
- Isso ocorre mesmo no Dashboard e em rotas que não precisam desses arrays.

Apenas remover esses efeitos quebraria consumidores existentes: há 15 arquivos ligados a `usePacientes`, 11 ligados a `useAgendamentos`, e o `OperacionalContext` usa o snapshot de agendamentos para vagas e turnos.

## Implementação

### 1. Ativação explícita nos contexts

- Manter `PacientesSliceProvider` e `AgendamentosSliceProvider` montados na posição atual.
- Manter todas as propriedades e funções públicas hoje expostas por `usePacientes()` e `useAgendamentos()`.
- Remover somente o disparo automático de `loadPacientes()` e `loadAgendamentos()` baseado exclusivamente em autenticação.
- Adicionar funções idempotentes de ativação legada aos contexts. Chamadas repetidas para o mesmo usuário/unidade compartilharão a mesma carga em andamento e não iniciarão novas varreduras.
- Preservar integralmente consultas, projeções, mapeamentos, paginação atual, mutações, payloads, atualizações otimistas, auditoria e bridges quando o modo legado for ativado.
- Manter as assinaturas Realtime existentes. Enquanto o conjunto ainda não tiver sido ativado, callbacks de recarga não iniciarão uma carga integral; após a ativação, continuam com o comportamento atual.
- Reiniciar a marca de ativação na troca de usuário ou unidade, antes de aceitar o resultado da nova carga, evitando que uma resposta anterior preencha o escopo atual.

### 2. Ativador por rota

Criar um ativador sem interface, montado dentro dos providers e do roteamento autenticado, que chama explicitamente os loaders legados conforme a rota aberta. Ele não altera menus, navegação, conteúdo, textos ou layout.

| Rota | Pacientes legado | Agendamentos legado |
|---|---:|---:|
| `/painel/agenda` | Sim | Sim |
| `/painel/pacientes` | Sim | Sim |
| `/painel/atualizacao-cadastral` | Sim | Não |
| `/painel/fila` | Sim | Sim, necessário pelas rotinas de encaixe/vaga |
| `/painel/prontuario` | Sim | Sim |
| `/painel/triagem` | Sim | Sim |
| `/painel/tratamentos` | Sim | Sim |
| `/painel/pts` | Sim | Não |
| `/painel/relatorios` | Sim | Não |
| `/painel/alta` | Sim | Não |
| `/painel/multiprofissional` | Não | Sim |
| Dashboard `/painel` | Não | Não |

Componentes auxiliares continuarão cobertos pela rota que os monta: conferência cadastral, importação, relatório fonoaudiológico, resolução de nomes, fila automática e indicador de vagas.

Antes de concluir, será feita uma busca final de consumidores. Se uma rota depender de um conjunto não ativado, a implementação será interrompida e o consumidor será informado, conforme solicitado.

### 3. Dashboard com consultas mínimas

O Dashboard deixará de consumir os arrays globais de pacientes e agendamentos.

Serão feitas consultas próprias, somente leitura, com o mesmo isolamento atual por unidade e profissional:

- **Agenda de hoje / Consultas Hoje / Confirmados-Chegou:** registros de hoje com somente os campos usados na lista e nos contadores; o nome já armazenado no agendamento será mantido como hoje.
- **Taxa No-Show:** contagens exatas separadas para total, faltas e cancelados, reproduzindo exatamente o universo atual de 14 dias mais registros antigos não finalizados, sem transferir todas as linhas.
- **Atendimentos da Semana:** somente os sete dias exibidos e os campos necessários para preservar a regra atual de composição com `atendimentos`.
- **Agendamentos por Profissional:** somente nome do profissional no mesmo universo usado hoje; sem carregar objetos completos de agendamento.
- **Atendimentos, fila, salas, funcionários, unidades e disponibilidades:** permanecem nas fontes atuais.

As consultas serão executadas em paralelo, terão descarte de resposta obsoleta na troca de usuário/unidade e manterão o mesmo estado de carregamento já exibido pelo Dashboard. Não haverá tabela, função, RPC ou índice novo.

### 4. Compatibilidade entre rotas

- Abrir diretamente uma rota legada ativa os mesmos dados que ela recebia após o login.
- Voltar para uma rota já ativada reaproveita o estado atual do context; não será implementado descarte LRU/TTL nesta etapa.
- Agenda continuará recebendo o mesmo conjunto legado atual: últimos 14 dias, futuros e pendências antigas, além da hidratação de datas passadas já existente.
- Pacientes continuará recebendo o mesmo conjunto integral atual quando sua rota for aberta.
- `admin.sms` mantém visão global; Master com unidade e demais perfis mantêm o isolamento atual.
- Bridges de agendamentos e fila continuam com o mesmo formato e finalidade.

## Arquivos previstos

- `src/contexts/PacientesContext.tsx`
- `src/contexts/AgendamentosContext.tsx`
- `src/App.tsx` ou um pequeno ativador de rota criado em `src/contexts/`
- `src/pages/painel/Dashboard.tsx`
- Testes diretamente relacionados à ativação e às consultas do Dashboard

`OperacionalContext`, `FilaContext`, bridges e páginas legadas só serão alterados se a verificação de consumidores provar ser indispensável para compatibilidade. Se isso exigir mudança de regra, fluxo ou item proibido, a implementação será interrompida.

## Cargas que deixarão de ocorrer no login

- Varredura integral de `pacientes`.
- Carga global de `agendamentos` dos últimos 14 dias/futuro.
- Carga de todos os agendamentos antigos ainda não finalizados.
- Recarga integral desses conjuntos antes de alguma rota explicitamente ativá-los.

Dados operacionais e fila permanecem fora desta alteração.

## Proteções

- Nenhuma mudança visual, textual ou de navegação.
- Nenhuma mudança nas regras de Agenda, vagas, turnos, disponibilidade, bloqueios, status, prioridades, pendências ou notificações.
- Nenhuma mudança em criação, edição, conclusão, cancelamento, falta, exclusão, impressão ou Novo Agendamento.
- Nenhuma mudança em banco, tabelas, migrations, RPC, RLS, permissões, BPA, Prontuário ou SIGTAP.
- Nenhuma mudança nas consultas por período da Agenda nesta etapa.
- Nenhuma mudança na configuração, filtro ou estratégia dos canais Realtime; somente o loader integral ficará inativo até a rota solicitar o conjunto.

## Testes obrigatórios

1. **Login:** confirmar na rede que nenhuma paginação integral de pacientes nem as duas cargas globais de agendamentos ocorre antes de uma rota ativadora.
2. **Dashboard:** comparar todos os cartões, gráfico semanal, gráfico por profissional e Agenda de Hoje antes/depois, para cada perfil e unidade.
3. **Agenda:** abrir diretamente e após o Dashboard; comparar calendário, lista, filtros, pendências, contadores, vagas e todas as ações existentes.
4. **Pacientes:** listagem, pesquisa, abertura por URL, criação e edição após ativação legada.
5. **Fila:** listagem, detalhes, encaixe e vaga liberada com pacientes/agendamentos disponíveis.
6. **Prontuário:** abertura direta, vínculo por paciente/agendamento e retorno à Agenda.
7. **Demais ativadores:** Triagem, Tratamentos, PTS, Relatórios, Alta, Atualização Cadastral e Avaliação Multiprofissional.
8. **Escopo:** recepção, profissional, Master de unidade e `admin.sms`; troca de unidade/usuário sem dados cruzados.
9. **Navegação:** Dashboard → Agenda → Pacientes → Fila → Prontuário → Dashboard e sequência inversa.
10. **Realtime:** confirmar que os canais e o comportamento atual permanecem funcionais depois da ativação, sem introduzir nova estratégia por escopo.
11. **Concorrência:** duas ativações simultâneas fazem uma única carga; resposta de unidade anterior não substitui a atual.
12. **Validação técnica:** suíte existente e novos testes, tipos, build, lint e `git diff --check`; débitos de lint preexistentes serão relatados separadamente.

## Fora desta etapa

A1.2, A1.3, A1.4 e A1.5 permanecem adiadas. Não haverá paginação/faixa nova na Agenda, hidratação mínima de pacientes, LRU/TTL nem Realtime filtrado por escopo.

Nenhum arquivo de aplicação ou banco foi alterado nesta etapa de revisão; apenas o plano foi restringido à A1.1.
