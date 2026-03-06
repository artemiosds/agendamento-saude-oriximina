# Plan: Complete System Fixes and Enhancements

This plan addresses all the issues reported: day name display, availability sync with public booking, waiting queue improvements, and integration preparations.

## Root Cause Analysis

The core issue is that **all data is stored in React state (in-memory)** with no persistence. When availability is configured in the panel, it works within the same browser session, but the public booking page correctly reads from `disponibilidades` state. The day names in the code are already correct (`['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']`), but the layout can be improved. The main sync problem is that the professional filter on `AgendarOnline.tsx` requires `f.unidadeId === form.unidadeId` which is too restrictive -- a professional could serve multiple units via availability config.

## Changes

### 1. Fix Professional Filtering in Public Booking (`AgendarOnline.tsx`)

**Problem:** Line 28 filters by `f.unidadeId === form.unidadeId`, but a professional's `unidadeId` is their "home" unit. They should appear for any unit where they have availability configured.

**Fix:** Remove the `f.unidadeId` check and rely solely on `disponibilidades` to determine which professionals are available at which units:

```tsx
const profissionaisComDisponibilidade = useMemo(() => {
  return funcionarios.filter(f => 
    f.role === 'profissional' && f.ativo &&
    disponibilidades.some(d => d.profissionalId === f.id && 
      (!form.unidadeId || d.unidadeId === form.unidadeId))
  );
}, [funcionarios, disponibilidades, form.unidadeId]);
```

### 2. Improve Disponibilidade Day Selector (`Disponibilidade.tsx`)

- Ensure day labels are clearly `Dom, Seg, Ter, Qua, Qui, Sex, Sáb`
- Make buttons equal-width, centered, with clear selected/unselected states
- Add a "flex-wrap" for mobile responsiveness
- Show full day names in the availability cards display

### 3. Enhanced Waiting Queue (`FilaEspera.tsx`)

Major rewrite to add:

- **Add patient to queue dialog** with fields: patient search/name, unit, professional, priority, notes
- **Filters** by unit, professional, priority, status
- **Auto-slot suggestion**: when a cancellation occurs, check queue for compatible patients and show suggestion
- **Status options**: aguardando, encaixado, chamado, em_atendimento, atendido, falta
- **Edit/remove** buttons for queue entries
- Permission check: only master, gestao, coordenador, recepcao can manage

### 4. Add `FilaEspera` Enhanced Type (`types/index.ts`)

Add fields to `FilaEspera`:

- `profissionalId` (desired professional)
- `observacoes` (notes)
- `criadoPor` (who added)

### 5. Auto-Slot Logic (`DataContext.tsx`)

Add a function `checkFilaForSlot(profissionalId, unidadeId, data, hora)` that:

- Searches the queue for patients matching the professional/unit
- Returns matching candidates sorted by priority then arrival time
- Provides `encaixarDaFila(filaId, agendamentoData)` to move from queue to appointment

### 6. Configuracoes Improvements (`Configuracoes.tsx`)

- Make WhatsApp settings persist in DataContext state (new `configuracoes` state object)
- Add save functionality for all settings
- Make Google Calendar section show connection status
- Add toggle for auto-slot mode (automatic vs. assisted)

### 7. DataContext Enhancements

- Add `configuracoes` state for system settings (WhatsApp, Google, auto-slot mode)
- Add `cancelAgendamento` function that triggers queue check
- Add `getFilaCandidatos` function for auto-slot suggestions

## Technical Details

### Files to modify:

1. `**src/types/index.ts**` -- Add `profissionalId`, `observacoes`, `criadoPor` to `FilaEspera`; add `Configuracao` interface
2. `**src/contexts/DataContext.tsx**` -- Add configuracoes state, auto-slot functions, fix availability logic
3. `**src/pages/AgendarOnline.tsx**` -- Fix professional filtering (remove `f.unidadeId` constraint)
4. `**src/pages/painel/Disponibilidade.tsx**` -- Improve day selector layout, add flex-wrap, center buttons
5. `**src/pages/painel/FilaEspera.tsx**` -- Complete rewrite with add dialog, filters, auto-slot, edit/remove
6. `**src/pages/painel/Configuracoes.tsx**` -- Wire up settings to state, add save logic
7. `**src/data/mockData.ts**` -- Update mock FilaEspera entries with new fields

### Google Calendar & WhatsApp Note

Real Google Calendar OAuth and WhatsApp API integration require a backend (Supabase/Lovable Cloud) for secure token storage and API calls. The current implementation will prepare the UI and settings infrastructure. To make these integrations functional, you would need to activate Lovable Cloud and create edge functions for the API calls. **Solicitação adicional**

Além das correções propostas, precisamos evoluir o sistema para um ambiente de produção.

Atualmente os dados estão apenas em React state (memória), o que não é adequado para um sistema real de agendamento.

Solicito implementar persistência de dados utilizando Lovable Cloud ou Supabase para armazenar:

- pacientes
- agendamentos
- profissionais
- unidades
- salas
- disponibilidade
- fila de espera
- configurações do sistema

Assim garantimos que:

- os dados não sejam perdidos
- o agendamento público e o painel administrativo estejam sincronizados
- as integrações com Google Agenda e WhatsApp possam funcionar corretamente.