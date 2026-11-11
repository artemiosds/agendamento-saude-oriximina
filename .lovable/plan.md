# Localizar Vagas na Agenda (Fase 3 – integração com a Recepção)

Concordo com todos os 7 ajustes do documento. O plano abaixo evolui o que já existe, sem ferramenta duplicada, sem tabelas, colunas, migrations ou mudança de permissões.

## O que a Recepção vai ganhar
1. Na Agenda, um botão **"Localizar Vagas"** que abre uma busca por **especialidade/serviço, unidade e período (7/15/30 dias)** — funciona **antes** de escolher o paciente.
2. Resultado: para cada profissional compatível, as próximas datas e horários livres reais (mesmos que a Agenda mostra) e um indicador de continuidade:
   - **Disponível** — há vaga e espaço futuro para o tratamento;
   - **Capacidade comprometida** — sessões pendentes já disputam a agenda;
   - **Necessita revisão** — agenda cheia ou conflitos;
   - **Capacidade não confirmada** — faltam dados (sem grade, sem profissão definida).
3. Um resumo das **sessões pendentes de agendamento** daquela especialidade (contagem, sem nomes).
4. Clicar numa vaga abre o **modal oficial de Novo Agendamento** com profissional, data e horário preenchidos. O horário é revalidado; nada é gravado sem a recepção confirmar.

## Arquivos reaproveitados
- `src/contexts/OperacionalContext.tsx` — `getAvailableSlots`, `getNextAvailableSlots`, `getAvailableDates` como **única fonte de horários** (nenhuma regra nova de disponibilidade).
- `src/components/agenda/SmartSchedulingAssist.tsx` — mantido como está no fluxo atual (paciente + profissional); a nova busca complementa, não substitui.
- `src/lib/treatmentCapacityPlanning.ts` / `treatmentCapacityAnalytics.ts` — só a parte de continuidade e pendentes (já separa sessões com e sem `appointment_id`).
- `src/lib/filaSpecialtyMatch.ts` e normalização de profissões — para casar especialidade x profissão/CBO.
- `src/pages/painel/Agenda.tsx` — apenas o botão, a gaveta e a abertura do modal existente (`setDialogOpen`) com valores pré-preenchidos.

## O que será alterado / criado
- Novo componente `src/components/agenda/LocalizarVagasPanel.tsx` (gaveta lateral).
- Nova função pura `classifyContinuity()` em `treatmentCapacityPlanning.ts` que recebe slots já calculados pela Agenda + pendentes e devolve o indicador. Não calcula horários.
- Lista de especialidades montada a partir das **profissões efetivamente cadastradas nos profissionais** da unidade (não lista fixa de termos). Profissional sem profissão reconhecida aparece como "capacidade não confirmada".
- Agenda.tsx: botão na barra + pré-preenchimento do formulário de Novo Agendamento.

## Regras preservadas
- Isolamento por unidade (`useUnidadeFilter`; Master Global vê todas, demais só a sua).
- Feriados, férias e bloqueios só os cadastrados em Feriados e Bloqueios — aviso explícito na gaveta.
- Busca só roda ao clicar em "Buscar" (sob demanda), usando dados já carregados pela Agenda; limite de profissionais/dias para não deixar lenta.
- Todas as validações atuais do Novo Agendamento continuam (duplicidade, bloqueio por faltas, TFD/OJ, CER).
- Triagem, Fila, Prontuário, BPA-I e ciclos não são tocados.

## Riscos
- Muitos profissionais × 30 dias pode pesar → limitar a até 5 datas por profissional e processar em blocos.
- Profissões com nomes fora do padrão → caem em "não confirmada", nunca em especialidade errada.
- Vaga ocupada entre a busca e o clique → revalidação ao abrir o modal com aviso.

## Testes e critérios de conclusão
- Unitários: `classifyContinuity` (4 estados), casamento especialidade x profissão para todas as profissões cadastradas, pendentes com `appointment_id` não contam em dobro (confirmar, cancelar, remarcar).
- Navegador: abrir Agenda → Localizar Vagas → escolher Fonoaudiologia → ver vagas → clicar → modal aberto preenchido, sem gravar.
- Concluído quando a recepção localiza vaga para paciente novo, vê a continuidade e as pendentes, tudo na Agenda, sem alterar agendamentos existentes.

## Observação sobre GitHub
Eu edito o código aqui no Lovable e as alterações vão automaticamente para a branch main do GitHub conectado. Não consigo editar o GitHub por fora do Lovable. Nada será publicado sem sua autorização.
