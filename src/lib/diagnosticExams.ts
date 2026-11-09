export type DiagnosticRoomPurpose = "consultorio_clinico" | "aparelho_diagnostico";
export type DiagnosticContrast = "sim" | "nao" | "opcional";
export type DiagnosticExamStatus =
  | "agendado"
  | "paciente_chegou"
  | "exame_realizado_em_laudo"
  | "laudo_liberado"
  | "cancelado";

export interface DiagnosticExamConfig {
  id: string;
  tipoExame: string;
  duracaoSlot: number;
  exigePreparo: boolean;
  instrucoesPreparo: string;
  exigeContraste: DiagnosticContrast;
  prazoResultadoDias: number;
}

export interface DiagnosticRoomConfig {
  finalidade: DiagnosticRoomPurpose;
  /** Campos do primeiro exame mantidos para compatibilidade com configurações antigas. */
  tipoExame: string;
  duracaoSlot: number;
  exigePreparo: boolean;
  instrucoesPreparo: string;
  exigeContraste: DiagnosticContrast;
  horarioInicio?: string;
  horarioFim?: string;
  prazoResultadoDias: number;
  /** Cada modalidade possui preparo, duração, contraste e prazo próprios. */
  exames: DiagnosticExamConfig[];
}

export interface DiagnosticAppointmentSnapshot {
  id: string;
  hora: string;
  status?: string;
  custom_data?: Record<string, any> | null;
}

/** Catálogo inicial de modalidades. Não define preparo clínico automaticamente. */
export const DIAGNOSTIC_EXAM_CATALOG = [
  { label: "Tomografia Computadorizada", keywords: "tomografia tc tomografo" },
  { label: "Eletrocardiograma (ECG)", keywords: "eletrocardiograma ecg eletro" },
  { label: "Radiografia (Raio-X)", keywords: "radiografia raio x rx raio-x" },
  { label: "Ultrassonografia", keywords: "ultrassom ultrassonografia usg" },
  { label: "Ressonância Magnética", keywords: "ressonancia ressonância rm" },
  { label: "Mamografia", keywords: "mamografia mama" },
  { label: "Densitometria Óssea", keywords: "densitometria ossea óssea" },
  { label: "Ecocardiograma", keywords: "ecocardiograma eco coração cardiaco" },
  { label: "Endoscopia Digestiva Alta", keywords: "endoscopia eda digestiva alta" },
  { label: "Colonoscopia", keywords: "colonoscopia colon" },
  { label: "Holter 24 horas", keywords: "holter ritmo cardiaco 24h" },
  { label: "MAPA 24 horas", keywords: "mapa pressao pressão arterial 24h" },
  { label: "Eletroencefalograma (EEG)", keywords: "eletroencefalograma eeg encefalograma" },
  { label: "Espirometria", keywords: "espirometria pulmonar função respiratoria" },
  { label: "Teste Ergométrico", keywords: "teste ergometrico ergométrico esforço" },
  { label: "Audiometria", keywords: "audiometria audição ouvido" },
] as const;

export const DEFAULT_DIAGNOSTIC_ROOM_CONFIG: DiagnosticRoomConfig = {
  finalidade: "consultorio_clinico",
  tipoExame: "",
  duracaoSlot: 15,
  exigePreparo: false,
  instrucoesPreparo: "",
  exigeContraste: "nao",
  horarioInicio: "07:00",
  horarioFim: "17:00",
  prazoResultadoDias: 0,
  exames: [],
};

export const DIAGNOSTIC_SLOT_DURATIONS = [10, 15, 20, 30, 45] as const;

const normalizeExamName = (value: unknown) => String(value || "").trim();

export function createDiagnosticExamConfig(tipoExame: string, id?: string): DiagnosticExamConfig {
  const name = normalizeExamName(tipoExame);
  const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    id: id || "exam-" + (slug || "personalizado"),
    tipoExame: name,
    duracaoSlot: 15,
    exigePreparo: false,
    instrucoesPreparo: "",
    exigeContraste: "nao",
    prazoResultadoDias: 0,
  };
}

