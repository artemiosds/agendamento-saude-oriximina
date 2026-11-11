import { statusOcupaVaga } from "@/lib/appointmentCapacity";
import { classifyTreatmentCapacitySpecialty, type TreatmentCapacitySpecialty, type CapacityProfessionalInput, type CapacityAvailabilityInput, type CapacityAppointmentInput, type CapacityBlockInput, type PendingTreatmentSessionInput, type QueueDemandInput } from "@/lib/treatmentCapacityAnalytics";
import { calculateExternalCapacity, classifyExternalQuotaForAvailabilities, isQuotaConfigurationUsable, quotaMatchesAvailability, type ExternalQuotaWindow } from "@/lib/externalQuota";
import { isoDayOfWeek } from "@/lib/utils";
import { buildBlockedRanges, generateSessionDatesWithInfo, getMaxWeekdays, isWeekdayFrequency } from "@/lib/treatmentSessionGenerator";

export interface CapacityPlanningProfessionalInput extends CapacityProfessionalInput {
  appointmentDurationMinutes?: number | null;
}

export interface CapacityPlanningAvailabilityInput extends CapacityAvailabilityInput {
  startTime: string;
  endTime: string;
  vacanciesPerHour: number;
}

export interface CapacityPlanningAppointmentInput extends CapacityAppointmentInput {
  origin?: string | null;
}

export interface CapacityPlanningInput {
  today: string;
  endDate: string;
  periodDates: string[];
  professionals: CapacityPlanningProfessionalInput[];
  availabilities: CapacityPlanningAvailabilityInput[];
  appointments: CapacityPlanningAppointmentInput[];
  blocks: CapacityBlockInput[];
  externalQuotas: ExternalQuotaWindow[];
  pendingSessions: PendingTreatmentSessionInput[];
  queueDemand: QueueDemandInput[];
}

export interface CapacityWindow {
  date: string;
  label: string;
  shift: "Manhã" | "Tarde" | "Noite";
  freeAppointments: number;
}

export interface CapacityShiftSummary {
  shift: "Manhã" | "Tarde" | "Noite";
  availableAppointments: number;
}

export interface ProfessionalCapacityPlan {
  professionalId: string;
  unitId: string;
  specialty: TreatmentCapacitySpecialty;
  configuredSlots: number;
  confirmedOccupancy: number;
  projectedTreatmentDemand: number;
  availableForInitialEvaluation: number;
  availableAfterProjectedDemand: number;
  shiftCapacity: CapacityShiftSummary[];
  availableAppointments: number;
  openWindows: number;
  availableDates: number;
  sameDayExternalReserved: number;
  periodQuotaRemaining: number;
  periodQuotaCount: number;
  reviewDays: number;
  blockedDays: number;
  nextWindows: CapacityWindow[];
}

export interface TreatmentDemandSuggestion {
  specialty: TreatmentCapacitySpecialty;
  unitId: string;
  unitName: string;
  unassignedDemand: number;
  oldestWaitDays: number | null;
  professionalId: string | null;
  professionalName: string;
  availableAppointments: number;
  pendingSessions: number;
  residualCapacity: number;
  suggestedForReview: number;
  cboStatus: "compatível" | "incompatível" | "não comparável";
  message: string;
}

export interface TreatmentCapacityPlan {
  professionals: ProfessionalCapacityPlan[];
  suggestions: TreatmentDemandSuggestion[];
}

