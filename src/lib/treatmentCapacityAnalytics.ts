import { statusOcupaVaga } from "./appointmentCapacity";
import { isoDayOfWeek } from "./utils";

export type TreatmentCapacitySpecialty = string;

export interface CapacityProfessionalInput {
  id: string;
  name: string;
  profession: string;
  unitId: string;
  unitName?: string;
  cboCode?: string | null;
}

export interface CapacityAvailabilityInput {
  professionalId: string;
  unitId: string;
  startDate: string;
  endDate: string;
  weekdays: number[];
  vacanciesPerDay: number;
}

export interface CapacityAppointmentInput {
  professionalId: string;
  unitId: string;
  date: string;
  time?: string | null;
  status: string;
}

export interface CapacityBlockInput {
  startDate: string;
  endDate: string;
  unitId?: string | null;
  professionalId?: string | null;
  allDay?: boolean;
  startTime?: string | null;
  endTime?: string | null;
}

export interface PendingTreatmentSessionInput {
  professionalId: string;
  unitId: string;
  status: string;
  scheduledDate: string | null;
  appointmentId: string | null;
}

export interface QueueDemandInput {
  id: string;
  unitId: string;
  professionalId?: string | null;
  destinationProfession?: string | null;
  sector?: string | null;
  requestDate?: string | null;
  cboCode?: string | null;
}

export interface ProfessionalCapacitySummary {
  professionalId: string;
  professionalName: string;
  profession: string;
  specialty: TreatmentCapacitySpecialty;
  unitId: string;
  unitName: string;
  cboCode: string | null;
  scheduledDays: number;
  blockedDays: number;
  partialBlockDays: number;
  multipleWindowDays: number;
  configuredSlots: number;
  occupiedAppointments: number;
  appointmentsWithoutAvailableSchedule: number;
  pendingSessions: number;
  pendingDated: number;
  pendingUndated: number;
  pendingOverdue: number;
  pendingWithAppointmentLink: number;
  assignedQueueDemand: number;
  assignedQueueUnconfirmable: number;
  assignedQueueIncompatible: number;
}

export interface SpecialtyCapacitySummary {
  specialty: TreatmentCapacitySpecialty;
  configuredSlots: number;
  scheduledDays: number;
  blockedDays: number;
  partialBlockDays: number;
  multipleWindowDays: number;
  occupiedAppointments: number;
  appointmentsWithoutAvailableSchedule: number;
  pendingSessions: number;
  pendingDated: number;
  pendingUndated: number;
  pendingOverdue: number;
  pendingWithAppointmentLink: number;
  queueDemand: number;
  queueAssigned: number;
  queueUnassigned: number;
  queueAssignedCompatible: number;
  queueAssignedIncompatible: number;
  queueAssignedUnconfirmable: number;
  queueWithValidRequestDate: number;
  queueWithoutValidRequestDate: number;
  queueWithoutCbo: number;
  averageWaitDays: number | null;
  oldestWaitDays: number | null;
}

export interface TreatmentCapacitySnapshot {
  professionals: ProfessionalCapacitySummary[];
  specialties: SpecialtyCapacitySummary[];
  periodDays: number;
  queueRowsOutsideTargetSpecialties: number;
}

export function normalizeCapacityText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function classifyTreatmentCapacitySpecialty(value: string): TreatmentCapacitySpecialty | null {
  const original = String(value || "").trim().replace(/\s+/g, " ");
  const normalized = normalizeCapacityText(original);
  if (!normalized) return null;
  if (normalized === "fisio" || normalized.includes("fisioterap")) return "Fisioterapia";
  if (normalized === "fono" || normalized.includes("fonoaud")) return "Fonoaudiologia";
  if (normalized.includes("psicolog") || normalized === "psicologia") return "Psicologia";
  if (normalized.includes("nutric") || normalized === "nutricao") return "Nutrição";
  if (normalized.includes("assistente social") || normalized === "servico social") return "Serviço Social";
  if (normalized.includes("enferm")) return "Enfermagem";
  if (normalized.includes("medic")) return "Medicina";
  if (normalized.includes("odont")) return "Odontologia";
  return original;
}

