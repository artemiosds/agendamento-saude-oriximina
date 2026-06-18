// Normaliza dados do paciente para o Laudo APAC. APENAS leitura.
// Não consulta banco, não persiste, não calcula código IBGE.

export type AnyPaciente = Record<string, any>;

export const safeText = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  if (!s || s === "undefined" || s === "null" || s === "NaN" || s === "[object Object]") return "";
  return s;
};

const pickFn = (p: AnyPaciente, cd: AnyPaciente) => (...keys: string[]): string => {
  for (const k of keys) {
    const v = p?.[k];
    const s = safeText(v);
    if (s) return s;
  }
  for (const k of keys) {
    const v = cd?.[k];
    const s = safeText(v);
    if (s) return s;
  }
  return "";
};

export interface ApacLaudoData {
  nome: string;
  prontuario: string;
  cns: string;
  dataNascDD: string;
  dataNascMM: string;
  dataNascAAAA: string;
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

const splitTel = (raw: string) => {
  const d = raw.replace(/\D/g, "");
  if (d.length >= 10) return { ddd: d.slice(0, 2), num: d.slice(2, 11) };
  return { ddd: "", num: d.slice(0, 9) };
};

const splitData = (raw: string) => {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { dd: iso[3], mm: iso[2], aaaa: iso[1] };
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return { dd: br[1], mm: br[2], aaaa: br[3] };
  return { dd: "", mm: "", aaaa: "" };
};

const montarEndereco = (tipo: string, logr: string, numero: string, bairro: string): string => {
  const rua = [tipo, logr].filter(Boolean).join(" ").trim();
  const partes: string[] = [];
  if (rua) partes.push(rua);
  if (numero) partes.push(`Nº ${numero}`);
  if (bairro) partes.push(bairro);
  return partes.join(", ");
};

export function normalizePaciente(paciente: AnyPaciente | null): ApacLaudoData {
  const p = paciente || {};
  const cd = (p.custom_data || {}) as AnyPaciente;
  const pick = pickFn(p, cd);

  const sexoRaw = pick("sexo").toLowerCase();
  const tel = splitTel(pick("telefone", "celular"));
  const telR = splitTel(pick("telefoneResponsavel", "telefone_responsavel"));
  const dn = splitData(pick("dataNascimento", "data_nascimento", "birth_date"));

  return {
    nome: pick("nome", "name"),
    prontuario: pick("numeroProntuario", "numero_prontuario", "prontuario", "codigo", "patient_code"),
    cns: pick("cns", "cartaoSus", "cartao_sus").replace(/\D/g, ""),
    dataNascDD: dn.dd,
    dataNascMM: dn.mm,
    dataNascAAAA: dn.aaaa,
    sexoMasc: sexoRaw.startsWith("m"),
    sexoFem: sexoRaw.startsWith("f"),
    racaCor: pick("racaCor", "raca_cor", "raca"),
    nomeMae: pick("nomeMae", "nome_mae"),
    telDDD: tel.ddd,
    telNum: tel.num,
    nomeResponsavel: pick("nomeResponsavel", "nome_responsavel", "responsavel"),
    telRespDDD: telR.ddd,
    telRespNum: telR.num,
    endereco: montarEndereco(
      pick("tipoLogradouro", "tipo_logradouro"),
      pick("logradouro", "endereco", "rua"),
      pick("numero", "numero_endereco"),
      pick("bairro"),
    ),
    municipio: pick("municipio", "cidade"),
    ibge: pick("ibgeMunicipio", "ibge_municipio", "codIbge", "cod_ibge", "ibge", "codigo_ibge").replace(/\D/g, ""),
    uf: pick("uf", "estado"),
    cep: pick("cep").replace(/\D/g, ""),
  };
}
