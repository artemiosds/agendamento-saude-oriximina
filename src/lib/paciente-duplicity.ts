import { supabase } from "@/integrations/supabase/client";

/**
 * Normalizes a string by removing extra spaces, converting to lowercase, 
 * and removing accents/diacritics.
 */
export function normalizeString(str: string): string {
  if (!str) return "";
  return str
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Removes non-numeric characters from a string (e.g., CPF, CNS, phone).
 */
export function cleanNumericString(str: string): string {
  if (!str) return "";
  return str.replace(/\D/g, "");
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  message?: string;
  existingPatient?: { id: string; nome: string };
}

/**
 * Checks if a patient already exists based on CPF, CNS, or Name + Birth Date.
 */
export async function checkPatientDuplicity(data: {
  nome: string;
  dataNascimento: string;
  cpf?: string;
  cns?: string;
  idToExclude?: string | null;
}): Promise<DuplicateCheckResult> {
  const nomeNorm = normalizeString(data.nome);
  const cpfClean = cleanNumericString(data.cpf || "");
  const cnsClean = cleanNumericString(data.cns || "").slice(0, 15);
  const dataNasc = data.dataNascimento;

  // 1. Check CPF
  if (cpfClean && cpfClean.length >= 11) {
    const { data: cpfMatch, error: cpfError } = await supabase
      .from("pacientes")
      .select("id, nome")
      .eq("cpf", cpfClean)
      .maybeSingle();

    if (cpfMatch && cpfMatch.id !== data.idToExclude) {
      return {
        isDuplicate: true,
        message: `Paciente já cadastrado com este CPF: ${cpfMatch.nome}. Verifique o cadastro existente.`,
        existingPatient: cpfMatch,
      };
    }
  }

  // 2. Check CNS
  if (cnsClean && cnsClean.length >= 15) {
    const { data: cnsMatch, error: cnsError } = await supabase
      .from("pacientes")
      .select("id, nome")
      .eq("cns", cnsClean)
      .maybeSingle();

    if (cnsMatch && cnsMatch.id !== data.idToExclude) {
      return {
        isDuplicate: true,
        message: `Paciente já cadastrado com este CNS: ${cnsMatch.nome}. Verifique o cadastro existente.`,
        existingPatient: cnsMatch,
      };
    }
  }

  // 3. Check Name + Birth Date (More expensive, use exact match or normalized comparison)
  if (nomeNorm && dataNasc) {
    // We fetch by exact birth date first to narrow down
    const { data: matches, error } = await supabase
      .from("pacientes")
      .select("id, nome")
      .eq("data_nascimento", dataNasc);

    if (matches) {
      const duplicate = matches.find(m => normalizeString(m.nome) === nomeNorm && m.id !== data.idToExclude);
      if (duplicate) {
        return {
          isDuplicate: true,
          message: `Paciente já cadastrado com este Nome e Data de Nascimento: ${duplicate.nome}. Verifique o cadastro existente.`,
          existingPatient: duplicate,
        };
      }
    }
  }

  return { isDuplicate: false };
}