interface MinuteRange {
  start: number;
  end: number;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

function toMinutes(value: string | null | undefined): number | null {
  const normalized = String(value || "").slice(0, 5);
  const match = normalized.match(TIME_PATTERN);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function toTime(value: number): string {
  const safe = Math.max(0, Math.min(1439, value));
  return String(Math.floor(safe / 60)).padStart(2, "0") + ":" + String(safe % 60).padStart(2, "0");
}

function shiftForMinute(minute: number): "Manhã" | "Tarde" | "Noite" {
  if (minute < 12 * 60) return "Manhã";
  if (minute < 18 * 60) return "Tarde";
  return "Noite";
}

function blockAppliesToProfessional(block: CapacityBlockInput, professionalId: string, unitId: string, date: string): boolean {
  if (date < block.startDate || date > block.endDate) return false;
  const blockUnit = String(block.unitId || "");
  const blockProfessional = String(block.professionalId || "");
  return (!blockUnit && !blockProfessional) ||
    (blockUnit === unitId && !blockProfessional) ||
    blockProfessional === professionalId;
}

function isWholeDayBlock(block: CapacityBlockInput): boolean {
  return block.allDay === true || !block.startTime || !block.endTime;
}

function isSlotBlockedAt(blocks: CapacityBlockInput[], time: number): boolean {
  return blocks.some((block) => {
    if (isWholeDayBlock(block)) return true;
    const start = toMinutes(block.startTime) ?? 0;
    const end = toMinutes(block.endTime) ?? 1439;
    return time >= start && time < end;
  });
}

function overlapping(a: MinuteRange, b: MinuteRange): boolean {
  return a.start < b.end && b.start < a.end;
}

function dateAgeInDays(date: string | null | undefined, today: string): number | null {
  const normalized = String(date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || normalized > today) return null;
  const start = Date.parse(normalized + "T00:00:00Z");
  const end = Date.parse(today + "T00:00:00Z");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - start) / 86400000));
}

function isDemandProjectedWithinPeriod(session: PendingTreatmentSessionInput, endDate: string): boolean {
  // Sessions without a planned date (or with an invalid date) remain backlog.
  // Valid future dates after the selected horizon must not consume current capacity.
  if (!session.scheduledDate) return true;
  const scheduledDate = String(session.scheduledDate).slice(0, 10);
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(scheduledDate)) return true;
  return scheduledDate <= endDate;
}

function scheduleKey(row: CapacityPlanningAvailabilityInput): string {
  return row.startTime.slice(0, 5) + "|" + row.endTime.slice(0, 5);
}

