import JSZip from "jszip";

export interface BpaSigtapProcedure {
  instrumentos: Set<string>;
  cbos: Set<string>;
  sexo: string;
}

export type BpaSigtapCatalog = Map<string, BpaSigtapProcedure>;

const GITHUB_TABLES = "https://api.github.com/repos/RenatoKR/SIGTAP/contents/tabelas";
const cache = new Map<string, Promise<BpaSigtapCatalog>>();

export function parseBpaSigtapCatalog(
  competencia: string,
  files: { procedimentos: string; registros: string; ocupacoes: string },
): BpaSigtapCatalog {
  const catalog = new Map<string, BpaSigtapProcedure>();
  for (const line of files.procedimentos.split(/\r?\n/)) {
    if (line.length < 336 || line.slice(330, 336) !== competencia) continue;
    const codigo = line.slice(0, 10);
    if (/^\d{10}$/.test(codigo)) {
      catalog.set(codigo, { instrumentos: new Set(), cbos: new Set(), sexo: line.slice(261, 262) });
    }
  }
  for (const line of files.registros.split(/\r?\n/)) {
    if (line.length < 18 || line.slice(12, 18) !== competencia) continue;
    catalog.get(line.slice(0, 10))?.instrumentos.add(line.slice(10, 12));
  }
  for (const line of files.ocupacoes.split(/\r?\n/)) {
    if (line.length < 22 || line.slice(16, 22) !== competencia) continue;
    catalog.get(line.slice(0, 10))?.cbos.add(line.slice(10, 16));
  }
  if (catalog.size === 0) throw new Error(`Tabela SIGTAP ${competencia} vazia ou incompatível`);
  return catalog;
}

export function loadBpaSigtapCatalog(competencia: string): Promise<BpaSigtapCatalog> {
  if (!/^\d{6}$/.test(competencia)) throw new Error("Competência SIGTAP inválida");
  const cached = cache.get(competencia);
  if (cached) return cached;
  const pending = (async () => {
    const listingResponse = await fetch(GITHUB_TABLES);
    if (!listingResponse.ok) throw new Error(`Tabela SIGTAP indisponível (HTTP ${listingResponse.status})`);
    const listing: Array<{ name: string; download_url: string }> = await listingResponse.json();
    const matches = listing.filter((file) =>
      new RegExp(`^TabelaUnificada_${competencia}_.*\\.zip$`, "i").test(file.name),
    );
    const selected = matches.sort((a, b) => b.name.localeCompare(a.name))[0];
    if (!selected?.download_url) throw new Error(`Tabela SIGTAP da competência ${competencia} não disponível`);
    const zipResponse = await fetch(selected.download_url);
    if (!zipResponse.ok) throw new Error(`Falha ao baixar SIGTAP ${competencia} (HTTP ${zipResponse.status})`);
    const zip = await JSZip.loadAsync(await zipResponse.arrayBuffer());
    const find = (name: string) => Object.entries(zip.files).find(([path]) =>
      path.toLowerCase().split("/").pop() === name,
    )?.[1];
    const required = ["tb_procedimento.txt", "rl_procedimento_registro.txt", "rl_procedimento_ocupacao.txt"];
    const entries = required.map(find);
    if (entries.some((entry) => !entry)) throw new Error(`SIGTAP ${competencia} sem arquivos de procedimento, instrumento ou CBO`);
    const [procedimentos, registros, ocupacoes] = await Promise.all(
      entries.map(async (entry) => new TextDecoder("iso-8859-1").decode(await entry!.async("uint8array"))),
    );
    return parseBpaSigtapCatalog(competencia, { procedimentos, registros, ocupacoes });
  })();
  cache.set(competencia, pending);
  pending.catch(() => cache.delete(competencia));
  return pending;
}