export function normalizeDiagnosticExamConfig(value: unknown, index = 0): DiagnosticExamConfig {
  const raw = value && typeof value === "object" ? value as Record<string, any> : {};
  const name = normalizeExamName(raw.tipoExame || raw.nome || raw.exame_nome);
  const duration = Number(raw.duracaoSlot);
  const resultDays = Number(raw.prazoResultadoDias);
  const contrast = ["sim", "nao", "opcional"].includes(raw.exigeContraste) ? raw.exigeContraste : "nao";
  const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    id: String(raw.id || "exam-" + (slug || index + 1)),
    tipoExame: name,
    duracaoSlot: DIAGNOSTIC_SLOT_DURATIONS.includes(duration as any) ? duration : 15,
    exigePreparo: raw.exigePreparo === true,
    instrucoesPreparo: String(raw.instrucoesPreparo || "").trim(),
    exigeContraste: contrast,
    prazoResultadoDias: Number.isInteger(resultDays) && resultDays >= 0 && resultDays <= 90 ? resultDays : 0,
  };
}

/**
 * Lê tanto o formato novo (vários exames) quanto o formato antigo
 * (um único tipoExame no nível da sala), sem descartar configurações existentes.
 */
export function normalizeDiagnosticRoomConfig(value: unknown): DiagnosticRoomConfig {
  const raw = value && typeof value === "object" ? value as Record<string, any> : {};
  const rawExams = Array.isArray(raw.exames) && raw.exames.length > 0
    ? raw.exames
    : (normalizeExamName(raw.tipoExame) ? [raw] : []);
  const exams = rawExams
    .map((exam: unknown, index: number) => normalizeDiagnosticExamConfig(exam, index))
    .filter((exam: DiagnosticExamConfig) => !!exam.tipoExame);
  const first = exams[0];
  const contrast = ["sim", "nao", "opcional"].includes(raw.exigeContraste) ? raw.exigeContraste : "nao";
  return {
    finalidade: raw.finalidade === "aparelho_diagnostico" ? "aparelho_diagnostico" : "consultorio_clinico",
    tipoExame: first?.tipoExame || normalizeExamName(raw.tipoExame),
    duracaoSlot: first?.duracaoSlot || 15,
    exigePreparo: first?.exigePreparo ?? raw.exigePreparo === true,
    instrucoesPreparo: first?.instrucoesPreparo ?? String(raw.instrucoesPreparo || "").trim(),
    exigeContraste: first?.exigeContraste || contrast,
    horarioInicio: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(raw.horarioInicio || "")) ? raw.horarioInicio : "07:00",
    horarioFim: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(raw.horarioFim || "")) ? raw.horarioFim : "17:00",
    prazoResultadoDias: first?.prazoResultadoDias ?? (Number.isInteger(Number(raw.prazoResultadoDias)) && Number(raw.prazoResultadoDias) >= 0 && Number(raw.prazoResultadoDias) <= 90 ? Number(raw.prazoResultadoDias) : 0),
    exames: exams,
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
  return String(row.tipo || "").toLowerCase() === "exame" && data.sala_tipo === "aparelho_diagnostico";
}

function toMinutes(value: string): number {
  const [hours, minutes] = String(value || "00:00").split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function fromMinutes(value: number): string {
  return String(Math.floor(value / 60)).padStart(2, "0") + ":" + String(value % 60).padStart(2, "0");
}

export function getAvailableDiagnosticSlots(
  config: Pick<DiagnosticRoomConfig, "horarioInicio" | "horarioFim"> & Pick<DiagnosticExamConfig, "duracaoSlot">,
  appointments: DiagnosticAppointmentSnapshot[],
): string[] {
  const durationValue = Number(config.duracaoSlot);
  const duration = DIAGNOSTIC_SLOT_DURATIONS.includes(durationValue as any) ? durationValue : 15;
  const start = toMinutes(config.horarioInicio || "07:00");
  const end = toMinutes(config.horarioFim || "17:00");
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
