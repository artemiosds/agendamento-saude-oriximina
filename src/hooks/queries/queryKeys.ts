/**
 * Centralized TanStack Query key factory.
 * Ensures consistent cache key usage across all hooks and mutations.
 */
export const queryKeys = {
  // Core entities
  pacientes: {
    all: ['pacientes'] as const,
    detail: (id: string) => ['pacientes', id] as const,
    search: (q: string) => ['pacientes', 'search', q] as const,
    page: (scope: Record<string, string | number | boolean>) => ['pacientes', 'page', scope] as const,
    semUnidade: (scope: Record<string, string | number | boolean>) => ['pacientes', 'sem-unidade', scope] as const,
  },
  agendamentos: {
    all: ['agendamentos'] as const,
    byDate: (date: string) => ['agendamentos', 'date', date] as const,
    byRange: (from: string, to: string) => ['agendamentos', 'range', from, to] as const,
  },
  fila: {
    all: ['fila_espera'] as const,
  },
  atendimentos: {
    all: ['atendimentos'] as const,
  },
  funcionarios: {
    all: ['funcionarios'] as const,
  },
  unidades: {
    all: ['unidades'] as const,
  },
  salas: {
    all: ['salas'] as const,
  },
  disponibilidades: {
    all: ['disponibilidades'] as const,
  },
  bloqueios: {
    all: ['bloqueios'] as const,
  },
  configuracoes: {
    all: ['system_config'] as const,
  },
  prontuarios: {
    all: ['prontuarios'] as const,
    byPaciente: (pacienteId: string) => ['prontuarios', 'paciente', pacienteId] as const,
  },
  procedimentos: {
    all: ['procedimentos'] as const,
  },
  triagem: {
    all: ['triage_records'] as const,
    byAgendamento: (agId: string) => ['triage_records', 'agendamento', agId] as const,
  },
  tratamentos: {
    cycles: ['treatment_cycles'] as const,
    sessions: ['treatment_sessions'] as const,
    extensions: ['treatment_extensions'] as const,
  },
  regulacao: {
    all: ['patient_regulation'] as const,
    evaluations: ['patient_evaluations'] as const,
  },
  pts: {
    all: ['pts'] as const,
  },
  actionLogs: {
    all: ['action_logs'] as const,
  },
  notificationLogs: {
    all: ['notification_logs'] as const,
  },
} as const;
