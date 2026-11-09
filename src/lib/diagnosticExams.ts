export type DiagnosticRoomPurpose = "consultorio_clinico" | "aparelho_diagnostico";
export type DiagnosticContrast = "sim" | "nao" | "opcional";
export type DiagnosticExamStatus =
  | "agendado"
  | "paciente_chegou"
  | "exame_realizado_em_laudo"
  | "laudo_liberado"
  | "cancelado";

export interface DiagnosticRoomConfig {
  finalidade: DiagnosticRoomPurpose;
  tipoExame: string;
  duracaoSlot: number;
  exigePreparo: boolean;
  instrucoesPreparo: string;
  exigeContraste: DiagnosticContrast;
  horarioInicio?: string;
  horarioFim?: string;
}

export interface DiagnosticAppointmentSnapshot {
  id: string;
  hora: string;
  status?: string;
  custom_data?: Record<string, any> | null;
}

export const DEFAULT_DIAGNOSTIC_ROOM_CONFIG: DiagnosticRoomConfig = {
  finalidade: "consultorio_clinico",
  tipoExame: "",
  duracaoSlot: 15,
  exigePreparo: false,
  instrucoesPreparo: "",
  exigeContraste: "nao",
  horarioInicio: "07:00",
  horarioFim: "17:00",
};

export const DIAGNOSTIC_SLOT_DURATIONS = [10, 15, 20, 30, 45] as const;

export function normalizeDiagnosticRoomConfig(value: unknown): DiagnosticRoomConfig {
  const raw = value && typeof value === "object" ? value as Record<string, any> : {};
  const duration = Number(raw.duracaoSlot);
  const contrast = ["sim", "nao", "opcional"].includes(raw.exigeContraste) ? raw.exigeContraste : "nao";
  return {
    finalidade: raw.finalidade === "aparelho_diagnostico" ? "aparelho_diagnostico" : "consultorio_clinico",
    tipoExame: String(raw.tipoExame || "").trim(),
    duracaoSlot: DIAGNOSTIC_SLOT_DURATIONS.includes(duration as any) ? duration : 15,
    exigePreparo: raw.exigePreparo === true,
    instrucoesPreparo: String(raw.instrucoesPreparo || "").trim(),
    exigeContraste: contrast,
    horarioInicio: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(raw.horarioInicio || "")) ? raw.horarioInicio : "07:00",
    horarioFim: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(raw.horarioFim || "")) ? raw.horarioFim : "17:00",
  };
}

export function getDiagnosticRoomConfig(unitCustomData: unknown, roomId: string): DiagnosticRoomConfig | null {
  const data = unitCustomData && typeof unitCustomData === "object" ? unitCustomData as Record<string, any> : {};
  const map = data.salas_exames && typeof data.salas_exames === "object" ? data.salas_exames : {};
  const value = map[roomId];
  if (!value || value.finalidade !== "aparelho_diagnostico") return null;
  return normalizeDiagnosticRoomConfig(value);
}

export function isDiagnosticAppointment(row: { tipo?: string | null; custom_data?: unknown }): boolean {
  const data = row.custom_data && typeof row.custom_data === "object" ? row.custom_data as Record<string, any> : {};
  return row.tipo === "exame" && data.sala_tipo === "aparelho_diagnostico";
}

function toMinutes(value: string): number {
  const [hours, minutes] = String(value || "00:00").split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function fromMinutes(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function getAvailableDiagnosticSlots(
  config: DiagnosticRoomConfig,
  appointments: DiagnosticAppointmentSnapshot[],
): string[] {
  const normalized = normalizeDiagnosticRoomConfig(config);
  const duration = normalized.duracaoSlot;
  const start = toMinutes(normalized.horarioInicio || "07:00");
  const end = toMinutes(normalized.horarioFim || "17:00");
  if (end <= start || duration <= 0) return [];

  const occupied = appointments
    .filter((appointment) => !["cancelado", "remarcado", "falta"].includes(String(appointment.status || "").toLowerCase())
      && String(appointment.custom_data?.status_exame || "") !== "cancelado")
    .map((appointment) => {
      const startAt = toMinutes(appointment.hora);
      const occupiedDuration = Number(appointment.custom_data?.duracao_slot_minutos) || duration;
      return { start: startAt, end: startAt + Math.max(1, occupiedDuration) };
    });

  const slots: string[] = [];
  for (let slot = start; slot + duration <= end; slot += duration) {
    const slotEnd = slot + duration;
    const overlaps = occupied.some((item) => slot < item.end && slotEnd > item.start);
    if (!overlaps) slots.push(fromMinutes(slot));
  }
  return slots;
}

const EXAM_TRANSITIONS: Record<DiagnosticExamStatus, DiagnosticExamStatus[]> = {
  agendado: ["paciente_chegou", "cancelado"],
  paciente_chegou: ["exame_realizado_em_laudo", "cancelado"],
  exame_realizado_em_laudo: ["laudo_liberado"],
  laudo_liberado: [],
  cancelado: [],
};

export function canTransitionDiagnosticExam(from: string, to: DiagnosticExamStatus): boolean {
  return (EXAM_TRANSITIONS[from as DiagnosticExamStatus] || []).includes(to);
}

export function getDiagnosticStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    agendado: "Agendado",
    paciente_chegou: "Paciente chegou",
    exame_realizado_em_laudo: "Exame realizado / em laudo",
    laudo_liberado: "Laudo liberado",
    cancelado: "Cancelado",
  };
  return labels[status] || "Status desconhecido";
}
