

# Plan: Fix Build Errors and Clinical Flow Integration

## Problem Summary
There are 40+ TypeScript build errors across 3 files (`DataContext.tsx`, `Agenda.tsx`, `FilaEspera.tsx`) caused by type mismatches between the code and the `types/index.ts` interfaces. Additionally, the clinical flow needs corrections per the user's rules.

## Root Causes

1. **`DataContext.tsx`**: Uses wrong table name (`configuracoes` instead of `system_config`), maps `User` with wrong field names (`telefone`, `conselho`, `registro` don't exist on User type), `Unidade` mapping missing `telefone`/`whatsapp`, `Agendamento` uses `horaChegada` which doesn't exist on the type, `BloqueioAgenda` uses snake_case in `addBloqueio` but interface is camelCase.

2. **`Agenda.tsx`**: Uses `aprovado_por`, `rejeitado_motivo`, `hora_chegada` (snake_case DB columns) directly in update calls instead of going through `updateAgendamento`. Local `Agendamento` interface has `attachment_url` (snake_case) but the shared type uses `attachmentUrl`. `CalendarioAgenda` call missing `bloqueios` and `disponibilidades` props. Status string not matching union type.

3. **`FilaEspera.tsx`**: Missing imports for `AlertDialog*` and `Clock` from lucide. Compares status with `"demanda_reprimida"` which isn't in the union type. Local `User` type conflicts with imported `User`. Status type incompatibility in `updateFila` call.

## Changes

### 1. `src/types/index.ts`
- Add `horaChegada?: string` to `Agendamento` interface
- Add `"aguardando_enfermagem" | "apto_atendimento"` to `Agendamento.status` union
- Add `"demanda_reprimida"` to `FilaEspera.status` union

### 2. `src/contexts/DataContext.tsx`
- Fix `loadConfiguracoes`: change table from `"configuracoes"` to `"system_config"`, read `configuracoes` field (JSONB) instead of `config_json`
- Fix `loadUnidades`: add `telefone` and `whatsapp` to mapping
- Fix `loadFuncionarios`: map to correct `User` fields (`setor`, `cargo`, `criadoEm`, `criadoPor`, `tipoConselho`, `numeroConselho`, `ufConselho`) instead of `telefone`, `conselho`, `registro`
- Fix realtime `funcionarios` handler: same field mapping fix
- Fix `addFuncionario`: use correct DB column names (`tipo_conselho`, `numero_conselho`, `uf_conselho`, `setor`, `cargo`, `criado_por`)
- Fix `updateFuncionario`: replace `telefone`/`conselho`/`registro` with correct field mappings
- Fix `addBloqueio`: use camelCase from `BloqueioAgenda` interface (`b.dataInicio`, `b.dataFim`, etc.)

### 3. `src/pages/painel/Agenda.tsx`
- Remove local `Agendamento`/`Paciente` interfaces; import from `@/types` or use the ones from `useData()`
- Fix `handleAprovar`/`handleRejeitar`: use `updateAgendamento` with proper camelCase fields (`aprovadoPor`, `rejeitadoMotivo`) instead of raw supabase calls with snake_case
- Fix `handleStatusChange`: cast status properly to match the union type
- Fix `CalendarioAgenda` usage: pass `bloqueios` and `disponibilidades` props
- Fix attachment references: use `attachmentUrl`/`attachmentName`/`attachmentType` consistently

### 4. `src/pages/painel/FilaEspera.tsx`
- Add missing imports: `AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction` from `@/components/ui/alert-dialog`, and `Clock` from `lucide-react`
- Remove local `User` type redefinition that conflicts with imported type
- Fix `demanda_reprimida` status comparison (now valid after types update)
- Fix `updateFila` call: cast status properly

### 5. Clinical Flow Corrections (code logic only)
- **Import (demanda reprimida)**: Ensure `handleImportSave` in `FilaEspera.tsx` inserts into `fila_espera` with `status: "demanda_reprimida"` and `origem_cadastro: "demanda_reprimida"`
- **Arrival confirmation**: `Agenda.tsx` `handleStatusChange` already sets `aguardando_triagem` — verify `updateAgendamento` properly maps `horaChegada` to `hora_chegada` in DB (fix in DataContext)
- **Triage listing**: `Triagem.tsx` already filters by `aguardando_triagem` from agendamentos — this is correct per the rules
- **Triage completion**: Verify save logic updates agendamento to `aguardando_enfermagem` or `apto_atendimento`

## Technical Details

- Total files modified: 4 (`types/index.ts`, `DataContext.tsx`, `Agenda.tsx`, `FilaEspera.tsx`)
- No database changes
- No new features — only type fixes and field mapping corrections
- All changes preserve existing functionality

