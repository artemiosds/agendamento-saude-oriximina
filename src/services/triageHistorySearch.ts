import { supabase } from '@/integrations/supabase/client';

export const TRIAGE_INDEX_COLUMNS = 'id, agendamento_id, tecnico_id, classificacao_risco, criado_em, confirmado_em, custom_data';
const QUERY_PAGE_SIZE = 1000;
const ID_BATCH_SIZE = 100;

export const normalizePatientSearch = (value: string) => value.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim().replace(/\s+/g, ' ');

/** Literal, accent-insensitive POSIX pattern; user input cannot introduce regex operators. */
export function patientNamePattern(value: string): string {
  const accents: Record<string, string> = {
    a: '[aáàâãä]', e: '[eéèêë]', i: '[iíìîï]', o: '[oóòôõö]', u: '[uúùûü]', c: '[cç]', n: '[nñ]',
  };
  return [...normalizePatientSearch(value)].map(char =>
    char === ' ' ? '[[:space:]]+' : accents[char] || char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  ).join('');
}

interface IndexRow { id: string; criado_em: string | null }

/** Searches names first. Never walks unrelated triage pages to find a patient. */
export async function searchTriageHistoryIndex<T extends IndexRow>(
  search: string,
  // Generated Supabase types cannot infer a dynamic projection.
  makeTriageQuery: (columns: string) => any,
  signal: AbortSignal,
): Promise<T[]> {
  const pattern = patientNamePattern(search);
  if (!pattern) return [];
  const assertActive = () => { if (signal.aborted) throw new DOMException('Pesquisa cancelada', 'AbortError'); };
  const pages = async <R,>(makeQuery: () => any): Promise<R[]> => {
    const rows: R[] = [];
    for (let offset = 0; ; offset += QUERY_PAGE_SIZE) {
      assertActive();
      const { data, error } = await makeQuery().range(offset, offset + QUERY_PAGE_SIZE - 1).abortSignal(signal);
      assertActive();
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < QUERY_PAGE_SIZE) return rows;
    }
  };
  const byName = (table: 'pacientes' | 'agendamentos' | 'fila_espera', column: string) =>
    pages<{ id: string }>(() => supabase.from(table).select('id').filter(column, 'imatch', pattern).order('id'));
  const [patients, appointments, queue, snapshots] = await Promise.all([
    byName('pacientes', 'nome'),
    byName('agendamentos', 'paciente_nome'),
    byName('fila_espera', 'paciente_nome'),
    pages<T>(() => makeTriageQuery(TRIAGE_INDEX_COLUMNS).filter('custom_data->>paciente_nome', 'imatch', pattern)),
  ]);
  assertActive();
  const appointmentIds = new Set([...appointments, ...queue].map(row => row.id));
  const patientIds = [...new Set(patients.map(row => row.id))];
  for (let offset = 0; offset < patientIds.length; offset += ID_BATCH_SIZE) {
    const ids = patientIds.slice(offset, offset + ID_BATCH_SIZE);
    const linked = await Promise.all((['agendamentos', 'fila_espera'] as const).map(table =>
      pages<{ id: string }>(() => supabase.from(table).select('id').in('paciente_id', ids).order('id')),
    ));
    linked.flat().forEach(row => appointmentIds.add(row.id));
  }
  const records = new Map(snapshots.map(row => [row.id, row]));
  const ids = [...appointmentIds];
  for (let offset = 0; offset < ids.length; offset += ID_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + ID_BATCH_SIZE);
    const rows = await pages<T>(() => makeTriageQuery(TRIAGE_INDEX_COLUMNS).in('agendamento_id', batch));
    rows.forEach(row => records.set(row.id, row));
  }
  assertActive();
  // Same ordering as criado_em DESC, id DESC, including PostgreSQL's NULLS FIRST.
  return [...records.values()].sort((a, b) => {
    if (a.criado_em === null && b.criado_em !== null) return -1;
    if (b.criado_em === null && a.criado_em !== null) return 1;
    return (b.criado_em || '').localeCompare(a.criado_em || '') || b.id.localeCompare(a.id);
  });
}