export function extractExplicitCboCode(customData: unknown, destination = ""): string | null {
  if (customData && typeof customData === "object" && !Array.isArray(customData)) {
    const record = customData as Record<string, unknown>;
    const value = record.cbo_codigo ?? record.cbo_destino;
    if ((typeof value === "string" || typeof value === "number") && String(value).trim()) {
      return String(value).trim().toUpperCase();
    }
  }
  const match = String(destination || "").match(/\bCBO\s*[:\-]?\s*([0-9A-Z.]{4,})\b/i);
  return match?.[1]?.toUpperCase() || null;
}

function dateAgeInDays(date: string | null | undefined, today: string): number | null {
  const normalized = String(date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || normalized > today) return null;
  const start = Date.parse(normalized + "T00:00:00Z");
  const end = Date.parse(today + "T00:00:00Z");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - start) / 86400000));
}

function blockAppliesToProfessional(block: CapacityBlockInput, professionalId: string, unitId: string, date: string): boolean {
  if (date < block.startDate || date > block.endDate) return false;
  const unit = block.unitId || "";
  const professional = block.professionalId || "";
  const isGlobal = !unit && !professional;
  const isUnit = unit === unitId && !professional;
  const isProfessional = professional === professionalId;
  return isGlobal || isUnit || isProfessional;
}

function isWholeDayBlock(block: CapacityBlockInput): boolean {
  // Keep the same meaning as the live Agenda: only an explicit all-day
  // block closes every time. Missing partial boundaries use the Agenda defaults.
  return block.allDay === true;
}

function blockAppliesToAppointment(block: CapacityBlockInput, appointment: CapacityAppointmentInput): boolean {
  if (!blockAppliesToProfessional(block, appointment.professionalId, appointment.unitId, appointment.date)) return false;
  if (isWholeDayBlock(block)) return true;
  if (!appointment.time) return false;
  const time = appointment.time.slice(0, 5);
  const start = String(block.startTime || "00:00").slice(0, 5);
  const end = String(block.endTime || "23:59").slice(0, 5);
  return time >= start && time < end;
}

function getQueueSpecialty(row: QueueDemandInput): TreatmentCapacitySpecialty | null {
  return classifyTreatmentCapacitySpecialty(row.destinationProfession || "") ||
    classifyTreatmentCapacitySpecialty(row.sector || "");
}