function getDailyPlan(input: CapacityPlanningInput, professional: CapacityPlanningProfessionalInput, date: string) {
  const activeRows = input.availabilities.filter((row) =>
    row.professionalId === professional.id &&
    row.unitId === professional.unitId &&
    date >= row.startDate &&
    date <= row.endDate &&
    row.weekdays.includes(isoDayOfWeek(date)),
  );
  if (activeRows.length === 0) {
    return { freeAppointments: 0, openWindows: 0, reserved: 0, review: false, blocked: false, windows: [] as CapacityWindow[] };
  }

  const quotaWindows = activeRows.map((row) => ({
    profissionalId: professional.id,
    unidadeId: professional.unitId,
    date,
    horaInicio: row.startTime,
    horaFim: row.endTime,
  }));
  const dateQuotas = input.externalQuotas.filter((quota) =>
    quota.ativo &&
    quota.profissional_interno_id === professional.id &&
    quota.unidade_id === professional.unitId &&
    quota.periodo_inicio === date &&
    quota.periodo_fim === date,
  );
  const hasInvalidDateQuota = dateQuotas.some((quota) =>
    classifyExternalQuotaForAvailabilities(quota, date, quotaWindows) === "configuracao_invalida",
  );
  if (hasInvalidDateQuota) {
    return { freeAppointments: 0, openWindows: 0, reserved: 0, review: true, blocked: false, windows: [] as CapacityWindow[] };
  }

  const dateBlocks = input.blocks.filter((block) =>
    blockAppliesToProfessional(block, professional.id, professional.unitId, date),
  );
  if (dateBlocks.some(isWholeDayBlock)) {
    return { freeAppointments: 0, openWindows: 0, reserved: 0, review: false, blocked: true, windows: [] as CapacityWindow[] };
  }

  const parsedRows = activeRows.map((row) => ({
    row,
    start: toMinutes(row.startTime),
    end: toMinutes(row.endTime),
  }));
  const invalid = parsedRows.some(({ row, start, end }) =>
    start === null || end === null || start >= end ||
    row.vacanciesPerDay < 0 || row.vacanciesPerHour < 0,
  );
  if (invalid) {
    return { freeAppointments: 0, openWindows: 0, reserved: 0, review: true, blocked: false, windows: [] as CapacityWindow[] };
  }

  const hourlyRows = parsedRows.filter(({ row }) => row.vacanciesPerHour > 0);
  if (hourlyRows.length > 1) {
    return { freeAppointments: 0, openWindows: 0, reserved: 0, review: true, blocked: false, windows: [] as CapacityWindow[] };
  }

  const overlapIndexes = new Set<number>();
  for (let a = 0; a < parsedRows.length; a++) {
    for (let b = a + 1; b < parsedRows.length; b++) {
      const left = parsedRows[a];
      const right = parsedRows[b];
      if (overlapping(
        { start: left.start as number, end: left.end as number },
        { start: right.start as number, end: right.end as number },
      )) {
        overlapIndexes.add(a);
        overlapIndexes.add(b);
      }
    }
  }

  const dayAppointments = input.appointments.filter((appointment) =>
    appointment.professionalId === professional.id &&
    appointment.unitId === professional.unitId &&
    appointment.date === date &&
    statusOcupaVaga(appointment.status),
  );

  let totalFree = 0;
  let totalOpenWindows = 0;
  let totalReserved = 0;
  let review = overlapIndexes.size > 0;
  const windows: CapacityWindow[] = [];

  for (let index = 0; index < parsedRows.length; index++) {
    if (overlapIndexes.has(index)) continue;

    const { row, start, end } = parsedRows[index];
    if (start === null || end === null) continue;

    const inTurn = dayAppointments.filter((appointment) => {
      const time = toMinutes(appointment.time);
      return time !== null && time >= start && time < end;
    });
    const externalQuotas = dateQuotas.filter((quota) =>
      quotaMatchesAvailability(quota, {
        profissionalId: professional.id,
        unidadeId: professional.unitId,
        date,
        horaInicio: row.startTime,
        horaFim: row.endTime,
      }, activeRows.length),
    );

    const capacityAppointments = row.vacanciesPerHour > 0 ? dayAppointments : inTurn;
    const externalCount = capacityAppointments.filter((appointment) => appointment.origin === "externo").length;
    const internalCount = capacityAppointments.length - externalCount;
    const capacity = calculateExternalCapacity({
      capacidadeTotal: row.vacanciesPerDay,
      reservasConfiguradas: externalQuotas.map((quota) => quota.vagas_total),
      ocupacaoExterna: externalCount,
      ocupacaoInterna: internalCount,
    });
    const requestedReservation = externalQuotas.reduce((sum, quota) =>
      sum + Math.max(0, Number(quota.vagas_total) || 0), 0,
    );
    totalReserved += Math.min(Math.max(0, Number(row.vacanciesPerDay) || 0), requestedReservation);
    if (capacity.conflitoReserva) review = true;
    if (capacity.vagasInternasLivres <= 0) continue;

    if (row.vacanciesPerHour > 0) {
      if (dayAppointments.length >= row.vacanciesPerDay) continue;
      const duration = Math.max(15, Number(professional.appointmentDurationMinutes) || 30);
      const hourCounts = new Map<number, number>();
      const slotCounts = new Map<number, number>();
      for (const appointment of dayAppointments) {
        const appointmentMinute = toMinutes(appointment.time);
        if (appointmentMinute === null) continue;
        const hour = Math.floor(appointmentMinute / 60);
        hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
        slotCounts.set(appointmentMinute, (slotCounts.get(appointmentMinute) || 0) + 1);
      }

      const availableStarts: number[] = [];
      const availableByHour = new Map<number, number>();
      const availableStartsByHour = new Map<number, number>();
      // The live Agenda uses tempo_atendimento and starts at the configured beginning.
      for (let minute = start; minute < end; minute += duration) {
        const hour = Math.floor(minute / 60);
        const hourCount = hourCounts.get(hour) || 0;
        const slotCount = slotCounts.get(minute) || 0;
        if (isSlotBlockedAt(dateBlocks, minute)) continue;
        if (hourCount >= row.vacanciesPerHour || slotCount >= row.vacanciesPerHour) continue;
        availableStarts.push(minute);
        availableStartsByHour.set(hour, (availableStartsByHour.get(hour) || 0) + 1);
        if (!availableByHour.has(hour)) {
          availableByHour.set(hour, Math.max(0, row.vacanciesPerHour - hourCount));
        }
      }

      const hourlyCapacityRemaining = [...availableByHour.entries()].reduce((sum, [hour, remaining]) =>
        sum + Math.min(remaining, availableStartsByHour.get(hour) || 0), 0,
      );
      const freeAppointments = Math.min(capacity.vagasInternasLivres, hourlyCapacityRemaining, availableStarts.length);
      if (freeAppointments <= 0) continue;
      totalFree += freeAppointments;
      totalOpenWindows += availableStarts.length;

      // Split a continuous availability band at morning/afternoon/evening boundaries.
      // This prevents a band crossing noon from being reported as morning-only.
      const startsByShift = new Map<"Manhã" | "Tarde" | "Noite", number[]>();
      for (const minute of availableStarts) {
        const shift = shiftForMinute(minute);
        const starts = startsByShift.get(shift) || [];
        starts.push(minute);
        startsByShift.set(shift, starts);
      }
      let remainingFree = freeAppointments;
      for (const shift of ["Manhã", "Tarde", "Noite"] as const) {
        const starts = startsByShift.get(shift) || [];
        if (!starts.length || remainingFree <= 0) continue;
        const shiftFree = Math.min(starts.length, remainingFree);
        windows.push({
          date,
          label: starts.slice(0, 4).map(toTime).join(", ") + (starts.length > 4 ? "…" : ""),
          shift,
          freeAppointments: shiftFree,
        });
        remainingFree -= shiftFree;
      }
    } else {
      if (inTurn.length >= row.vacanciesPerDay || isSlotBlockedAt(dateBlocks, start)) continue;
      totalFree += capacity.vagasInternasLivres;
      totalOpenWindows += 1;
      windows.push({
        date,
        label: row.startTime.slice(0, 5),
        shift: shiftForMinute(start),
        freeAppointments: capacity.vagasInternasLivres,
      });
    }
  }

  return {
    freeAppointments: totalFree,
    openWindows: totalOpenWindows,
    reserved: totalReserved,
    review,
    blocked: false,
    windows,
  };
}

