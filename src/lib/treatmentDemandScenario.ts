import type { TreatmentCapacitySpecialty } from "./treatmentCapacityAnalytics";

export type DemandAgeCohort = "0_7" | "8_30" | "31_90" | "over_90" | "without_date";

export interface TreatmentDemandScenarioGroupInput {
  unitId: string;
  unitName: string;
  specialty: TreatmentCapacitySpecialty;
  availableAppointments: number;
  pendingSessions: number;
  requestDates: Array<string | null | undefined>;
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
  simulatedSlotsPerWeek: number;
  baselineWeeksToClear: number | null;
  simulatedWeeksToClear: number | null;
  estimatedDaysReduced: number | null;
}

function requestAgeInDays(date: string | null | undefined, today: string): number | null {
  const normalized = String(date || "").slice(0, 10);
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(normalized) || normalized > today) return null;
  const parsed = new Date(normalized + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) return null;
  const end = new Date(today + "T00:00:00.000Z");
  if (!Number.isFinite(end.getTime()) || end.toISOString().slice(0, 10) !== today) return null;
  return Math.max(0, Math.floor((end.getTime() - parsed.getTime()) / 86400000));
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
  const additionalSlotsPerWeek = Math.max(
    0,
    Math.min(1000, Math.floor(Number(input.additionalSlotsPerWeek) || 0)),
  );

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
        simulatedSlotsPerWeek,
        baselineWeeksToClear,
        simulatedWeeksToClear,
        estimatedDaysReduced: baselineWeeksToClear !== null && simulatedWeeksToClear !== null
          ? Math.max(0, (baselineWeeksToClear - simulatedWeeksToClear) * 7)
          : null,
      };
    })
    .filter((row) => row.backlog > 0)
    .sort((a, b) =>
      b.backlog - a.backlog ||
      a.unitName.localeCompare(b.unitName, "pt-BR") ||
      a.specialty.localeCompare(b.specialty, "pt-BR"),
    );
}
