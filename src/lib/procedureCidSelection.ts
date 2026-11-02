import { loadBpaSigtapCatalog, getCompetenciaReferenciaCatalogo } from './bpaSigtapCatalog';
import { procedureService } from '@/services/procedureService';

export interface ProcedureCidOption { codigo: string; descricao: string }
export const normalizeProcedureCid = (code: string) => code.trim().toUpperCase().replace(/\./g, '');

/** Local descriptions are labels only. Membership comes from the exact billing month. */
export async function loadProcedureCidOptions(code: string, competencia: string): Promise<ProcedureCidOption[]> {
  const catalog = await loadBpaSigtapCatalog(competencia);
  const reference = getCompetenciaReferenciaCatalogo(catalog);
  if (reference && reference !== competencia) throw new Error(`Catálogo da competência ${competencia} indisponível. Referência recebida: ${reference}.`);
  const procedure = catalog.get(code);
  if (!procedure) throw new Error(`Procedimento ${code} não encontrado na competência ${competencia}.`);
  const descriptions = await procedureService.getCidsForProcedure(code);
  const labels = new Map(descriptions.map(item => [normalizeProcedureCid(item.codigo), item.descricao]));
  return [...procedure.cids].sort().map(codigo => ({ codigo, descricao: labels.get(codigo) || '' }));
}

/** Never mutate the source record when repeating an old procedure. */
export function partitionProcedureCids(selected: string[], options: ProcedureCidOption[]) {
  const allowed = new Set(options.map(item => normalizeProcedureCid(item.codigo)));
  const accepted: string[] = [];
  const rejected: string[] = [];
  for (const value of selected) {
    const code = normalizeProcedureCid(value);
    // An empty official relation is not a restriction (same rule as BPA validation).
    const target = !allowed.size || allowed.has(code) ? accepted : rejected;
    if (!target.includes(code)) target.push(code);
  }
  return { accepted, rejected };
}