export function buildTreatmentCapacityPlan(input: CapacityPlanningInput): TreatmentCapacityPlan {
  const professionals: ProfessionalCapacityPlan[] = input.professionals.flatMap((professional) => {
    const specialty = classifyTreatmentCapacitySpecialty(professional.profession);
    if (!specialty) return [];

    let availableAppointments = 0;
    let openWindows = 0;
    let sameDayExternalReserved = 0;
    let reviewDays = 0;
    let blockedDays = 0;
    let configuredSlots = 0;
    const availableDates = new Set<string>();
    const nextWindows: CapacityWindow[] = [];
    const shiftTotals = new Map<"Manhã" | "Tarde" | "Noite", number>();

    for (const date of input.periodDates) {
      const dayRows = input.availabilities.filter((row) =>
        row.professionalId === professional.id &&
        row.unitId === professional.unitId &&
        date >= row.startDate &&
        date <= row.endDate &&
        row.weekdays.includes(isoDayOfWeek(date)),
      );
      configuredSlots += dayRows.reduce((sum, row) =>
        sum + Math.max(0, Number(row.vacanciesPerDay) || 0), 0);

      const day = getDailyPlan(input, professional, date);
      availableAppointments += day.freeAppointments;
      openWindows += day.openWindows;
      sameDayExternalReserved += day.reserved;
      if (day.review) reviewDays += 1;
      if (day.blocked) blockedDays += 1;
      if (day.freeAppointments > 0) availableDates.add(date);
      for (const window of day.windows) {
        shiftTotals.set(window.shift, (shiftTotals.get(window.shift) || 0) + window.freeAppointments);
        if (nextWindows.length < 8) nextWindows.push(window);
      }
    }

    const projectedTreatmentDemand = input.pendingSessions.filter((session) =>
      session.professionalId === professional.id &&
      session.unitId === professional.unitId &&
      session.status === "pendente_agendamento" &&
      !session.appointmentId &&
      isDemandProjectedWithinPeriod(session, input.endDate),
    ).length;
    const confirmedOccupancy = input.appointments.filter((appointment) =>
      appointment.professionalId === professional.id &&
      appointment.unitId === professional.unitId &&
      input.periodDates.includes(appointment.date) &&
      statusOcupaVaga(appointment.status),
    ).length;
    const availableAfterProjectedDemand = Math.max(0, availableAppointments - projectedTreatmentDemand);

    const periodQuotas = input.externalQuotas.filter((quota) =>
      quota.profissional_interno_id === professional.id &&
      quota.unidade_id === professional.unitId &&
      quota.ativo &&
      quota.periodo_inicio < quota.periodo_fim &&
      quota.periodo_inicio <= input.endDate &&
      quota.periodo_fim >= input.today &&
      isQuotaConfigurationUsable(quota),
    );
    const periodQuotaRemaining = periodQuotas.reduce((sum, quota) =>
      sum + Math.max(0, Number(quota.vagas_total) - Number(quota.vagas_usadas)), 0);

    const shiftCapacity: CapacityShiftSummary[] = (["Manhã", "Tarde", "Noite"] as const)
      .map((shift) => ({ shift, availableAppointments: shiftTotals.get(shift) || 0 }))
      .filter((row) => row.availableAppointments > 0);

    return [{
      professionalId: professional.id,
      unitId: professional.unitId,
      specialty,
      configuredSlots,
      confirmedOccupancy,
      projectedTreatmentDemand,
      availableForInitialEvaluation: availableAfterProjectedDemand,
      availableAfterProjectedDemand,
      shiftCapacity,
      availableAppointments,
      openWindows,
      availableDates: availableDates.size,
      sameDayExternalReserved,
      periodQuotaRemaining,
      periodQuotaCount: periodQuotas.length,
      reviewDays,
      blockedDays,
      nextWindows,
    }];
  });

  const pendingByProfessional = new Map<string, number>();
  input.pendingSessions.forEach((session) => {
    if (
      session.status !== "pendente_agendamento" ||
      session.appointmentId ||
      !isDemandProjectedWithinPeriod(session, input.endDate)
    ) return;
    const key = session.professionalId + "|" + session.unitId;
    pendingByProfessional.set(key, (pendingByProfessional.get(key) || 0) + 1);
  });

  const demandGroups = new Map<string, {
    specialty: TreatmentCapacitySpecialty;
    unitId: string;
    unitName: string;
    cboCode: string | null;
    rows: QueueDemandInput[];
  }>();
  for (const row of input.queueDemand) {
    const specialty = classifyTreatmentCapacitySpecialty(row.destinationProfession || "") ||
      classifyTreatmentCapacitySpecialty(row.sector || "");
    if (!specialty) continue;
    const cboCode = row.cboCode?.trim().toUpperCase() || null;
    const key = row.unitId + "|" + specialty + "|" + (cboCode || "sem-cbo");
    const current = demandGroups.get(key) || {
      specialty,
      unitId: row.unitId,
      unitName: input.professionals.find((professional) =>
        professional.unitId === row.unitId &&
        classifyTreatmentCapacitySpecialty(professional.profession) === specialty,
      )?.unitName || row.unitId,
      cboCode,
      rows: [],
    };
    current.rows.push(row);
    demandGroups.set(key, current);
  }

  const suggestions: TreatmentDemandSuggestion[] = [];
  for (const group of demandGroups.values()) {
    const unassigned = group.rows.filter((row) => !row.professionalId);
    if (unassigned.length === 0) continue;
    const oldestAges = unassigned
      .map((row) => dateAgeInDays(row.requestDate, input.today))
      .filter((age): age is number => age !== null);
    const oldestWaitDays = oldestAges.length ? Math.max(...oldestAges) : null;
    const candidates = professionals
      .filter((plan) => {
        if (plan.unitId !== group.unitId || plan.specialty !== group.specialty) return false;
        if (!group.cboCode) return true;
        const professional = input.professionals.find((candidate) =>
          candidate.id === plan.professionalId && candidate.unitId === plan.unitId,
        );
        return professional?.cboCode?.trim().toUpperCase() === group.cboCode;
      })
      .map((plan) => {
        const base = input.professionals.find((professional) =>
          professional.id === plan.professionalId && professional.unitId === plan.unitId,
        );
        const pendingSessions = pendingByProfessional.get(plan.professionalId + "|" + plan.unitId) || 0;
        return {
          plan,
          name: base?.name || "Profissional sem nome",
          pendingSessions,
          residualCapacity: Math.max(0, plan.availableAppointments - pendingSessions),
        };
      })
      .sort((a, b) =>
        b.residualCapacity - a.residualCapacity ||
        b.plan.availableAppointments - a.plan.availableAppointments ||
        a.name.localeCompare(b.name, "pt-BR"),
      )
      .slice(0, 3);

    if (candidates.length === 0 || candidates.every((candidate) => candidate.residualCapacity === 0)) {
      const specialtyProfessionals = input.professionals.filter((professional) =>
        professional.unitId === group.unitId &&
        classifyTreatmentCapacitySpecialty(professional.profession) === group.specialty,
      );
      const confirmedCboMismatch = !!group.cboCode &&
        specialtyProfessionals.length > 0 &&
        specialtyProfessionals.every((professional) =>
          !!professional.cboCode?.trim() &&
          professional.cboCode.trim().toUpperCase() !== group.cboCode,
        );
      suggestions.push({
        specialty: group.specialty,
        unitId: group.unitId,
        unitName: group.unitName,
        unassignedDemand: unassigned.length,
        oldestWaitDays,
        professionalId: null,
        professionalName: candidates.length === 0 ? "Nenhum profissional compatível" : "Sem capacidade residual no período",
        availableAppointments: 0,
        pendingSessions: 0,
        residualCapacity: 0,
        suggestedForReview: 0,
        cboStatus: candidates.length > 0 ? "compatível" : confirmedCboMismatch ? "incompatível" : "não comparável",
        message: candidates.length === 0
          ? confirmedCboMismatch
            ? "Incompatível: todos os profissionais ativos encontrados nesta unidade e especialidade possuem CBO diferente do destino informado."
            : group.cboCode
              ? "Compatibilidade não confirmável: não há CBO completo em todos os profissionais disponíveis para comparação."
              : "Nenhum profissional candidato foi encontrado para esta especialidade e unidade."
          : "Os profissionais com compatibilidade registrada não possuem capacidade residual após considerar as sessões pendentes. Avaliar a grade sem alterar a fila.",
      });
      continue;
    }

    let remainingDemand = unassigned.length;
    for (const candidate of candidates) {
      const suggestedForReview = Math.min(remainingDemand, candidate.residualCapacity);
      remainingDemand = Math.max(0, remainingDemand - suggestedForReview);
      suggestions.push({
        specialty: group.specialty,
        unitId: group.unitId,
        unitName: group.unitName,
        unassignedDemand: unassigned.length,
        oldestWaitDays,
        professionalId: candidate.plan.professionalId,
        professionalName: candidate.name,
        availableAppointments: candidate.plan.availableAppointments,
        pendingSessions: candidate.pendingSessions,
        residualCapacity: candidate.residualCapacity,
        suggestedForReview,
        cboStatus: group.cboCode ? "compatível" : "não comparável",
        message: candidate.residualCapacity > 0
          ? group.cboCode
            ? "Candidato para avaliação da equipe, com CBO de destino explícito e correspondente ao CBO do profissional. Não representa atribuição ou agendamento."
            : "Candidato para avaliação da equipe, considerando capacidade livre após as sessões pendentes. CBO de destino não registrado: compatibilidade não comparável. Não representa atribuição ou agendamento."
          : "Sem capacidade residual após as sessões pendentes; avaliar a grade sem alterar a fila.",
      });
    }
  }

  return { professionals, suggestions };
}


