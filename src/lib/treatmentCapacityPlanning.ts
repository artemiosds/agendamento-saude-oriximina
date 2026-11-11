import { statusOcupaVaga } from "@/lib/appointmentCapacity";
import { classifyTreatmentCapacitySpecialty, type CapacityProfessionalInput, type CapacityAvailabilityInput, type CapacityAppointmentInput, type CapacityBlockInput, type PendingTreatmentSessionInput, type QueueDemandInput } from "@/lib/treatmentCapacityAnalytics";
import { classifyExternalQuotaForAvailabilities, isQuotaConfigurationUsable, quotaMatchesAvailability, type ExternalQuotaWindow } from "@/lib/externalQuota";
import { isoDayOfWeek } from "@/lib/utils";

export interface CapacityPlanningAvailabilityInput extends CapacityAvailabilityInput {
  startTime: string;
  endTime: string;
  vacanciesPerHour: number;
  durationMinutes?: number | null;
}

export interface CapacityPlanningAppointmentInput extends CapacityAppointmentInput {
  origin?: string | null;
}

export interface CapacityPlanningInput {
  today: string;
  nowTime?: string | null;
  endDate: string;
  periodDates: string[];
  professionals: CapacityProfessionalInput[];
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
  freeAppointments: number;
}

export interface ProfessionalCapacityPlan {
  professionalId: string;
  unitId: string;
  specialty: "Fisioterapia" | "Fonoaudiologia";
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
  specialty: "Fisioterapia" | "Fonoaudiologia";
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
  cboStatus: "não comparável";
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

function overlapping(a: MinuteRange, b: MinuteRange): boolean {
  return a.start < b.end && b.start < a.end;
}

function subtractBlockedRanges(start: number, end: number, blocks: CapacityBlockInput[], date: string): MinuteRange[] {
  const cuts = blocks
    .filter((block) => date >= block.startDate && date <= block.endDate && !isWholeDayBlock(block))
    .map((block) => ({
      start: toMinutes(block.startTime) ?? start,
      end: toMinutes(block.endTime) ?? end,
    }))
    .map((range) => ({ start: Math.max(start, range.start), end: Math.min(end, range.end) }))
    .filter((range) => range.start < range.end)
    .sort((a, b) => a.start - b.start);

  const merged: MinuteRange[] = [];
  for (const range of cuts) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }

  const free: MinuteRange[] = [];
  let cursor = start;
  for (const range of merged) {
    if (range.start > cursor) free.push({ start: cursor, end: range.start });
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < end) free.push({ start: cursor, end });
  return free;
}

function dateAgeInDays(date: string | null | undefined, today: string): number | null {
  const normalized = String(date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || normalized > today) return null;
  const start = Date.parse(normalized + "T00:00:00Z");
  const end = Date.parse(today + "T00:00:00Z");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - start) / 86400000));
}

function scheduleKey(row: CapacityPlanningAvailabilityInput): string {
  return row.startTime.slice(0, 5) + "|" + row.endTime.slice(0, 5);
}

