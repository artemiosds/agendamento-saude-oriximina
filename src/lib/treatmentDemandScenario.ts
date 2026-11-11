import type { TreatmentCapacitySpecialty } from "./treatmentCapacityAnalytics";

export type DemandAgeCohort = "0_7" | "8_30" | "31_90" | "over_90" | "without_date";
export type DemandManagementStatus =
  | "priority_wait"
  | "capacity_bottleneck"
  | "demand_above_capacity"
  | "capacity_above_unassigned_backlog"
  | "balanced";

export interface TreatmentDemandScenarioGroupInput {
  unitId: string;
  unitName: string;
  specialty: TreatmentCapacitySpecialty;
  availableAppointments: number;
  pendingSessions: number;
  requestDates: Array<string | null | undefined>;
  additionalSlotsPerWeek?: number;
}

export interface TreatmentDemandScenarioInput {
  today: string;
  periodDays: number;
  additionalSlotsPerWeek: number;
  groups: TreatmentDemandScenarioGroupInput[];
}

export interface TreatmentDemandScenarioResult {
  unitId: string;
  unitName: string;
  specialty: TreatmentCapacitySpecialty;
  backlog: number;
  datedRequests: number;
  withoutDate: number;
  cohort0To7: number;
  cohort8To30: number;
  cohort31To90: number;
  cohortOver90: number;
  availableAppointments: number;
  pendingSessions: number;
  netPeriodCapacity: number;
  baselineSlotsPerWeek: number;
  additionalSlotsPerWeek: number;
  simulatedSlotsPerWeek: number;
  baselineWeeksToClear: number | null;
  simulatedWeeksToClear: number | null;
  estimatedDaysReduced: number | null;
  demandAboveCapacity: number;
  capacityBeyondUnassignedBacklog: number;
  managementStatus: DemandManagementStatus;
  managementNote: string;
}

function requestAgeInDays(date: string | null | undefined, today: string): number | null {
  const normalized = String(date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || normalized > today) return null;
  const parsed = new Date(normalized + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) return null;
  const end = new Date(today + "T00:00:00.000Z");
  if (!Number.isFinite(end.getTime()) || end.toISOString().slice(0, 10) !== today) return null;
  return Math.max(0, Math.floor((end.getTime() - parsed.getTime()) / 86400000));
}

function normalizeAdditionalSlots(value: number | undefined, fallback: number): number {
  const candidate = value === undefined ? fallback : value;
  return Math.max(0, Math.min(1000, Math.floor(Number(candidate) || 0)));
}

/**
 * Simula o prazo de absorção do estoque atual de solicitações sem profissional.
 * Não prevê novas entradas e não altera fila, agenda ou banco de dados.
 */
export function buildTreatmentDemandScenario(
  input: TreatmentDemandScenarioInput,
): TreatmentDemandScenarioResult[] {
  const periodDays = Math.max(1, Number.isFinite(input.periodDays) ? input.periodDays : 1);
  const weeksInPeriod = periodDays / 7;
  const defaultAdditionalSlots = normalizeAdditionalSlots(input.additionalSlotsPerWeek, 0);

  return input.groups
    .map((group) => {
      let withoutDate = 0;
      let cohort0To7 = 0;
      let cohort8To30 = 0;
      let cohort31To90 = 0;
      let cohortOver90 = 0;

      for (const requestDate of group.requestDates) {
        const age = requestAgeInDays(requestDate, input.today);
        if (age === null) {
          withoutDate += 1;
        } else if (age <= 7) {
          cohort0To7 += 1;
        } else if (age <= 30) {
          cohort8To30 += 1;
        } else if (age <= 90) {
          cohort31To90 += 1;
        } else {
          cohortOver90 += 1;
        }
      }

      const backlog = group.requestDates.length;
      const availableAppointments = Math.max(0, Number(group.availableAppointments) || 0);
      const pendingSessions = Math.max(0, Number(group.pendingSessions) || 0);
      const netPeriodCapacity = Math.max(0, availableAppointments - pendingSessions);
      const baselineSlotsPerWeek = netPeriodCapacity / weeksInPeriod;
      const additionalSlotsPerWeek = normalizeAdditionalSlots(group.additionalSlotsPerWeek, defaultAdditionalSlots);
      const simulatedSlotsPerWeek = baselineSlotsPerWeek + additionalSlotsPerWeek;
      const baselineWeeksToClear = backlog === 0
        ? 0
        : baselineSlotsPerWeek > 0
          ? backlog / baselineSlotsPerWeek
          : null;
      const simulatedWeeksToClear = backlog === 0
        ? 0
        : simulatedSlotsPerWeek > 0
          ? backlog / simulatedSlotsPerWeek
          : null;
      const demandAboveCapacity = Math.max(0, backlog - netPeriodCapacity);
      const capacityBeyondUnassignedBacklog = Math.max(0, netPeriodCapacity - backlog);

      let managementStatus: DemandManagementStatus = "balanced";
      let managementNote = "A capacidade estimada e a fila sem profissional estão próximas. Acompanhar a evolução da demanda.";
      if (cohortOver90 > 0) {
        managementStatus = "priority_wait";
        managementNote = "Atenção prioritária: existem " + cohortOver90 + " solicitação(ões) com espera superior a 90 dias. Revisar os casos e a programação com a equipe responsável.";
      } else if (netPeriodCapacity === 0 && backlog > 0) {
        managementStatus = "capacity_bottleneck";
        managementNote = "Gargalo de capacidade: não há capacidade livre estimada após as sessões pendentes. Avaliar ampliação de oferta e consistência da grade.";
      } else if (demandAboveCapacity > 0) {
        managementStatus = "demand_above_capacity";
        managementNote = "A fila sem profissional supera a capacidade livre estimada no período. Avaliar vagas adicionais, sem remanejar pacientes automaticamente.";
      } else if (capacityBeyondUnassignedBacklog > 0) {
        managementStatus = "capacity_above_unassigned_backlog";
        managementNote = "A capacidade estimada supera a fila sem profissional. Conferir demandas já direcionadas e outras obrigações antes de concluir que existe ociosidade.";
      }

      return {
        unitId: group.unitId,
        unitName: group.unitName,
        specialty: group.specialty,
        backlog,
        datedRequests: backlog - withoutDate,
        withoutDate,
        cohort0To7,
        cohort8To30,
        cohort31To90,
        cohortOver90,
        availableAppointments,
        pendingSessions,
        netPeriodCapacity,
        baselineSlotsPerWeek,
        additionalSlotsPerWeek,
        simulatedSlotsPerWeek,
        baselineWeeksToClear,
        simulatedWeeksToClear,
        estimatedDaysReduced: baselineWeeksToClear !== null && simulatedWeeksToClear !== null
          ? Math.max(0, (baselineWeeksToClear - simulatedWeeksToClear) * 7)
          : null,
        demandAboveCapacity,
        capacityBeyondUnassignedBacklog,
        managementStatus,
        managementNote,
      };
    })
    .filter((row) => row.backlog > 0)
    .sort((a, b) =>
      b.cohortOver90 - a.cohortOver90 ||
      b.demandAboveCapacity - a.demandAboveCapacity ||
      b.backlog - a.backlog ||
      a.unitName.localeCompare(b.unitName, "pt-BR") ||
      a.specialty.localeCompare(b.specialty, "pt-BR"),
    );
}
