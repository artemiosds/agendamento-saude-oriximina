export interface ExternalQuotaWindow {
  id?: string;
  profissional_interno_id?: string;
  unidade_id: string;
  periodo_inicio: string;
  periodo_fim: string;
  turno?: string | null;
  horario_inicio?: string | null;
  horario_fim?: string | null;
  dia_semana?: number | null;
  ativo: boolean;
  vagas_total: number;
  vagas_usadas: number;
}

export type ExternalQuotaClassification =
  | 'reserva_data_especifica'
  | 'limite_periodo'
  | 'configuracao_invalida';

export interface AvailabilityWindow {
  profissionalId: string;
  unidadeId: string;
  date: string;
  horaInicio: string;
  horaFim: string;
}

const VALID_TURNS = new Set(['manha', 'tarde', 'noite', 'integral', 'personalizado']);

export function hasValidQuotaStructure(q: ExternalQuotaWindow): boolean {
  return Boolean(
    q.ativo && q.unidade_id?.trim() && q.profissional_interno_id?.trim() &&
    q.periodo_inicio && q.periodo_fim && q.periodo_inicio <= q.periodo_fim &&
    q.turno && VALID_TURNS.has(q.turno) && q.vagas_total > 0 &&
    q.vagas_usadas >= 0 && q.vagas_usadas <= q.vagas_total &&
    (q.turno === 'integral' ||
      (q.horario_inicio && q.horario_fim && q.horario_inicio < q.horario_fim))
  );
}

export function classifyExternalQuota(
  q: ExternalQuotaWindow,
  date?: string,
): ExternalQuotaClassification {
  if (!hasValidQuotaStructure(q)) return 'configuracao_invalida';
  if (date && (date < q.periodo_inicio || date > q.periodo_fim)) return 'configuracao_invalida';
  return q.periodo_inicio === q.periodo_fim
    ? 'reserva_data_especifica'
    : 'limite_periodo';
}

export function quotaMatchesAvailability(
  q: ExternalQuotaWindow,
  availability: AvailabilityWindow,
  availabilityCountForDay: number,
): boolean {
  if (classifyExternalQuota(q, availability.date) !== 'reserva_data_especifica') return false;
  if (q.profissional_interno_id !== availability.profissionalId || q.unidade_id !== availability.unidadeId) return false;
  if (q.dia_semana != null && q.dia_semana !== new Date(`${availability.date}T12:00:00`).getDay()) return false;
  // Uma cota integral só é inequívoca quando há uma única faixa de disponibilidade no dia.
  if (q.turno === 'integral') return availabilityCountForDay === 1;
  return q.horario_inicio?.slice(0, 5) === availability.horaInicio.slice(0, 5)
    && q.horario_fim?.slice(0, 5) === availability.horaFim.slice(0, 5);
}

export function classifyExternalQuotaForAvailabilities(
  q: ExternalQuotaWindow,
  date: string,
  availabilities: AvailabilityWindow[],
): ExternalQuotaClassification {
  const classification = classifyExternalQuota(q, date);
  if (classification !== 'reserva_data_especifica') return classification;
  const sameProfessionalUnitDay = availabilities.filter((availability) =>
    availability.profissionalId === q.profissional_interno_id
      && availability.unidadeId === q.unidade_id
      && availability.date === date,
  );
  return sameProfessionalUnitDay.some((availability) =>
    quotaMatchesAvailability(q, availability, sameProfessionalUnitDay.length),
  ) ? classification : 'configuracao_invalida';
}

export interface ExternalCapacityInput {
  capacidadeTotal: number;
  reservasConfiguradas: number[];
  ocupacaoExterna: number;
  ocupacaoInterna: number;
}

export function calculateExternalCapacity(input: ExternalCapacityInput) {
  const capacidadeTotal = Math.max(0, input.capacidadeTotal);
  const reservaSolicitada = input.reservasConfiguradas.reduce((sum, value) => sum + Math.max(0, value), 0);
  const reservaExternaConfigurada = Math.min(capacidadeTotal, reservaSolicitada);
  const ocupacaoExterna = Math.max(0, input.ocupacaoExterna);
  const ocupacaoInterna = Math.max(0, input.ocupacaoInterna);
  const reservaExternaRestante = Math.max(0, reservaExternaConfigurada - ocupacaoExterna);
  const capacidadeInterna = Math.max(0, capacidadeTotal - reservaExternaConfigurada);
  const vagasInternasLivres = Math.max(0, capacidadeInterna - ocupacaoInterna);
  const vagasTotaisLivres = Math.max(0, capacidadeTotal - ocupacaoInterna - ocupacaoExterna);
  return {
    capacidadeTotal,
    reservaSolicitada,
    reservaExternaConfigurada,
    reservaExternaRestante,
    ocupacaoExterna,
    ocupacaoInterna,
    capacidadeInterna,
    vagasInternasLivres,
    vagasTotaisLivres,
    conflitoReserva: reservaSolicitada > capacidadeTotal,
  };
}

export function isQuotaConfigurationUsable(q: ExternalQuotaWindow): boolean {
  return hasValidQuotaStructure(q);
}

export function quotaAllowsSlot(q: ExternalQuotaWindow, unidadeId: string, date: string, hour?: string): boolean {
  if (!q.ativo || !isQuotaConfigurationUsable(q) || q.unidade_id !== unidadeId ||
      date < q.periodo_inicio || date > q.periodo_fim || q.vagas_usadas >= q.vagas_total) return false;
  const dayOfWeek = new Date(`${date}T12:00:00`).getDay();
  if (q.dia_semana != null && q.dia_semana !== dayOfWeek) return false;
  return !hour || q.turno === 'integral' ||
    (hour >= q.horario_inicio!.slice(0, 5) && hour < q.horario_fim!.slice(0, 5));
}