function getDailyPlan(input: CapacityPlanningInput, professional: CapacityProfessionalInput, date: string) {
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
    row.vacanciesPerDay < 0 || row.vacanciesPerHour < 0 ||
    (row.vacanciesPerHour > 0 && Number(row.durationMinutes ?? 30) <= 0),
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
  const now = date === input.today ? toMinutes(input.nowTime) : null;

  for (let index = 0; index < parsedRows.length; index++) {
    if (overlapIndexes.has(index)) continue;

    const { row, start, end } = parsedRows[index];
    if (start === null || end === null) continue;

    const inTurn = dayAppointments.filter((appointment) => {
      const time = toMinutes(appointment.time);
      return time !== null && time >= start && time < end;
    });
    // The official internal capacity check counts the whole day for hourly availability,
    // but only the selected shift for a turn-based availability.
    const capacityAppointments = row.vacanciesPerHour > 0 ? dayAppointments : inTurn;
    const externalAppointments = capacityAppointments.filter((appointment) => appointment.origin === "externo").length;
    const internalAppointments = capacityAppointments.length - externalAppointments;
    const sameDayQuotas = input.externalQuotas.filter((quota) =>
      quota.periodo_inicio === date &&
      quota.periodo_fim === date &&
      quotaMatchesAvailability(quota, {
        profissionalId: professional.id,
        unidadeId: professional.unitId,
        date,
        horaInicio: row.startTime,
        horaFim: row.endTime,
      }, activeRows.length),
    );
    const requestedReservation = sameDayQuotas.reduce((sum, quota) => sum + Math.max(0, Number(quota.vagas_total) || 0), 0);
    const reserved = Math.min(Math.max(0, Number(row.vacanciesPerDay) || 0), requestedReservation);
    totalReserved += reserved;
    if (requestedReservation > row.vacanciesPerDay) review = true;

    const dailyInternalRemaining = Math.max(0, row.vacanciesPerDay - reserved - internalAppointments);
    const dailyTotalRemaining = Math.max(0, row.vacanciesPerDay - internalAppointments - externalAppointments);
    const internalCapacityRemaining = Math.min(dailyInternalRemaining, dailyTotalRemaining);
    if (internalCapacityRemaining <= 0) continue;

    if (row.vacanciesPerHour > 0) {
      const duration = Number(row.durationMinutes || 30);
      const availableStarts: number[] = [];
      const availableByHour = new Map<number, number>();
      for (let minute = start; minute + duration <= end; minute += duration) {
        if (now !== null && minute < now) continue;

        const hasBlock = dateBlocks.some((block) => {
          if (isWholeDayBlock(block)) return true;
          const blockStart = toMinutes(block.startTime);
          const blockEnd = toMinutes(block.endTime);
          return blockStart !== null && blockEnd !== null && minute >= blockStart && minute < blockEnd;
        });
        if (hasBlock) continue;

        const hour = Math.floor(minute / 60);
        const hourCount = dayAppointments.filter((appointment) => {
          const appointmentMinute = toMinutes(appointment.time);
          return appointmentMinute !== null && Math.floor(appointmentMinute / 60) === hour;
        }).length;
        const hourRemaining = Math.max(0, row.vacanciesPerHour - hourCount);
        if (hourRemaining <= 0) continue;
        availableStarts.push(minute);
        if (!availableByHour.has(hour)) availableByHour.set(hour, hourRemaining);
      }

      const hourlyCapacityRemaining = [...availableByHour.values()].reduce((sum, remaining) => sum + remaining, 0);
      const freeAppointments = Math.min(internalCapacityRemaining, hourlyCapacityRemaining);
      if (freeAppointments <= 0) continue;
      totalFree += freeAppointments;
      totalOpenWindows += availableStarts.length;
      windows.push({
        date,
        label: availableStarts.slice(0, 4).map(toTime).join(", ") + (availableStarts.length > 4 ? "…" : ""),
        freeAppointments,
      });
    } else {
      let openRanges = subtractBlockedRanges(start, end, dateBlocks, date);
      if (now !== null) openRanges = openRanges
        .map((range) => ({ start: Math.max(range.start, now), end: range.end }))
        .filter((range) => range.start < range.end);
      if (openRanges.length === 0) continue;
      const freeAppointments = internalCapacityRemaining;
      totalFree += freeAppointments;
      totalOpenWindows += openRanges.length;
      openRanges.forEach((range) => windows.push({
        date,
        label: toTime(range.start) + "–" + toTime(range.end),
        freeAppointments,
      }));
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
    const availableDates = new Set<string>();
    const nextWindows: CapacityWindow[] = [];

    for (const date of input.periodDates) {
      const day = getDailyPlan(input, professional, date);
      availableAppointments += day.freeAppointments;
      openWindows += day.openWindows;
      sameDayExternalReserved += day.reserved;
      if (day.review) reviewDays += 1;
      if (day.blocked) blockedDays += 1;
      if (day.freeAppointments > 0) availableDates.add(date);
      if (day.freeAppointments > 0 && nextWindows.length < 8) {
        for (const window of day.windows) {
          if (nextWindows.length >= 8) break;
          nextWindows.push(window);
        }
      }
    }

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

    return [{
      professionalId: professional.id,
      unitId: professional.unitId,
      specialty,
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
    if (session.status !== "pendente_agendamento" || session.appointmentId) return;
    const key = session.professionalId + "|" + session.unitId;
    pendingByProfessional.set(key, (pendingByProfessional.get(key) || 0) + 1);
  });

  const demandGroups = new Map<string, {
    specialty: "Fisioterapia" | "Fonoaudiologia";
    unitId: string;
    unitName: string;
    rows: QueueDemandInput[];
  }>();
  for (const row of input.queueDemand) {
    const specialty = classifyTreatmentCapacitySpecialty(row.destinationProfession || "") ||
      classifyTreatmentCapacitySpecialty(row.sector || "");
    if (!specialty) continue;
    const key = row.unitId + "|" + specialty;
    const current = demandGroups.get(key) || {
      specialty,
      unitId: row.unitId,
      unitName: input.professionals.find((professional) =>
        professional.unitId === row.unitId &&
        classifyTreatmentCapacitySpecialty(professional.profession) === specialty,
      )?.unitName || row.unitId,
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
      .filter((plan) => plan.unitId === group.unitId && plan.specialty === group.specialty)
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
      suggestions.push({
        specialty: group.specialty,
        unitId: group.unitId,
        unitName: group.unitName,
        unassignedDemand: unassigned.length,
        oldestWaitDays,
        professionalId: null,
        professionalName: "Sem capacidade residual no período",
        availableAppointments: 0,
        pendingSessions: 0,
        residualCapacity: 0,
        suggestedForReview: 0,
        cboStatus: "não comparável",
        message: "Não há capacidade residual calculada após considerar as sessões pendentes. Avaliar a grade e os bloqueios; nenhuma alteração será feita automaticamente.",
      });
      continue;
    }

    for (const candidate of candidates) {
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
        suggestedForReview: Math.min(unassigned.length, candidate.residualCapacity),
        cboStatus: "não comparável",
        message: candidate.residualCapacity > 0
          ? "Candidato para avaliação da equipe, considerando capacidade livre após as sessões pendentes. CBO de destino não armazenado: compatibilidade não comparável. Não representa atribuição ou agendamento."
          : "Sem capacidade residual após as sessões pendentes; avaliar a grade sem alterar a fila. CBO de destino não armazenado: compatibilidade não comparável.",
      });
    }
  }

  return { professionals, suggestions };
}
