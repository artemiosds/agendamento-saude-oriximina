

## Problema identificado

Na página **Gestão de Tratamentos**, alguns nomes de pacientes aparecem como "—" (traço). A análise mostrou três causas combinadas:

1. **Limite de 1000 linhas no carregamento de pacientes** — `loadPacientes` em `DataContext.tsx` faz um único `select()` sem paginação recursiva `.range()`. Acima de 1000 pacientes, os mais antigos ficam de fora do `pacientesMap` usado na lista.
2. **RPC `get_treatment_cycles_paginated` não retorna o nome do paciente** — devolve apenas `c.*` (colunas de `treatment_cycles`), então não há fallback quando o paciente não está no estado local.
3. **Renderização sem hook resolver** — a linha `{pac?.nome || "—"}` (linha 3208) não usa o `usePacienteNomeResolver` nem nenhum fallback alternativo, ao contrário de outras telas (Atendimentos, Agenda).

## Correções propostas

### 1. RPC `get_treatment_cycles_paginated` — incluir nome do paciente
Nova migração que substitui a função e adiciona `paciente_nome` (do JOIN com `pacientes`) ao JSON retornado por ciclo. Sem alterar parâmetros, contrato ou demais campos — só agrega o nome.

### 2. `Tratamentos.tsx` — usar fallback de nome
- Adicionar `paciente_nome?: string` na interface `TreatmentCycle`.
- Na renderização da lista (linha 3208) e nos modais que mostram o nome do paciente do ciclo, usar:
  ```ts
  pacientesMap.get(cycle.patient_id)?.nome || cycle.paciente_nome || "Paciente não encontrado"
  ```
- Mesmo padrão para `selectedCycle` no painel direito e no modal de PTS (linha 3003).

### 3. `DataContext.tsx` — paginação recursiva em `loadPacientes`
Aplicar o padrão `.range()` já documentado em memória (`mem://architecture/recursive-pagination`) em `loadPacientes`, idêntico ao usado em `patientService.getAll`. Garante que o `pacientesMap` cubra qualquer volume, beneficiando também outras telas (Agenda, Fila, Pacientes, Prontuário).

## Resultado esperado

- 100% dos ciclos exibem o nome correto do paciente, mesmo em bases >1000 pacientes ou quando o registro está fora da unidade ativa do usuário.
- Nenhuma alteração de schema (apenas substituição de função RPC), sem impacto em SIGTAP, BPA ou prontuários.
- Fallback em três camadas: estado local → snapshot do RPC → mensagem padrão.

## Arquivos afetados

- `supabase/migrations/<nova>.sql` (REPLACE FUNCTION)
- `src/pages/painel/Tratamentos.tsx` (interface + 3 pontos de render)
- `src/contexts/DataContext.tsx` (paginação recursiva em `loadPacientes`)