export function buildTreatmentCapacitySnapshot(input: {
  today: string;
  periodDates: string[];
  professionals: CapacityProfessionalInput[];
  availabilities: CapacityAvailabilityInput[];
  appointments: CapacityAppointmentInput[];
  blocks: CapacityBlockInput[];
  pendingSessions: PendingTreatmentSessionInput[];
  queueDemand: QueueDemandInput[];
}): TreatmentCapacitySnapshot {
  const { today, periodDates } = input;
  const professionals = input.professionals
    .map((professional) => ({
      professional,
      specialty: classifyTreatmentCapacitySpecialty(professional.profession),
    }))
    .filter((item): item is { professional: CapacityProfessionalInput; specialty: TreatmentCapacitySpecialty } =>
      item.specialty !== null,
    );

  const professionalRows: ProfessionalCapacitySummary[] = professionals.map(({ professional, specialty }) => {
    const professionalAvailability = input.availabilities.filter((availability) =>
      availability.professionalId === professional.id && availability.unitId === professional.unitId,
    );
    const availableScheduleDates = new Set<string>();
    const wholeDayBlockedDates = new Set<string>();
    let configuredSlots = 0;
    let scheduledDays = 0;
    let blockedDays = 0;
    let partialBlockDays = 0;
    let multipleWindowDays = 0;

    for (const date of periodDates) {
      const weekday = isoDayOfWeek(date);
      const dailyRows = professionalAvailability.filter((availability) =>
        date >= availability.startDate &&
        date <= availability.endDate &&
        availability.weekdays.includes(weekday),
      );
      if (dailyRows.length === 0) continue;

      availableScheduleDates.add(date);
      const dayBlocks = input.blocks.filter((block) =>
        blockAppliesToProfessional(block, professional.id, professional.unitId, date),
      );
      configuredSlots += dailyRows.reduce((sum, availability) =>
        sum + Math.max(0, Number(availability.vacanciesPerDay) || 0), 0);

      if (dayBlocks.some(isWholeDayBlock)) {
        blockedDays += 1;
        wholeDayBlockedDates.add(date);
        continue;
      }

      scheduledDays += 1;
      if (dailyRows.length > 1) multipleWindowDays += 1;
      if (dayBlocks.length > 0) partialBlockDays += 1;
    }

    const appointments = input.appointments.filter((appointment) =>
      appointment.professionalId === professional.id &&
      appointment.unitId === professional.unitId &&
      periodDates.includes(appointment.date) &&
      statusOcupaVaga(appointment.status),
    );
    const appointmentsWithoutAvailableSchedule = appointments.filter((appointment) =>
      !availableScheduleDates.has(appointment.date) ||
      wholeDayBlockedDates.has(appointment.date) ||
      input.blocks.some((block) => blockAppliesToAppointment(block, appointment)),
    ).length;

    const sessions = input.pendingSessions.filter((session) =>
      session.professionalId === professional.id &&
      session.unitId === professional.unitId &&
      session.status === "pendente_agendamento",
    );
    const unlinkedSessions = sessions.filter((session) => !session.appointmentId);
    const pendingDated = unlinkedSessions.filter((session) =>
      !!session.scheduledDate && session.scheduledDate >= today,
    ).length;
    const pendingUndated = unlinkedSessions.filter((session) => !session.scheduledDate).length;
    const pendingOverdue = unlinkedSessions.filter((session) =>
      !!session.scheduledDate && session.scheduledDate < today,
    ).length;
    const pendingWithAppointmentLink = sessions.length - unlinkedSessions.length;

    const assignedQueue = input.queueDemand.filter((row) =>
      row.unitId === professional.unitId &&
      row.professionalId === professional.id &&
      getQueueSpecialty(row) === specialty,
    );
    const assignedQueueCompatible = assignedQueue.filter((row) =>
      !!row.cboCode && !!professional.cboCode &&
      row.cboCode.toUpperCase() === professional.cboCode.toUpperCase(),
    ).length;
    const assignedQueueIncompatible = assignedQueue.filter((row) =>
      !!row.cboCode && !!professional.cboCode &&
      row.cboCode.toUpperCase() !== professional.cboCode.toUpperCase(),
    ).length;
    const assignedQueueUnconfirmable = assignedQueue.length - assignedQueueCompatible - assignedQueueIncompatible;

    return {
      professionalId: professional.id,
      professionalName: professional.name,
      profession: professional.profession,
      specialty,
      unitId: professional.unitId,
      unitName: professional.unitName || professional.unitId,
      cboCode: professional.cboCode || null,
      scheduledDays,
      blockedDays,
      partialBlockDays,
      multipleWindowDays,
      configuredSlots,
      occupiedAppointments: appointments.length,
      appointmentsWithoutAvailableSchedule,
      pendingSessions: unlinkedSessions.length,
      pendingDated,
      pendingUndated,
      pendingOverdue,
      pendingWithAppointmentLink,
      assignedQueueDemand: assignedQueueCompatible,
      assignedQueueUnconfirmable,
      assignedQueueIncompatible,
    };
  });

  const specialtyValues = new Set<TreatmentCapacitySpecialty>([
    ...professionalRows.map((row) => row.specialty),
    ...input.queueDemand
      .map((row) => getQueueSpecialty(row))
      .filter((value): value is TreatmentCapacitySpecialty => value !== null),
  ]);
  const specialties: SpecialtyCapacitySummary[] = [...specialtyValues].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  ).map((specialty) => {
    const rows = professionalRows.filter((row) => row.specialty === specialty);
    const queueRows = input.queueDemand.filter((row) => getQueueSpecialty(row) === specialty);
    const ages = queueRows
      .map((row) => dateAgeInDays(row.requestDate, today))
      .filter((age): age is number => age !== null);
    const assignedRows = queueRows.filter((row) => !!row.professionalId);
    const unassignedRows = queueRows.filter((row) => !row.professionalId);
    const compatible = assignedRows.filter((row) => {
      const professional = professionalRows.find((candidate) =>
        candidate.professionalId === row.professionalId && candidate.unitId === row.unitId && candidate.specialty === specialty,
      );
      return !!professional && !!row.cboCode && !!professional.cboCode &&
        row.cboCode.toUpperCase() === professional.cboCode.toUpperCase();
    }).length;
    const incompatible = assignedRows.filter((row) => {
      const professional = professionalRows.find((candidate) =>
        candidate.professionalId === row.professionalId && candidate.unitId === row.unitId && candidate.specialty === specialty,
      );
      return !!professional && !!row.cboCode && !!professional.cboCode &&
        row.cboCode.toUpperCase() !== professional.cboCode.toUpperCase();
    }).length;
    const unconfirmable = assignedRows.length - compatible - incompatible;
    const undated = queueRows.length - ages.length;

    return {
      specialty,
      configuredSlots: rows.reduce((sum, row) => sum + row.configuredSlots, 0),
      scheduledDays: rows.reduce((sum, row) => sum + row.scheduledDays, 0),
      blockedDays: rows.reduce((sum, row) => sum + row.blockedDays, 0),
      partialBlockDays: rows.reduce((sum, row) => sum + row.partialBlockDays, 0),
      multipleWindowDays: rows.reduce((sum, row) => sum + row.multipleWindowDays, 0),
      occupiedAppointments: rows.reduce((sum, row) => sum + row.occupiedAppointments, 0),
      appointmentsWithoutAvailableSchedule: rows.reduce((sum, row) => sum + row.appointmentsWithoutAvailableSchedule, 0),
      pendingSessions: rows.reduce((sum, row) => sum + row.pendingSessions, 0),
      pendingDated: rows.reduce((sum, row) => sum + row.pendingDated, 0),
      pendingUndated: rows.reduce((sum, row) => sum + row.pendingUndated, 0),
      pendingOverdue: rows.reduce((sum, row) => sum + row.pendingOverdue, 0),
      pendingWithAppointmentLink: rows.reduce((sum, row) => sum + row.pendingWithAppointmentLink, 0),
      queueDemand: queueRows.length,
      queueAssigned: assignedRows.length,
      queueUnassigned: unassignedRows.length,
      queueAssignedCompatible: compatible,
      queueAssignedIncompatible: incompatible,
      queueAssignedUnconfirmable: unconfirmable,
      queueWithValidRequestDate: ages.length,
      queueWithoutValidRequestDate: undated,
      queueWithoutCbo: queueRows.filter((row) => !row.cboCode).length,
      averageWaitDays: ages.length ? Math.round(ages.reduce((sum, age) => sum + age, 0) / ages.length) : null,
      oldestWaitDays: ages.length ? Math.max(...ages) : null,
    };
  });

  const targetQueueRows = input.queueDemand.filter((row) => getQueueSpecialty(row) !== null);

  return {
    professionals: professionalRows.sort((a, b) =>
      a.specialty.localeCompare(b.specialty, "pt-BR") ||
      a.unitName.localeCompare(b.unitName, "pt-BR") ||
      a.professionalName.localeCompare(b.professionalName, "pt-BR"),
    ),
    specialties,
    periodDays: periodDates.length,
    queueRowsOutsideTargetSpecialties: input.queueDemand.length - targetQueueRows.length,
  };
}
