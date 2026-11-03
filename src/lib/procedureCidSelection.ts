import { loadBpaSigtapCatalog, getCompetenciaReferenciaCatalogo } from './bpaSigtapCatalog';
import { procedureService } from '@/services/procedureService';

export interface ProcedureCidOption { codigo: string; descricao: string }
export const normalizeProcedureCid = (code: string) => code.trim().toUpperCase().replace(/\./g, '');

/**
 * Local descriptions are labels only. Membership comes from the billing month's
 * catalog or, when DATASUS has not published it yet, the most recent earlier one
 * (SIGTAP delay must never block clinical registration).
 */
export async function loadProcedureCidOptions(code: string, competencia: string): Promise<ProcedureCidOption[]> {
  const catalog = await loadBpaSigtapCatalog(competencia);
  const reference = getCompetenciaReferenciaCatalogo(catalog) || competencia;
  if (reference > competencia) throw new Error(`Catálogo SIGTAP recebido (${reference}) é posterior à competência ${competencia}.`);
  const procedure = catalog.get(code);
  if (!procedure) throw new Error(`Procedimento ${code} não encontrado no SIGTAP ${reference}.`);
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

/** Manual entry is available only after the exact month's unrestricted relation is confirmed. */
export async function resolveManualProcedureCid(procedure: string, competencia: string, typedCode: string): Promise<ProcedureCidOption> {
  const options = await loadProcedureCidOptions(procedure, competencia);
  if (options.length) throw new Error('Este procedimento possui lista restritiva. Selecione um dos CIDs relacionados.');
  const code = normalizeProcedureCid(typedCode);
  if (!/^[A-Z][0-9]{2}[A-Z0-9]?$/.test(code)) throw new Error('Informe um código CID-10 válido, por exemplo Z000 ou Z00.0.');
  const cid = await procedureService.getCidByCode(code);
  if (!cid) throw new Error(`CID ${code} não encontrado no catálogo CID-10. Confira o código.`);
  return cid;
}
