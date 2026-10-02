import JSZip from "jszip";

export interface BpaSigtapProcedure {
  instrumentos: Set<string>;
  cbos: Set<string>;
  sexo: string;
  quantidadeMaxima: number | null;
  idadeMinimaMeses: number | null;
  idadeMaximaMeses: number | null;
  servicosClassificacoes: Set<string>;
  cids: Set<string>;
}

export type BpaSigtapCatalog = Map<string, BpaSigtapProcedure>;

interface BpaSigtapFiles {
  procedimentos: string;
  registros: string;
  ocupacoes: string;
  procedimentosLayout?: string;
  servicos?: string;
  cids?: string;
}

interface LayoutField {
  inicio: number;
  fim: number;
}

const GITHUB_TABLES = "https://api.github.com/repos/RenatoKR/SIGTAP/contents/tabelas";
const cache = new Map<string, Promise<BpaSigtapCatalog>>();

const parseLayout = (layout?: string): Map<string, LayoutField> => {
  const fields = new Map<string, LayoutField>();
  if (!layout) return fields;
  const lines = layout.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return fields;
  const sep = lines[0].includes(";") ? ";" : ",";
  for (const line of lines.slice(1)) {
    const cols = line.split(sep).map((v) => v.trim().replace(/^"|"$/g, ""));
    if (cols.length < 4) continue;
    const nome = cols[0].toUpperCase();
    const inicio = Number(cols[2]);
    const fim = Number(cols[3]);
    if (nome && Number.isInteger(inicio) && Number.isInteger(fim) && inicio > 0 && fim >= inicio) {
      fields.set(nome, { inicio, fim });
    }
  }
  return fields;
};

const readLayoutField = (line: string, layout: Map<string, LayoutField>, name: string): string => {
  const field = layout.get(name.toUpperCase());
  if (!field) return "";
  return line.slice(field.inicio - 1, field.fim);
};

const numericOrNull = (value: string, sentinel = 9999): number | null => {
  const clean = String(value || "").trim();
  if (!/^\d+$/.test(clean)) return null;
  const n = Number(clean);
  return n === sentinel ? null : n;
};

const createProcedure = (): BpaSigtapProcedure => ({
  instrumentos: new Set(),
  cbos: new Set(),
  sexo: "",
  quantidadeMaxima: null,
  idadeMinimaMeses: null,
  idadeMaximaMeses: null,
  servicosClassificacoes: new Set(),
  cids: new Set(),
});

export function parseBpaSigtapCatalog(
  competencia: string,
  files: BpaSigtapFiles,
): BpaSigtapCatalog {
  const catalog = new Map<string, BpaSigtapProcedure>();
  const procLayout = parseLayout(files.procedimentosLayout);
  const useOfficialLayout = procLayout.size > 0;

  for (const line of files.procedimentos.split(/\r?\n/)) {
    if (!line) continue;
    const competenciaLinha = useOfficialLayout
      ? readLayoutField(line, procLayout, "DT_COMPETENCIA")
      : line.slice(330, 336);
    if (competenciaLinha !== competencia) continue;

    const codigo = useOfficialLayout
      ? readLayoutField(line, procLayout, "CO_PROCEDIMENTO")
      : line.slice(0, 10);
    if (!/^\d{10}$/.test(codigo)) continue;

    const item = createProcedure();
    item.sexo = useOfficialLayout
      ? readLayoutField(line, procLayout, "TP_SEXO").trim()
      : line.slice(261, 262);

    // Estes três atributos vêm do próprio tb_procedimento da competência.
    // 9999 significa "não se aplica" no layout do SIGTAP.
    if (useOfficialLayout) {
      item.quantidadeMaxima = numericOrNull(readLayoutField(line, procLayout, "QT_MAXIMA_EXECUCAO"));
      item.idadeMinimaMeses = numericOrNull(readLayoutField(line, procLayout, "VL_IDADE_MINIMA"));
      item.idadeMaximaMeses = numericOrNull(readLayoutField(line, procLayout, "VL_IDADE_MAXIMA"));
    }

    catalog.set(codigo, item);
  }

  for (const line of files.registros.split(/\r?\n/)) {
    if (line.length < 18 || line.slice(12, 18) !== competencia) continue;
    catalog.get(line.slice(0, 10))?.instrumentos.add(line.slice(10, 12));
  }

  for (const line of files.ocupacoes.split(/\r?\n/)) {
    if (line.length < 22 || line.slice(16, 22) !== competencia) continue;
    catalog.get(line.slice(0, 10))?.cbos.add(line.slice(10, 16));
  }

  // Relação oficial procedimento × serviço/classificação.
  for (const line of (files.servicos || "").split(/\r?\n/)) {
    if (line.length < 22 || line.slice(16, 22) !== competencia) continue;
    const proc = catalog.get(line.slice(0, 10));
    if (!proc) continue;
    const servico = line.slice(10, 13);
    const classificacao = line.slice(13, 16);
    if (/^\d{3}$/.test(servico) && /^\d{3}$/.test(classificacao)) {
      proc.servicosClassificacoes.add(`${servico}|${classificacao}`);
    }
  }

  // Relação oficial procedimento × CID. A presença de CID relacionado não
  // torna o CID automaticamente obrigatório; serve para validar um CID informado.
  for (const line of (files.cids || "").split(/\r?\n/)) {
    if (line.length < 21 || line.slice(15, 21) !== competencia) continue;
    const proc = catalog.get(line.slice(0, 10));
    const cid = line.slice(10, 14).trim().toUpperCase();
    if (proc && /^[A-Z0-9]{3,4}$/.test(cid)) proc.cids.add(cid);
  }

  if (catalog.size === 0) throw new Error(`Tabela SIGTAP ${competencia} vazia ou incompatível`);
  return catalog;
}

