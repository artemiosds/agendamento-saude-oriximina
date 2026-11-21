import type { BpaSigtapProcedure } from './bpaSigtapCatalog';
import { avaliarCboSigtap, SIGTAP_DETALHE_NAO_EXIGE_CBO } from './bpaSigtapCatalog';

export type SigtapConsultationRule = Pick<BpaSigtapProcedure, 'instrumentos' | 'cbos' | 'detalhes' | 'servicosClassificacoes'>;
export type SigtapConsultationCatalog = ReadonlyMap<string, SigtapConsultationRule>;

export type SigtapConsultationFilter = 'bpa_c' | 'bpa_i' | 'raas' | 'exige_cid' | 'classificacao';

export interface SigtapConsultationRow {
  codigo: string;
  nome: string;
  descricao: string | null;
  valor: number | null;
}

export const formatSigtapCode = (code: string): string => /^\d{10}$/.test(code)
  ? `${code.slice(0, 2)}.${code.slice(2, 4)}.${code.slice(4, 6)}.${code.slice(6, 9)}-${code.slice(9)}`
  : code;

export const normalizeCidCode = (value: string): string => value.trim().toUpperCase().replace(/\./g, '');

export const formatSigtapCompetence = (value: string): string => /^\d{4}(0[1-9]|1[0-2])$/.test(value)
  ? `${value.slice(4)}/${value.slice(0, 4)}`
  : value;

export type CboConsultationStatus = 'relacionado' | 'nao_relacionado' | 'lista_disponivel' | 'nao_exige' | 'nao_confirmado';

/** Evidence for display only. Does not participate in clinical/BPA validation. */
export function cboStatusForCompetence(
  procedure: SigtapConsultationRule | undefined,
  reference: string,
  competence: string,
  cbo = '',
): CboConsultationStatus {
  if (!procedure || !reference || reference !== competence) return 'nao_confirmado';
  if (procedure.cbos.size > 0) {
    if (!cbo) return 'lista_disponivel';
    return procedure.cbos.has(cbo) ? 'relacionado' : 'nao_relacionado';
  }
  return procedure.detalhes?.has(SIGTAP_DETALHE_NAO_EXIGE_CBO) ? 'nao_exige' : 'nao_confirmado';
}

const searchText = (text: string): string => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim().replace(/\s+/g, ' ');
const codePattern = /^[\d.\s-]+$/;

export const requiresCid = (procedure?: SigtapConsultationRule): boolean | null =>
  procedure?.detalhes === undefined ? null : procedure.detalhes.has('048');

/** Uma regra histórica não confirma a exigência da competência atual. */
export const requiresCidForCompetence = (procedure: SigtapConsultationRule | undefined, reference: string, competence: string): boolean | null =>
  reference === competence ? requiresCid(procedure) : null;

export function matchesSigtapFilter(procedure: SigtapConsultationRule | undefined, filter: SigtapConsultationFilter): boolean {
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
  catalog: SigtapConsultationCatalog | null,
  confirmedCboOnly = false,
): SigtapConsultationRow[] {
  const needle = searchText(term);
  const code = codePattern.test(needle) ? needle.replace(/\D/g, '') : '';
  const activeFilters = [...filters];
  return rows.filter((row) => {
    if (code) {
      if (!codePattern.test(row.codigo) || !row.codigo.replace(/\D/g, '').includes(code)) return false;
    } else if (needle && !searchText(row.nome).includes(needle)
      && !searchText(row.descricao || '').includes(needle)
      && searchText(row.codigo) !== needle) return false;
    if (cidCodes && !cidCodes.has(row.codigo)) return false;
    const rule = catalog?.get(row.codigo);
    // A missing official file must not turn the entire local catalogue into
    // "zero results". The UI labels CBO verification as unavailable.
    if (cbo && catalog) {
      if (!rule || avaliarCboSigtap(rule, cbo) === 'incompativel') return false;
      if (confirmedCboOnly && !rule.cbos.has(cbo)
        && !(rule.cbos.size === 0 && rule.detalhes?.has(SIGTAP_DETALHE_NAO_EXIGE_CBO))) return false;
    }
    return activeFilters.every((filter) => matchesSigtapFilter(rule, filter));
  });
}
