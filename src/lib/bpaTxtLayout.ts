/**
 * Construtor posicional do arquivo BPA-I (SIA/SUS).
 * Referência: Layout de Exportação BPA — Registro 01 (130) e Registro 03 (338).
 * A normalização ocorre somente na exportação e nunca altera o cadastro.
 */

export const BPA_LAYOUT_REFERENCE = "DATASUS/SIA — Layout de Exportação BPA (09/07/2026)";
export const BPA_HEADER_LENGTH = 130;
export const BPA_I_RECORD_LENGTH = 338;

type FieldKind = "digits" | "text" | "raw";

export interface BpaFieldDefinition {
  start: number;
  end: number;
  length: number;
  kind: FieldKind;
  required?: boolean;
  align?: "left" | "right";
  fill?: " " | "0";
}

export const BPA_I_FIELDS = {
  tipoRegistro: { start: 1, end: 2, length: 2, kind: "digits", required: true },
  cnes: { start: 3, end: 9, length: 7, kind: "digits", required: true },
  competencia: { start: 10, end: 15, length: 6, kind: "digits", required: true },
  cnsProfissional: { start: 16, end: 30, length: 15, kind: "digits", required: true },
  cbo: { start: 31, end: 36, length: 6, kind: "digits", required: true },
  dataAtendimento: { start: 37, end: 44, length: 8, kind: "digits", required: true },
  folha: { start: 45, end: 47, length: 3, kind: "digits", required: true },
  sequencia: { start: 48, end: 49, length: 2, kind: "digits", required: true },
  procedimento: { start: 50, end: 59, length: 10, kind: "digits", required: true },
  cnsPaciente: { start: 60, end: 74, length: 15, kind: "digits", required: true },
  sexo: { start: 75, end: 75, length: 1, kind: "text", required: true },
  municipioIbge: { start: 76, end: 81, length: 6, kind: "digits", required: true },
  cid: { start: 82, end: 85, length: 4, kind: "text" },
  idade: { start: 86, end: 88, length: 3, kind: "digits", required: true },
  quantidade: { start: 89, end: 94, length: 6, kind: "digits", required: true },
  caraterAtendimento: { start: 95, end: 96, length: 2, kind: "digits", required: true },
  autorizacao: { start: 97, end: 109, length: 13, kind: "digits" },
  origem: { start: 110, end: 112, length: 3, kind: "text", required: true },
  nomePaciente: { start: 113, end: 142, length: 30, kind: "text", required: true },
  dataNascimento: { start: 143, end: 150, length: 8, kind: "digits", required: true },
  racaCor: { start: 151, end: 152, length: 2, kind: "digits", required: true },
  etnia: { start: 153, end: 156, length: 4, kind: "digits" },
  nacionalidade: { start: 157, end: 159, length: 3, kind: "digits", required: true },
  servico: { start: 160, end: 162, length: 3, kind: "digits" },
  classificacao: { start: 163, end: 165, length: 3, kind: "digits" },
  sequenciaEquipe: { start: 166, end: 173, length: 8, kind: "digits" },
  areaEquipe: { start: 174, end: 177, length: 4, kind: "digits" },
  cnpj: { start: 178, end: 191, length: 14, kind: "digits" },
  cep: { start: 192, end: 199, length: 8, kind: "digits" },
  codigoLogradouro: { start: 200, end: 202, length: 3, kind: "digits" },
  logradouro: { start: 203, end: 232, length: 30, kind: "text" },
  complemento: { start: 233, end: 242, length: 10, kind: "text" },
  numero: { start: 243, end: 247, length: 5, kind: "text" },
  bairro: { start: 248, end: 277, length: 30, kind: "text" },
  telefone: { start: 278, end: 288, length: 11, kind: "digits" },
  email: { start: 289, end: 328, length: 40, kind: "raw" },
  ineEquipe: { start: 329, end: 338, length: 10, kind: "digits" },
} as const satisfies Record<string, BpaFieldDefinition>;

export type BpaRegistro03Data = { [K in keyof typeof BPA_I_FIELDS]?: unknown };

/**
 * Fonte única e já resolvida de uma linha BPA-I. Metadados de auditoria não
 * participam do fixed-width, mas acompanham a mesma estrutura usada pelo TXT
 * e pela conferência.
 */
