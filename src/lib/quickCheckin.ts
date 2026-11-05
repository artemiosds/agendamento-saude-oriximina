import { validateCNS } from "@/lib/cnsUtils";
import { legalPriorityKey, patientAge } from "@/lib/queuePriority";

export interface QuickCheckinPatient {
  nome?: string | null;
  cpf?: string | null; cns?: string | null; dataNascimento?: string | null; data_nascimento?: string | null;
  sexo?: string | null; nomeMae?: string | null; nome_mae?: string | null; telefone?: string | null;
  telefone_principal?: string | null; endereco?: string | null; logradouro?: string | null; bairro?: string | null;
  raca_cor?: string | null; racaCor?: string | null; isPne?: boolean; is_pne?: boolean;
  isGestante?: boolean; is_gestante?: boolean; isAutista?: boolean; is_autista?: boolean;
  custom_data?: Record<string, unknown>; customData?: Record<string, unknown>;
}

export function getQuickCadastroPendencies(patient: QuickCheckinPatient | null | undefined): string[] {
  if (!patient) return ["Cadastro do paciente não carregado"];
  const custom = patient.custom_data || patient.customData || {};
  const cpf = String(patient.cpf || "").replace(/\D/g, "");
  const cns = String(patient.cns || "").replace(/\D/g, "");
  const birth = patient.dataNascimento || patient.data_nascimento || "";
  const sex = String(patient.sexo || custom.sexo || "").trim().toLowerCase();
  const normalizedSex = sex === "m" || sex === "masculino" ? "M" : sex === "f" || sex === "feminino" ? "F" : "";
  const race = custom.raca_cor || custom.racaCor || patient.raca_cor || patient.racaCor;
  const neighborhood = patient.bairro || custom.bairro;
  const street = patient.logradouro || custom.logradouro || patient.endereco || custom.endereco;
  const phone = patient.telefone || patient.telefone_principal || custom.telefone_principal || custom.telefone;
  const mother = patient.nomeMae || patient.nome_mae || custom.nome_mae || custom.nomeMae;

  return [
    cpf.length === 11 ? "" : "CPF",
    cns.length === 15 && validateCNS(cns).valid ? "" : "CNS",
    patientAge(birth) !== null ? "" : "Data de nascimento",
    normalizedSex ? "" : "Sexo",
    String(mother || "").trim() ? "" : "Nome da mãe",
    String(race || "").trim() ? "" : "Raça/Cor",
    String(neighborhood || "").trim() ? "" : "Bairro",
    String(street || "").trim() ? "" : "Logradouro/Endereço",
    String(phone || "").replace(/\D/g, "").length >= 10 ? "" : "Telefone",
  ].filter(Boolean);
}

export function getQuickPriorityFlags(patient: QuickCheckinPatient | null | undefined) {
  const custom = patient?.custom_data || patient?.customData || {};
  return {
    is_pne: !!(patient?.isPne ?? patient?.is_pne ?? custom.is_pne ?? custom.isPne),
    is_gestante: !!(patient?.isGestante ?? patient?.is_gestante ?? custom.is_gestante ?? custom.isGestante),
    is_autista: !!(patient?.isAutista ?? patient?.is_autista ?? custom.is_autista ?? custom.isAutista),
  };
}

export function getQuickAgePriority(patient: QuickCheckinPatient | null | undefined, today = new Date()) {
  const priorities = getQuickPriorityFlags(patient);
  return legalPriorityKey({
    dataNascimento: patient?.dataNascimento || patient?.data_nascimento || "",
    isPne: priorities.is_pne,
    isGestante: priorities.is_gestante,
    isAutista: priorities.is_autista,
  }, false, today);
}

export function getQuickSelectionIndex(current: number, direction: -1 | 1, count: number): number {
  if (count <= 0) return -1;
  if (current < 0) return direction > 0 ? 0 : count - 1;
  return Math.max(0, Math.min(count - 1, current + direction));
}

export function isQuickAppointmentInScope(
  appointment: { unidadeId?: string; profissionalId?: string },
  user: { id?: string; usuario?: string; unidadeId?: string } | null | undefined,
  visibleUnitIds: string[],
  isProfessional: boolean,
): boolean {
  if (!user || user.usuario !== "admin.sms") {
    if (user?.unidadeId && appointment.unidadeId !== user.unidadeId) return false;
    if (visibleUnitIds.length && !visibleUnitIds.includes(appointment.unidadeId)) return false;
  }
  if (isProfessional && appointment.profissionalId !== user?.id) return false;
  return true;
}
