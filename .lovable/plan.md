

# Plano: Correcoes e Melhorias do Sistema SMS Oriximina

## 1. Atualizar tipos de status (types/index.ts)

Adicionar `confirmado_chegada` ao union type de `Agendamento['status']` para suportar o fluxo recepcao-profissional.

## 2. Corrigir persistencia do paciente no agendamento online (AgendarOnline.tsx)

- Normalizar telefone removendo caracteres nao-numericos antes de buscar duplicatas
- Chamar `refreshPacientes()` apos `addPaciente` para garantir que o paciente apareca na listagem imediatamente
- Adicionar `refreshPacientes` ao destructuring de `useData()`

## 3. Implementar fluxo Recepcao → Profissional (Agenda.tsx)

**Recepcao (nao-profissional):**
- Substituir botao "Chegou" (status `confirmado`) por "Confirmar Chegada" (status `confirmado_chegada`)
- Manter demais botoes de status

**Profissional:**
- Filtrar lista para mostrar APENAS agendamentos com status `confirmado_chegada` ou `em_atendimento`
- Botao "Iniciar" so aparece quando status = `confirmado_chegada`
- Adicionar indicadores visuais de status com cores distintas

**Adicionar `confirmado_chegada` ao statusLabels**

## 4. Corrigir Prontuario - historico do paciente (Prontuario.tsx)

Quando abrir via query params (`pacienteId`):
- Filtrar e mostrar prontuarios anteriores daquele paciente na lista
- Verificar se ja existe prontuario para o agendamento atual antes de criar novo
- Adicionar secao "Historico" dentro do dialog mostrando prontuarios anteriores do paciente selecionado

## 5. Melhorar Relatorios (Relatorios.tsx)

- Adicionar secao "Por Sala/Setor" usando campo `setor` dos atendimentos do banco
- Adicionar secao "Profissionais Cadastrados" listando todos profissionais ativos com seus dados
- Adicionar filtro por setor
- Adicionar contadores de cancelamentos e remarcacoes separados nos KPIs

## 6. Corrigir logAction no DataContext

Atualmente `logAction` recebe `user` como parametro opcional, mas muitas chamadas nao passam o user. Solucao: importar `useAuth` nao e possivel pois DataContext esta acima de AuthContext no tree. Em vez disso, vou adicionar um mecanismo para o DataProvider receber o user via um efeito no App.tsx ou diretamente nas chamadas dos componentes que ja tem acesso ao `useAuth`.

A abordagem mais simples: nas paginas que chamam acoes (Agenda, FilaEspera, etc), ja passam o `user` na chamada de `logAction` quando disponivel. Isso ja esta parcialmente implementado. Vou garantir que as chamadas internas do DataContext (addAgendamento, updateAgendamento, etc) recebam o user quando possivel.

## Arquivos a modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/types/index.ts` | Adicionar `confirmado_chegada` ao status |
| `src/pages/AgendarOnline.tsx` | Normalizar telefone, chamar refreshPacientes |
| `src/pages/painel/Agenda.tsx` | Fluxo recepcao→profissional com confirmado_chegada |
| `src/pages/painel/Prontuario.tsx` | Historico do paciente, evitar duplicatas |
| `src/pages/painel/Relatorios.tsx` | Secao por sala/setor, lista profissionais, filtro setor |

Nenhuma migracao de banco necessaria - o campo `status` e `text` sem constraint.