export type BpaRegistroFinal = BpaRegistro03Data & {
  tipoLogradouro?: unknown;
  pacienteId?: unknown;
  profissionalNome?: unknown;
  unidadeNome?: unknown;
  cpfPaciente?: unknown;
  origemAtendimento?: unknown;
  origemSigtap?: unknown;
  categoriaProfissional?: unknown;
};

export interface BpaLayoutIssue {
  field: string;
  start: number;
  end: number;
  value: string;
  problem: string;
  correction: string;
}

export interface BpaBuildResult {
  line: string;
  errors: BpaLayoutIssue[];
  adjustments: BpaLayoutIssue[];
}

export interface BpaSerializedAuditIssue extends BpaLayoutIssue {
  expected: string;
  found: string;
}

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

export function sanitizeBpaText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[\t\r\n]+/g, " ")
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeRaw(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[\t\r\n]+/g, " ")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatField(
  name: string,
  definition: BpaFieldDefinition,
  input: unknown,
  errors: BpaLayoutIssue[],
  adjustments: BpaLayoutIssue[],
): string {
  const original = String(input ?? "");
  const normalized = definition.kind === "digits"
    ? digits(input)
    : definition.kind === "text"
      ? sanitizeBpaText(input)
      : sanitizeRaw(input);

  if (normalized.length > definition.length) {
    adjustments.push({
      field: name,
      start: definition.start,
      end: definition.end,
      value: original,
      problem: `Valor excede ${definition.length} posições e foi limitado no próprio campo`,
      correction: `Revisar o cadastro para manter até ${definition.length} caracteres`,
    });
  }

  const limited = normalized.slice(0, definition.length);
  if (!limited) return " ".repeat(definition.length);
  if (definition.kind === "digits") return limited.padStart(definition.length, "0");
  return limited.padEnd(definition.length, " ");
}

export function buildRegistro03(data: BpaRegistro03Data): BpaBuildResult {
  const errors: BpaLayoutIssue[] = [];
  const adjustments: BpaLayoutIssue[] = [];
  const parts = Object.entries(BPA_I_FIELDS).map(([name, definition]) =>
    formatField(name, definition, data[name as keyof BpaRegistro03Data], errors, adjustments),
  );
  const line = parts.join("");

  if (line.length !== BPA_I_RECORD_LENGTH) {
    errors.push({
      field: "registro03",
      start: 1,
      end: BPA_I_RECORD_LENGTH,
      value: String(line.length),
      problem: `Registro possui ${line.length} posições; esperado ${BPA_I_RECORD_LENGTH}`,
      correction: "Revisar a definição posicional do layout antes de exportar",
    });
  }
  return { line, errors, adjustments };
}

export function readRegistro03Field(line: string, field: keyof typeof BPA_I_FIELDS): string {
  const definition = BPA_I_FIELDS[field];
  return line.slice(definition.start - 1, definition.end);
}

const AUDITED_REGISTRO_FIELDS: Array<keyof typeof BPA_I_FIELDS> = [
  "cnes",
  "competencia",
  "cnsProfissional",
  "cbo",
  "dataAtendimento",
  "procedimento",
  "cnsPaciente",
  "municipioIbge",
  "cid",
  "quantidade",
  "codigoLogradouro",
  "logradouro",
  "numero",
  "bairro",
];

