import type { PatientReferral } from "@/services/patientReferralService";
import type { PacienteFormData } from "@/components/CadastroPacienteForm";

const FIELDS = {
  especialidade_destino: "especialidadeDestino",
  ubs_origem: "ubsOrigem",
  profissional_solicitante: "profissionalSolicitante",
  tipo_encaminhamento: "tipoEncaminhamento",
  cid: "cid",
  diagnostico_resumido: "diagnosticoResumido",
  justificativa: "justificativa",
  data_encaminhamento: "dataEncaminhamento",
} as const;

export function mergeLatestReferral(form: PacienteFormData, referral: Partial<PatientReferral>): PacienteFormData {
  const next = { ...form };
  for (const [dbKey, formKey] of Object.entries(FIELDS)) {
    if (Object.prototype.hasOwnProperty.call(referral, dbKey)) next[formKey] = referral[dbKey] ?? "";
  }
  return next;
}

// O histórico grava seus próprios campos. Um UPDATE cadastral não deve
// regravá-los, mesmo que o histórico ainda esteja carregando ou em outra aba.
export function patientDemographicUpdate<T extends Record<string, unknown>>(fields: T): Omit<T, keyof typeof FIELDS> {
  const next = { ...fields };
  for (const key of Object.keys(FIELDS)) delete next[key];
  return next;
}

export function latestReferral(referrals: PatientReferral[]): PatientReferral | undefined {
  return [...referrals].sort((a, b) =>
    (b.created_at || "").localeCompare(a.created_at || "") || b.id.localeCompare(a.id))[0];
}
