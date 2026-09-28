import { loadBpaSigtapCatalog } from "./bpaSigtapCatalog";

export type SigtapClinicalStatus = "compatível" | "incompatível" | "indeterminado";

export interface SigtapClinicalValidationInput {
  procedimento: string;
  competencia: string;
  cbo?: string | null;
  dataNascimento?: string | null;
  dataAtendimento?: string | null;
  sexo?: string | null;
}

export interface SigtapClinicalValidationResult {
  status: SigtapClinicalStatus;
  procedimento: string;
  competencia: string;
  cbo: string;
  motivos: string[];
  avisos: string[];
  idadeMeses: number | null;
  faixaEtaria?: { minimaMeses: number | null; maximaMeses: number | null };
  instrumentos: string[];
  bpaICompativel: boolean | null;
}

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

const parseDate = (value?: string | null): { y: number; m: number; d: number } | null => {
  if (!value) return null;
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  const match = iso || compact;
  if (match) return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
  if (dmy) return { y: Number(dmy[3]), m: Number(dmy[2]), d: Number(dmy[1]) };
  return null;
};

const formatarIdadeMesesHumana = (meses: number | null): string => {
  if (meses == null || !Number.isFinite(meses) || meses < 0) return "idade não disponível";
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  if (anos === 0) return `${resto} ${resto === 1 ? "mês" : "meses"}`;
  if (resto === 0) return `${anos} ${anos === 1 ? "ano" : "anos"}`;
  return `${anos} ${anos === 1 ? "ano" : "anos"} e ${resto} ${resto === 1 ? "mês" : "meses"}`;
};

export const calcularIdadeMesesSigtap = (
  dataNascimento?: string | null,
  dataAtendimento?: string | null,
): number | null => {
  const nasc = parseDate(dataNascimento);
  const atend = parseDate(dataAtendimento);
  if (!nasc || !atend) return null;
  let meses = (atend.y - nasc.y) * 12 + (atend.m - nasc.m);
  if (atend.d < nasc.d) meses--;
  return meses >= 0 ? meses : null;
};

export const competenciaFromDate = (date?: string | null): string => {
  const parsed = parseDate(date);
  if (!parsed) return "";
  return `${parsed.y}${String(parsed.m).padStart(2, "0")}`;
};

export const resolveProfessionalCbo = (professional: any): string => {
  if (!professional) return "";

  // O cadastro bruto do banco usa custom_data, mas os contextos da aplicação
  // normalizam esse mesmo objeto para customData (camelCase). A validação deve
  // aceitar ambos para não "perder" o CBO já cadastrado ao passar pelo contexto.
  const cd = professional.custom_data || professional.customData || {};
  const candidates = [
    cd.cbo_codigo,
    cd.cbo,
    cd.codigo_cbo,
    cd.cbo_sus,
    professional.cbo,
    professional.cbo_codigo,
    professional.codigo_cbo,
  ];
  for (const candidate of candidates) {
    const cbo = digits(candidate);
    if (cbo.length === 6) return cbo;
  }
  return "";
};

export async function validarCompatibilidadeClinicaSigtap(
  input: SigtapClinicalValidationInput,
): Promise<SigtapClinicalValidationResult> {
  const procedimento = digits(input.procedimento);
  const competencia = digits(input.competencia);
  const cbo = digits(input.cbo);
  const avisos: string[] = [];
  const motivos: string[] = [];

  const base = {
    status: "indeterminado" as SigtapClinicalStatus,
    procedimento,
    competencia,
    cbo,
    motivos,
    avisos,
    idadeMeses: calcularIdadeMesesSigtap(input.dataNascimento, input.dataAtendimento),
    instrumentos: [] as string[],
    bpaICompativel: null as boolean | null,
  };

  if (procedimento.length !== 10) {
    return { ...base, avisos: ["Código SIGTAP ausente ou inválido."] };
  }
  if (competencia.length !== 6) {
    return { ...base, avisos: ["Competência SIGTAP não pôde ser determinada."] };
  }
  if (cbo.length !== 6) {
    return { ...base, avisos: ["CBO do profissional responsável não está disponível."] };
  }

  let catalog;
  try {
    catalog = await loadBpaSigtapCatalog(competencia);
  } catch (error: any) {
    return {
      ...base,
      avisos: [`Catálogo SIGTAP ${competencia} indisponível: ${error?.message || "falha de leitura"}`],
    };
  }

  const proc = catalog.get(procedimento);
  if (!proc) {
    return {
      ...base,
      status: "incompatível",
      motivos: [`Procedimento não vigente no SIGTAP da competência ${competencia}.`],
    };
  }

  const instrumentos = [...proc.instrumentos];
  const bpaICompativel = proc.instrumentos.has("02");

  if (!proc.cbos.has(cbo)) {
    motivos.push(`Procedimento não relacionado ao CBO ${cbo} na competência ${competencia}.`);
  }
  if (!bpaICompativel) {
    motivos.push(
      `Instrumento de registro incompatível com BPA-I na competência ${competencia} (instrumentos: ${instrumentos.join(", ") || "nenhum"}).`,
    );
  }

  const sexo = String(input.sexo || "").trim().toUpperCase().slice(0, 1);
  if (["M", "F"].includes(proc.sexo)) {
    if (!sexo) {
      avisos.push("Sexo do paciente não está disponível para validar a restrição SIGTAP.");
    } else if (sexo !== proc.sexo) {
      motivos.push(`Procedimento restrito ao sexo ${proc.sexo}; paciente informado como ${sexo}.`);
    }
  }

  const temFaixa = proc.idadeMinimaMeses != null || proc.idadeMaximaMeses != null;
  const idadeMeses = base.idadeMeses;
  if (temFaixa) {
    if (idadeMeses == null) {
      avisos.push("Data de nascimento/atendimento insuficiente para validar a faixa etária.");
    } else {
      if (proc.idadeMinimaMeses != null && idadeMeses < proc.idadeMinimaMeses) {
        motivos.push(
          `Atenção: paciente fora da faixa etária permitida pelo SIGTAP. Idade do paciente: ${formatarIdadeMesesHumana(idadeMeses)}. Idade mínima permitida: ${formatarIdadeMesesHumana(proc.idadeMinimaMeses)}.`,
        );
      }
      if (proc.idadeMaximaMeses != null && idadeMeses > proc.idadeMaximaMeses) {
        motivos.push(
          `Atenção: paciente fora da faixa etária permitida pelo SIGTAP. Idade do paciente: ${formatarIdadeMesesHumana(idadeMeses)}. Idade máxima permitida: ${formatarIdadeMesesHumana(proc.idadeMaximaMeses)}.`,
        );
      }
    }
  }

  const incompleteRequiredValidation =
    avisos.some((a) => a.includes("faixa etária")) ||
    avisos.some((a) => a.includes("Sexo do paciente"));

  return {
    ...base,
    status: motivos.length > 0 ? "incompatível" : incompleteRequiredValidation ? "indeterminado" : "compatível",
    motivos,
    avisos,
    idadeMeses,
    faixaEtaria: temFaixa
      ? { minimaMeses: proc.idadeMinimaMeses, maximaMeses: proc.idadeMaximaMeses }
      : undefined,
    instrumentos,
    bpaICompativel,
  };
}
