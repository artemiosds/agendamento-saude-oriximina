# Localizar Vagas na Agenda (Fase 3 – integração com a Recepção)

Concordo com todos os 7 ajustes do documento. O plano abaixo evolui o que já existe, sem ferramenta duplicada, sem tabelas, colunas, migrations ou mudança de permissões.

## O que a Recepção vai ganhar
1. Na Agenda, um botão **"Localizar Vagas"** que abre uma busca por **especialidade/serviço, unidade e período (7/15/30 dias)** — funciona **antes** de escolher o paciente.
2. Resultado, para cada profissional **com compatibilidade confirmada**, em três informações separadas:
   - **Avaliação disponível** — existe horário real livre (mesmo da Agenda);
   - **Continuidade estimada** — há perspectiva de capacidade futura pela demanda já conhecida (nunca garantia de 12 ou 20 sessões);
   - **Continuidade a confirmar** — depende do plano que o profissional definirá; a confirmação só ocorre no simulador do Novo Ciclo, com os parâmetros reais.
   Profissional sem compatibilidade identificável aparece como **Capacidade não confirmada** e não é recomendado.
3. Resumo das **sessões pendentes de agendamento** por especialidade e unidade (só totais, sem nomes). Se o perfil não tiver acesso ou a consulta falhar: **"Informação não disponível"**, nunca zero.
4. Clicar numa vaga abre o **modal oficial de Novo Agendamento** com profissional, data e horário preenchidos. O horário é revalidado; nada é gravado sem a recepção confirmar.

## Arquivos reaproveitados
- `src/contexts/OperacionalContext.tsx` — `getAvailableSlots`, `getNextAvailableSlots`, `getAvailableDates` como **única fonte de horários** (nenhuma regra nova de disponibilidade).
- `src/components/agenda/SmartSchedulingAssist.tsx` — mantido como está no fluxo atual (paciente + profissional); a nova busca complementa, não substitui.
- `src/lib/treatmentCapacityPlanning.ts` / `treatmentCapacityAnalytics.ts` — só a parte de continuidade e pendentes (já separa sessões com e sem `appointment_id`).
- `src/lib/filaSpecialtyMatch.ts` e normalização de profissões — para casar especialidade x profissão/CBO.
- `src/pages/painel/Agenda.tsx` — apenas o botão, a gaveta e a abertura do modal existente (`setDialogOpen`) com valores pré-preenchidos.

## O que será alterado / criado
- Novo componente `src/components/agenda/LocalizarVagasPanel.tsx` (gaveta lateral).
- Novas funções puras `classifyDayAvailability()`, `isStrictlyCompatible()` e `estimateContinuity()` em `treatmentCapacityPlanning.ts` que recebe slots já calculados pela Agenda + pendentes e devolve o indicador. Não calcula horários.
- Lista de especialidades montada a partir das **profissões efetivamente cadastradas nos profissionais** da unidade (não lista fixa de termos). Profissional sem profissão reconhecida aparece como "capacidade não confirmada".
- Agenda.tsx: botão na barra + pré-preenchimento do formulário de Novo Agendamento.

## Regras preservadas
- Isolamento por unidade (`useUnidadeFilter`; Master Global vê todas, demais só a sua).
- Feriados, férias e bloqueios só os cadastrados em Feriados e Bloqueios — aviso explícito na gaveta.
- Busca só roda ao clicar em "Buscar" (sob demanda), usando dados já carregados pela Agenda; limite de profissionais/dias para não deixar lenta.
- Todas as validações atuais do Novo Agendamento continuam (duplicidade, bloqueio por faltas, TFD/OJ, CER).
- Triagem, Fila, Prontuário, BPA-I e ciclos não são tocados.

## Correções técnicas obrigatórias incorporadas
1. **Dias carregados:** `getAvailableSlots` retorna vazio quando o dia não está completo (`isCompleteAgendaDate`). A busca carrega os dias do período pela rotina existente da Agenda, sob demanda, e marca cada dia como: *com vagas*, *sem vaga*, *ainda não carregado* ou *erro de consulta*. Dia não carregado nunca vira "sem vaga".
2. **Avaliação x continuidade:** indicadores separados como descrito acima; nenhuma promessa de sessões futuras sem simular o tratamento real.
3. **Compatibilidade rigorosa:** nova função própria da busca exige correspondência identificável entre serviço, profissão e, quando houver, CBO. Desconhecido = "Capacidade não confirmada". `filaEntryMatchesProfession` e a regra da Fila **não são alterados**.
4. **Permissões:** verificar, com o perfil Recepção, se as permissões atuais já permitem ler os totais de sessões pendentes. Sem acesso: "Informação não disponível". RLS e permissões não são alterados.

## Riscos
- Muitos profissionais × 30 dias pode pesar → limitar a até 5 datas por profissional e processar em blocos.
- Profissões com nomes fora do padrão → caem em "não confirmada", nunca em especialidade errada.
- Vaga ocupada entre a busca e o clique → revalidação ao abrir o modal com aviso.

## Testes e critérios de conclusão
- Unitários: estados dos dias (vaga / sem vaga / não carregado / erro), separação avaliação x continuidade, compatibilidade desconhecida nunca recomendada, pendentes sem acesso = "não disponível", casamento especialidade x profissão para todas as profissões cadastradas, pendentes com `appointment_id` não contam em dobro (confirmar, cancelar, remarcar).
- Navegador: abrir Agenda → Localizar Vagas → escolher Fonoaudiologia → ver vagas → clicar → modal aberto preenchido, sem gravar.
- Concluído quando a recepção localiza vaga para paciente novo, vê a continuidade e as pendentes, tudo na Agenda, sem alterar agendamentos existentes.

## Observação sobre GitHub
Eu edito o código aqui no Lovable e as alterações vão automaticamente para a branch main do GitHub conectado. Não consigo editar o GitHub por fora do Lovable. Nada será publicado sem sua autorização.
