import type { BpaSigtapCatalog, BpaSigtapProcedure } from './bpaSigtapCatalog';
import { avaliarCboSigtap } from './bpaSigtapCatalog';

export type SigtapConsultationFilter = 'bpa_c' | 'bpa_i' | 'raas' | 'exige_cid' | 'classificacao';

export interface SigtapConsultationRow {
  codigo: string;
  nome: string;
  descricao: string | null;
  origem: string | null;
  valor: number | null;
}

export const formatSigtapCode = (code: string): string => /^\d{10}$/.test(code)
  ? `${code.slice(0, 2)}.${code.slice(2, 4)}.${code.slice(4, 6)}.${code.slice(6, 9)}-${code.slice(9)}`
  : code;

export const normalizeCidCode = (value: string): string => value.trim().toUpperCase().replace(/\./g, '');

export const requiresCid = (procedure?: BpaSigtapProcedure): boolean | null =>
  procedure?.detalhes === undefined ? null : procedure.detalhes.has('048');

/** Uma regra histórica não confirma a exigência da competência atual. */
export const requiresCidForCompetence = (procedure: BpaSigtapProcedure | undefined, reference: string, competence: string): boolean | null =>
  reference === competence ? requiresCid(procedure) : null;

export function matchesSigtapFilter(procedure: BpaSigtapProcedure | undefined, filter: SigtapConsultationFilter): boolean {
  if (!procedure) return false;
  switch (filter) {
    case 'bpa_c': return procedure.instrumentos.has('01');
    case 'bpa_i': return procedure.instrumentos.has('02');
    case 'raas': return procedure.instrumentos.has('08') || procedure.instrumentos.has('09');
    case 'exige_cid': return requiresCid(procedure) === true;
    case 'classificacao': return procedure.servicosClassificacoes.size > 0;
  }
}

export function filterSigtapRows(
  rows: SigtapConsultationRow[],
  term: string,
  cbo: string,
  cidCodes: ReadonlySet<string> | null,
  filters: ReadonlySet<SigtapConsultationFilter>,
  catalog: BpaSigtapCatalog | null,
): SigtapConsultationRow[] {
  const needle = term.trim().toLocaleLowerCase('pt-BR');
  const digits = needle.replace(/\D/g, '');
  return rows.filter((row) => {
    if (needle && !row.nome.toLocaleLowerCase('pt-BR').includes(needle)
      && !row.codigo.includes(digits || needle)
      && !(row.descricao || '').toLocaleLowerCase('pt-BR').includes(needle)) return false;
    if (cidCodes && !cidCodes.has(row.codigo)) return false;
    const rule = catalog?.get(row.codigo);
    // A missing official file must not turn the entire local catalogue into
    // "zero results". The UI labels CBO verification as unavailable.
    if (cbo && catalog && (!rule || avaliarCboSigtap(rule, cbo) === 'incompativel')) return false;
    return [...filters].every((filter) => matchesSigtapFilter(rule, filter));
  });
}