export type TreatmentCycleShiftFilter = "qualquer" | "Manhã" | "Tarde" | "Noite";
export type TreatmentCycleFeasibilityStatus = "confirmável" | "insuficiente" | "revisão" | "inválido";

export interface TreatmentCycleFeasibilityInput extends CapacityPlanningInput {
  professionalId: string;
  unitId: string;
  startDate: string;
  frequency: string;
  weekdays: number[];
  totalSessions: number;
  shift?: TreatmentCycleShiftFilter;
}

export interface TreatmentCycleFeasibilityDate {
  date: string;
  shiftLabels: string[];
  availableAppointmentsAfterDemand: number;
  projectedSessionsOnDate: number;
}

export interface TreatmentCycleFeasibilityResult {
  status: TreatmentCycleFeasibilityStatus;
  requestedSessions: number;
  feasibleSessions: number;
  dates: TreatmentCycleFeasibilityDate[];
  skippedDates: number;
  unresolvedSessions: number;
  horizonEndDate: string;
  message: string;
}

/**
 * Read-only simulation of a complete treatment plan. It reuses the date rules
 * of Tratamentos and the same daily capacity logic as this planning engine.
 * It never reserves an appointment or writes a treatment cycle.
 */
export function buildTreatmentCycleFeasibility(
  input: TreatmentCycleFeasibilityInput,
): TreatmentCycleFeasibilityResult {
  const shift = input.shift || "qualquer";
  const invalid = (message: string): TreatmentCycleFeasibilityResult => ({
    status: "inválido",
    requestedSessions: Number(input.totalSessions) || 0,
    feasibleSessions: 0,
    dates: [],
    skippedDates: 0,
    unresolvedSessions: 0,
    horizonEndDate: input.endDate,
    message,
  });

  if (!input.professionalId || !input.unitId) return invalid("Selecione um profissional e uma unidade.");
  if (!Number.isInteger(input.totalSessions) || input.totalSessions < 1 || input.totalSessions > 200) {
    return invalid("Informe entre 1 e 200 sessões para a simulação.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) ||
      input.startDate < input.today ||
      input.startDate > input.endDate ||
      !Number.isFinite(new Date(input.startDate + "T12:00:00").getTime())) {
    return invalid("A data inicial deve estar entre hoje e o fim da janela de análise.");
  }
  if (isWeekdayFrequency(input.frequency) &&
      input.weekdays.length !== getMaxWeekdays(input.frequency)) {
    return invalid("Selecione exatamente a quantidade de dias exigida pela frequência.");
  }
  if (shift !== "qualquer" && shift !== "Manhã" && shift !== "Tarde" && shift !== "Noite") {
    return invalid("Turno de preferência inválido.");
  }

  const professional = input.professionals.find((row) =>
    row.id === input.professionalId && row.unitId === input.unitId,
  );
  if (!professional) return invalid("O profissional selecionado não está disponível no escopo atual.");

  const relevantPending = input.pendingSessions.filter((session) =>
    session.professionalId === input.professionalId &&
    session.unitId === input.unitId &&
    session.status === "pendente_agendamento" &&
    !session.appointmentId,
  );
  const unresolvedSessions = relevantPending.filter((session) =>
    !session.scheduledDate || session.scheduledDate < input.today,
  ).length;

  if (unresolvedSessions > 0) {
    return {
      status: "revisão",
      requestedSessions: input.totalSessions,
      feasibleSessions: 0,
      dates: [],
      skippedDates: 0,
      unresolvedSessions,
      horizonEndDate: input.endDate,
      message: unresolvedSessions + " sessão(ões) pendente(s) sem data futura válida. Organize essa demanda antes de confirmar a capacidade de um novo ciclo completo.",
    };
  }

  const pendingByDate = new Map<string, number>();
  relevantPending.forEach((session) => {
    const date = session.scheduledDate;
    if (!date || date < input.today || date > input.endDate) return;
    pendingByDate.set(date, (pendingByDate.get(date) || 0) + 1);
  });

  const availableDates = new Set<string>();
  const windowsByDate = new Map<string, CapacityWindow[]>();
  const reviewDates = new Set<string>();

  for (const date of input.periodDates) {
    if (date < input.startDate || date > input.endDate) continue;
    const day = getDailyPlan(input, professional, date);
    if (day.review) {
      reviewDates.add(date);
      continue;
    }
    const windows = day.windows.filter((window) =>
      shift === "qualquer" || window.shift === shift,
    );
    const rawCapacity = windows.reduce((sum, window) => sum + window.freeAppointments, 0);
    const projectedOnDate = pendingByDate.get(date) || 0;

    if (shift !== "qualquer" && projectedOnDate > 0) {
      reviewDates.add(date);
      continue;
    }
    if (rawCapacity - projectedOnDate > 0) {
      availableDates.add(date);
      windowsByDate.set(date, windows);
    }
  }

  const blockedRanges = buildBlockedRanges(
    input.blocks.map((block) => ({
      dataInicio: block.startDate,
      dataFim: block.endDate,
      unidadeId: block.unitId || "",
      profissionalId: block.professionalId || "",
      diaInteiro: block.allDay,
      horaInicio: block.startTime || "",
      horaFim: block.endTime || "",
    })),
    input.professionalId,
    input.unitId,
  );

  try {
    const generated = generateSessionDatesWithInfo(
      input.startDate,
      input.frequency,
      input.weekdays,
      input.totalSessions,
      blockedRanges,
      availableDates,
    );

    const plannedDates: TreatmentCycleFeasibilityDate[] = generated.dates.map((date) => {
      const windows = windowsByDate.get(date) || [];
      const projectedSessionsOnDate = pendingByDate.get(date) || 0;
      const rawCapacity = windows.reduce((sum, window) => sum + window.freeAppointments, 0);
      return {
        date,
        shiftLabels: windows.map((window) => window.shift + " · " + window.label),
        availableAppointmentsAfterDemand: Math.max(0, rawCapacity - projectedSessionsOnDate),
        projectedSessionsOnDate,
      };
    });

    return {
      status: "confirmável",
      requestedSessions: input.totalSessions,
      feasibleSessions: plannedDates.length,
      dates: plannedDates,
      skippedDates: generated.skippedCount,
      unresolvedSessions: 0,
      horizonEndDate: input.endDate,
      message: "As " + plannedDates.length + " sessões encontraram capacidade diária na janela consultada. Isso confirma espaço projetado por data e turno, não reserva horários. A recepção ainda deve escolher e confirmar cada horário na Agenda.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível completar a simulação.";
    const hasReview = reviewDates.size > 0;
    return {
      status: hasReview ? "revisão" : "insuficiente",
      requestedSessions: input.totalSessions,
      feasibleSessions: 0,
      dates: [],
      skippedDates: 0,
      unresolvedSessions: 0,
      horizonEndDate: input.endDate,
      message: hasReview
        ? "A análise encontrou " + reviewDates.size + " dia(s) com grade ambígua ou configuração que exige revisão. Não é seguro confirmar o ciclo completo. " + message
        : "Não há datas/turnos suficientes para acomodar todas as " + input.totalSessions + " sessões até " + input.endDate.split("-").reverse().join("/") + ". " + message,
    };
  }
}
