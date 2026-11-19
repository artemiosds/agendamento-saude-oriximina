import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConsultaSigtap from './ConsultaSigtap';
import type { BpaSigtapCatalog, BpaSigtapProcedure } from '@/lib/bpaSigtapCatalog';
import type { SigtapConsultationRow } from '@/lib/sigtapConsultation';

const fixture = vi.hoisted(() => ({
  user: { id: 'p1', role: 'profissional' },
  from: vi.fn(),
  reference: '',
  catalog: new Map() as BpaSigtapCatalog,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: fixture.user }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: fixture.from } }));
vi.mock('@/lib/sigtapClinicalValidation', () => ({ resolveProfessionalCboReliable: async () => '223810' }));

const baseRows: SigtapConsultationRow[] = [
  { codigo: '0201012048', nome: 'Consulta em atenção especializada', descricao: null, origem: 'SIGTAP', valor: null },
  { codigo: '0301010056', nome: 'Avaliação funcional', descricao: null, origem: 'SIGTAP', valor: null },
  { codigo: '0202021000', nome: 'Procedimento sem relação', descricao: null, origem: 'SIGTAP', valor: null },
];
const makeRule = (cbos: string[], details: string[]): BpaSigtapProcedure => ({
  instrumentos: new Set(['02']), cbos: new Set(cbos), detalhes: new Set(details), cids: new Set(),
  servicosClassificacoes: new Set(), sexo: '', quantidadeMaxima: null, idadeMinimaMeses: null, idadeMaximaMeses: null,
});

function fakeQueries(rows: SigtapConsultationRow[] = baseRows) {
  fixture.from.mockImplementation((table: string) => {
    const data = table === 'sigtap_procedimentos' ? rows
      : table === 'cbo_codigos' ? [{ codigo: '223810', descricao: 'Profissional de teste' }]
      : [];
    const result = { data, error: null, count: data.length };
    const query = {
      select: () => query, eq: () => query, in: () => query, order: () => query,
      range: async () => result, limit: async () => result,
      then: (handler: (value: typeof result) => unknown) => Promise.resolve(result).then(handler),
    };
    return query;
  });
}
function open() {
  render(<MemoryRouter><ConsultaSigtap /></MemoryRouter>);
}

beforeEach(() => {
  const now = new Date();
  const currentParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit' }).formatToParts(now);
  fixture.reference = (currentParts.find(x => x.type === 'year')?.value ?? '') + (currentParts.find(x => x.type === 'month')?.value ?? '');
  fixture.catalog = new Map([
    [baseRows[0].codigo, makeRule(['223810'], ['048'])],
    [baseRows[1].codigo, makeRule([], ['021'])],
    [baseRows[2].codigo, makeRule([], [])],
  ]);
  fixture.user.role = 'profissional';
  fakeQueries();
  vi.stubGlobal('Worker', class {
    onmessage?: (event: { data: { catalog: BpaSigtapCatalog; reference: string } }) => void;
    postMessage() { queueMicrotask(() => this.onmessage?.({ data: { catalog: fixture.catalog, reference: fixture.reference } })); }
    terminate() {}
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('tela de consulta do SIGTAP', () => {
  it('não confunde ausência de CBO com vínculo confirmado e não exibe coluna sem valores', async () => {
    open();
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('CBO relacionado')).toBeTruthy());
    expect(within(table).getByText('Não exige CBO')).toBeTruthy();
    expect(within(table).getByText('Não confirmado para este mês')).toBeTruthy();
    expect(within(table).queryByRole('columnheader', { name: 'Valor' })).toBeNull();
    expect(screen.queryByLabelText('Ordenar por valor')).toBeNull();
    expect(screen.getByText('O catálogo local não informa valores.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Pesquisar por código ou descrição'), { target: { value: 'consulta 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText('Nenhum procedimento corresponde aos filtros informados.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Pesquisar por código ou descrição'), { target: { value: 'atencao especializada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    fireEvent.click(await within(table).findByRole('button', { name: '02.01.01.204-8' }));
    const detail = await screen.findByRole('dialog');
    expect(within(detail).getByText('Exige CID na competência atual')).toBeTruthy();
    expect(within(detail).getByText('CIDs relacionados')).toBeTruthy();
    expect(within(detail).queryByText('Valor', { exact: true })).toBeNull();
  });

  it('mostra a referência histórica sem rotular vínculos como confirmados para o mês atual', async () => {
    fixture.reference = '202001';
    open();
    await screen.findByText('01/2020', { exact: true });
    const table = screen.getByRole('table');
    expect(within(table).getAllByText('Não confirmado para este mês')).toHaveLength(3);
    expect(within(table).queryByText('CBO relacionado')).toBeNull();
    expect(screen.getByText(/Os filtros de CBO, instrumentos e classificação usam a referência acima/)).toBeTruthy();
  });

  it('mantém Valor na listagem quando houver dados, inclusive valor zero', async () => {
    fakeQueries([{ ...baseRows[0], valor: 0 }, ...baseRows.slice(1)]);
    open();
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Valor' })).toBeTruthy();
    expect(within(table).getByText(/R\$\s*0,00/)).toBeTruthy();
    expect(screen.getByLabelText('Ordenar por valor')).toBeTruthy();
  });
});