/** Relê a linha fixed-width e prova que os campos críticos não mudaram ao serializar. */
export function auditRegistro03Serialization(
  data: BpaRegistroFinal,
  line: string,
): BpaSerializedAuditIssue[] {
  const issues: BpaSerializedAuditIssue[] = [];
  const cnsInformado = digits(data.cnsPaciente);

  for (const field of AUDITED_REGISTRO_FIELDS) {
    const definition = BPA_I_FIELDS[field];
    const expected = formatField(field, definition, data[field], [], []);
    const found = readRegistro03Field(line, field);
    if (expected !== found) {
      issues.push({
        field,
        start: definition.start,
        end: definition.end,
        value: String(data[field] ?? ""),
        expected,
        found,
        problem: "O valor relido do TXT diverge do registro final usado na conferência",
        correction: "Bloquear o download e revisar somente a serialização deste campo",
      });
    }
  }

  const cnsEncontrado = readRegistro03Field(line, "cnsPaciente");
  if (cnsInformado.length === BPA_I_FIELDS.cnsPaciente.length && /^0+$/.test(cnsEncontrado)) {
    const definition = BPA_I_FIELDS.cnsPaciente;
    issues.push({
      field: "cnsPaciente",
      start: definition.start,
      end: definition.end,
      value: cnsInformado,
      expected: cnsInformado,
      found: cnsEncontrado,
      problem: "CNS existente foi substituído por zeros durante a serialização",
      correction: "Preservar o CNS presente no registro final; nunca aplicar fallback zerado",
    });
  }

  if (!cnsInformado) {
    const definition = BPA_I_FIELDS.cnsPaciente;
    issues.push({
      field: "cnsPaciente",
      start: definition.start,
      end: definition.end,
      value: "",
      expected: "CNS com 15 dígitos",
      found: cnsEncontrado,
      problem: "Registro final sem CNS do paciente",
      correction: "Informar um CNS legítimo no cadastro antes de emitir esta linha",
    });
  }

  return issues;
}

export interface BpaHeaderData {
  competencia: unknown;
  totalRegistros: unknown;
  totalFolhas: unknown;
  campoControle: unknown;
  orgaoOrigem: unknown;
  siglaOrigem: unknown;
  documentoOrigem: unknown;
  orgaoDestino: unknown;
  indicadorDestino: unknown;
  versaoSistema: unknown;
}

export function buildHeaderBpa(data: BpaHeaderData): BpaBuildResult {
  const errors: BpaLayoutIssue[] = [];
  const adjustments: BpaLayoutIssue[] = [];
  const defs: Array<[string, BpaFieldDefinition, unknown]> = [
    ["tipoRegistro", { start: 1, end: 2, length: 2, kind: "digits", required: true }, "01"],
    ["identificacao", { start: 3, end: 7, length: 5, kind: "raw", required: true }, "#BPA#"],
    ["competencia", { start: 8, end: 13, length: 6, kind: "digits", required: true }, data.competencia],
    ["totalRegistros", { start: 14, end: 19, length: 6, kind: "digits", required: true }, data.totalRegistros],
    ["totalFolhas", { start: 20, end: 25, length: 6, kind: "digits", required: true }, data.totalFolhas],
    ["campoControle", { start: 26, end: 29, length: 4, kind: "digits", required: true }, data.campoControle],
    ["orgaoOrigem", { start: 30, end: 59, length: 30, kind: "text", required: true }, data.orgaoOrigem],
    ["siglaOrigem", { start: 60, end: 65, length: 6, kind: "text", required: true }, data.siglaOrigem],
    ["documentoOrigem", { start: 66, end: 79, length: 14, kind: "digits", required: true }, data.documentoOrigem],
    ["orgaoDestino", { start: 80, end: 119, length: 40, kind: "text", required: true }, data.orgaoDestino],
    ["indicadorDestino", { start: 120, end: 120, length: 1, kind: "text", required: true }, data.indicadorDestino === "E" ? "E" : "M"],
    ["versaoSistema", { start: 121, end: 130, length: 10, kind: "text", required: true }, data.versaoSistema],
  ];
  const line = defs.map(([name, def, value]) => formatField(name, def, value, errors, adjustments)).join("");
  if (line.length !== BPA_HEADER_LENGTH) {
    errors.push({
      field: "cabecalho",
      start: 1,
      end: BPA_HEADER_LENGTH,
      value: String(line.length),
      problem: `Cabeçalho possui ${line.length} posições; esperado ${BPA_HEADER_LENGTH}`,
      correction: "Revisar a definição posicional do cabeçalho antes de exportar",
    });
  }
  return { line, errors, adjustments };
}

export function calcularCampoControleBpa(
  itens: Array<{ procedimento: unknown; quantidade: unknown }>,
): string {
  const soma = itens.reduce(
    (total, item) => total + Number(digits(item.procedimento) || 0) + Number(digits(item.quantidade) || 0),
    0,
  );
  return String((soma % 1111) + 1111).padStart(4, "0").slice(-4);
}