// Normalização de dados para o Laudo APAC.
// Somente os campos 3 a 17 são extraídos. Nenhuma persistência.

import { normalizeUF } from "./ufMap";


export type AnyPaciente = Record<string, any>;

export const safeText = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  if (!s || s === "undefined" || s === "null" || s === "NaN" || s === "[object Object]") return "";
  return s;
};

const pickFn = (p: AnyPaciente, cd: AnyPaciente) => (...keys: string[]): string => {
  for (const k of keys) {
    const s = safeText(p?.[k]);
    if (s) return s;
  }
  for (const k of keys) {
    const s = safeText(cd?.[k]);
    if (s) return s;
  }
  return "";
};

export interface ApacLaudoData {
  nome: string;
  prontuario: string;
  cns: string;
  dataDD: string;
  dataMM: string;
  dataAAAA: string;
  sexoMasc: boolean;
  sexoFem: boolean;
  racaCor: string;
  nomeMae: string;
  telDDD: string;
  telNum: string;
  nomeResponsavel: string;
  telRespDDD: string;
  telRespNum: string;
  endereco: string;
  municipio: string;
  ibge: string;
  uf: string;
  cep: string;
}

const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");

// Normalização brasileira do telefone principal: remove máscara, descarta o
// prefixo 55 quando aplicável e devolve somente os 10 ou 11 dígitos de
// DDD + número. Comprimentos diferentes são considerados inválidos.
export function normalizeBrazilianPhone(value: unknown): string {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  if (digits.length !== 10 && digits.length !== 11) return "";
  return digits;
}

// Compat: usado por chamadores antigos.
export const normalizeTelefoneBR = normalizeBrazilianPhone;

const splitTel = (raw: string) => {
  const d = normalizeBrazilianPhone(raw);
  if (!d) return { ddd: "", num: "" };
  return { ddd: d.slice(0, 2), num: d.slice(2) };
};


const splitData = (raw: string) => {
  const s = safeText(raw);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { dd: iso[3], mm: iso[2], aaaa: iso[1] };
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return { dd: br[1], mm: br[2], aaaa: br[3] };
  return { dd: "", mm: "", aaaa: "" };
};

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const montarEndereco = (
  tipo: string,
  logr: string,
  numero: string,
  bairro: string,
): string => {
  const t = safeText(tipo);
  const l = safeText(logr);
  // evita duplicar tipo se o logradouro já começa com ele
  const ruaParts: string[] = [];
  if (t && !new RegExp(`^${t}\\b`, "i").test(l)) ruaParts.push(t);
  if (l) ruaParts.push(l);
  const rua = ruaParts.join(" ").trim();

  const partes: string[] = [];
  if (rua) partes.push(rua);
  const n = safeText(numero);
  if (n) partes.push(`Nº ${n}`);
  const b = safeText(bairro);
  if (b) partes.push(b);
  return partes.join(", ");
};

export function normalizePaciente(paciente: AnyPaciente | null): ApacLaudoData {
  const p = paciente || {};
  const cd = (p.custom_data || {}) as AnyPaciente;
  const pick = pickFn(p, cd);

  const sexoRaw = pick("sexo", "genero").toLowerCase();
  const tel = splitTel(pick("telefone", "celular"));
  const telR = splitTel(pick("telefone_responsavel", "telefoneResponsavel", "celular_responsavel"));
  const dn = splitData(pick("data_nascimento", "dataNascimento", "birth_date"));

  let prontuario = pick("numero_prontuario", "numeroProntuario", "prontuario", "codigo", "patient_code");
  if (isUuid(prontuario)) prontuario = "";

  return {
    nome: pick("nome", "name"),
    prontuario,
    cns: onlyDigits(pick("cns", "cartao_sus", "cartaoSus")).slice(0, 15),
    dataDD: dn.dd,
    dataMM: dn.mm,
    dataAAAA: dn.aaaa,
    sexoMasc: sexoRaw.startsWith("m"),
    sexoFem: sexoRaw.startsWith("f"),
    racaCor: pick("raca_cor", "racaCor", "raca"),
    nomeMae: pick("nome_mae", "nomeMae"),
    telDDD: tel.ddd,
    telNum: tel.num,
    nomeResponsavel: pick("nome_responsavel", "nomeResponsavel", "responsavel"),
    telRespDDD: telR.ddd,
    telRespNum: telR.num,
    endereco: montarEndereco(
      pick("tipo_logradouro", "tipoLogradouro"),
      pick("logradouro", "endereco", "rua"),
      pick("numero", "numero_endereco"),
      pick("bairro"),
    ),
    municipio: pick("municipio", "cidade"),
    ibge: onlyDigits(pick("codigo_ibge", "ibge_municipio", "ibgeMunicipio", "codIbge", "cod_ibge", "municipio_ibge", "ibge")).slice(0, 7),
    uf: normalizeUF(pick("uf", "estado")),
    cep: onlyDigits(pick("cep")).slice(0, 8),
  };
}