/** Competência efetivamente usada por catálogo carregado (pode ser anterior à pedida). */
const competenciaUsadaPorCatalogo = new WeakMap<BpaSigtapCatalog, string>();
export const getCompetenciaReferenciaCatalogo = (catalog?: BpaSigtapCatalog | null): string =>
  (catalog && competenciaUsadaPorCatalogo.get(catalog)) || "";

export function loadBpaSigtapCatalog(competencia: string): Promise<BpaSigtapCatalog> {
  if (!/^\d{6}$/.test(competencia)) throw new Error("Competência SIGTAP inválida");
  const cached = cache.get(competencia);
  if (cached) return cached;

  const pending = (async () => {
    const listingResponse = await fetch(GITHUB_TABLES);
    if (!listingResponse.ok) throw new Error(`Tabela SIGTAP indisponível (HTTP ${listingResponse.status})`);
    const listing: Array<{ name: string; download_url: string }> = await listingResponse.json();
    // Usa a competência pedida; se ainda não publicada pelo DATASUS, usa a
    // mais recente disponível anterior a ela (nunca rejeita por competência).
    const candidatos = listing
      .map((file) => ({ file, comp: file.name.match(/^TabelaUnificada_(\d{6})_.*\.zip$/i)?.[1] || "" }))
      .filter((c) => c.comp && c.comp <= competencia && c.file.download_url)
      .sort((a, b) => b.comp.localeCompare(a.comp) || b.file.name.localeCompare(a.file.name));
    const selected = candidatos[0]?.file;
    const competenciaUsada = candidatos[0]?.comp || "";
    if (!selected?.download_url) throw new Error(`Nenhuma tabela SIGTAP disponível até ${competencia}`);

    const zipResponse = await fetch(selected.download_url);
    if (!zipResponse.ok) throw new Error(`Falha ao baixar SIGTAP ${competenciaUsada} (HTTP ${zipResponse.status})`);
    const zip = await JSZip.loadAsync(await zipResponse.arrayBuffer());

    const find = (name: string) => Object.entries(zip.files).find(([filePath]) =>
      filePath.toLowerCase().split("/").pop() === name,
    )?.[1];

    const required = [
      "tb_procedimento.txt",
      "tb_procedimento_layout.txt",
      "rl_procedimento_registro.txt",
      "rl_procedimento_ocupacao.txt",
      "rl_procedimento_servico.txt",
      "rl_procedimento_cid.txt",
    ];
    const entries = required.map(find);
    if (entries.some((entry) => !entry)) {
      throw new Error(
        `SIGTAP ${competenciaUsada} sem arquivos obrigatórios de procedimento, layout, instrumento, CBO, serviço/classificação ou CID`,
      );
    }

    const decoded = await Promise.all(
      entries.map(async (entry) =>
        new TextDecoder("iso-8859-1").decode(await entry!.async("uint8array")),
      ),
    );

    const [procedimentos, procedimentosLayout, registros, ocupacoes, servicos, cids] = decoded;
    const catalog = parseBpaSigtapCatalog(competenciaUsada, {
      procedimentos,
      procedimentosLayout,
      registros,
      ocupacoes,
      servicos,
      cids,
    });
    competenciaUsadaPorCatalogo.set(catalog, competenciaUsada);
    return catalog;
  })();

  cache.set(competencia, pending);
  pending.catch(() => cache.delete(competencia));
  return pending;
}
