
export type PatientStatus = "completo" | "parcial" | "pendente_cadastro" | "pendente_bpa" | "revisado";

export interface PendingFieldsResult {
  fields: string[];
  status: PatientStatus;
  percentage: number;
}

/**
 * Calculates pending fields and cadastral status for a patient.
 * Focuses on cadastral data, ignoring "Unidade" as a blocking factor.
 */
export function calculatePatientPendingFields(p: any): PendingFieldsResult {
  if (!p) return { fields: [], status: "pendente_cadastro", percentage: 0 };
  
  const missing: string[] = [];
  const cd = p.custom_data || {};
  
  // Basic Identification (Crucial for Cadastro)
  if (!p.nome?.trim()) missing.push("Nome");
  if (!p.cpf?.trim()) missing.push("CPF");
  if (!p.data_nascimento && !p.dataNascimento) missing.push("Data de Nascimento");
  if (!p.nome_mae?.trim() && !p.nomeMae?.trim()) missing.push("Nome da Mãe");
  if (!cd.sexo) missing.push("Sexo");
  
  // SUS / BPA Requirements (Crucial for SUS)
  if (!p.cns?.trim()) missing.push("CNS");
  if (!cd.raca_cor) missing.push("Raça/Cor");
  
  // Contact (Important for Cadastro)
  if (!p.telefone?.trim()) missing.push("Telefone");
  
  // Address (Crucial for Cadastro/BPA)
  if (!cd.cep?.trim()) missing.push("CEP");
  if (!cd.logradouro?.trim()) missing.push("Logradouro");
  if (!cd.bairro?.trim()) missing.push("Bairro");
  if (!p.municipio?.trim()) missing.push("Município");
  
  // Complementary (Important)
  if (!cd.nacionalidade) missing.push("Nacionalidade");
  if (!p.naturalidade?.trim()) missing.push("Naturalidade");

  // Removed Unidade as a dependency for this screen's logic
  
  const importantFieldsCount = 13; // Adjusted count
  const percentage = Math.max(0, Math.round(((importantFieldsCount - missing.length) / importantFieldsCount) * 100));
  
  let status: PatientStatus = "completo";
  
  if (missing.length > 0) {
    // Check if critical BPA fields are missing
    const bpaCritical = ["CNS", "Raça/Cor", "Nome da Mãe", "Data de Nascimento", "Sexo"];
    const hasBpaPending = missing.some(f => bpaCritical.includes(f));
    
    if (hasBpaPending) {
      status = "pendente_bpa";
    } else if (percentage < 50) {
      status = "pendente_cadastro";
    } else {
      status = "parcial";
    }
  }
  
  // Explicitly marked as revised in custom_data
  if (cd.revisado_em) {
    status = "revisado";
  }

  return { fields: missing, status, percentage };
}
