
export type PatientStatus = "completo" | "incompleto" | "pendente_bpa" | "sem_unidade" | "revisado";

export interface PendingFieldsResult {
  fields: string[];
  status: PatientStatus;
  percentage: number;
}

/**
 * Calculates pending fields and cadastral status for a patient.
 * Centralized logic as requested.
 */
export function calculatePatientPendingFields(p: any): PendingFieldsResult {
  if (!p) return { fields: [], status: "incompleto", percentage: 0 };
  
  const missing: string[] = [];
  const cd = p.customData || p.custom_data || {};
  
  // Basic Identification
  if (!p.nome?.trim()) missing.push("Nome");
  if (!p.cpf?.trim()) missing.push("CPF");
  if (!(p.dataNascimento || p.data_nascimento)) missing.push("Data de Nascimento");
  if (!(p.nomeMae || p.nome_mae)?.trim()) missing.push("Nome da Mãe");
  if (!cd.sexo) missing.push("Sexo");
  
  // SUS / BPA Requirements
  if (!p.cns?.trim()) missing.push("CNS");
  if (!(cd.racaCor || cd.raca_cor)) missing.push("Raça/Cor");
  if (!cd.nacionalidade) missing.push("Nacionalidade");
  if (!p.naturalidade?.trim()) missing.push("Naturalidade");
  
  // Contact
  if (!p.telefone?.trim()) missing.push("Telefone");
  
  // Address (Checking custom_data structured fields)
  if (!cd.cep?.trim()) missing.push("CEP");
  if (!cd.logradouro?.trim()) missing.push("Logradouro");
  if (!cd.bairro?.trim()) missing.push("Bairro");
  if (!p.municipio?.trim()) missing.push("Município");
  
  // System
  const hasUnidade = !!(p.unidadeId || p.unidade_id);
  if (!hasUnidade) missing.push("Unidade Vinculada");
  
  const importantFieldsCount = 15;
  const percentage = Math.max(0, Math.round(((importantFieldsCount - missing.length) / importantFieldsCount) * 100));
  
  let status: PatientStatus = "completo";
  if (!hasUnidade) {
    status = "sem_unidade";
  } else if (missing.length > 0) {
    // Check if critical BPA fields are missing
    const bpaCritical = ["CNS", "Raça/Cor", "Nome da Mãe", "Data de Nascimento", "Sexo"];
    const hasBpaPending = missing.some(f => bpaCritical.includes(f));
    status = hasBpaPending ? "pendente_bpa" : "incompleto";
  }
  
  // Explicitly marked as revised in custom_data
  if ((cd.revisado_em || cd.revisadoEm) && status !== "sem_unidade") {
    status = "revisado";
  }

  return { fields: missing, status, percentage };
}
