import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConsultaSigtap from './ConsultaSigtap';
import type { BpaSigtapCatalog, BpaSigtapProcedure } from '@/lib/bpaSigtapCatalog';
import type { SigtapConsultationRow } from '@/lib/sigtapConsultation';

const fixture = vi.hoisted(() => ({
  user: { id: 'p1', role: 'profissional' },
  from: vi.fn(),
  print: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  reference: '',
  catalog: new Map() as BpaSigtapCatalog,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: fixture.user }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: fixture.from } }));
vi.mock('@/lib/sigtapClinicalValidation', () => ({ resolveProfessionalCboReliable: async () => '223810' }));

vi.mock('@/lib/printLayout', () => ({ openPrintDocument: fixture.print }));
vi.mock('sonner', () => ({ toast: fixture.toast }));

const baseRows: SigtapConsultationRow[] = [
  { codigo: '0201012048', nome: 'Consulta em atenção especializada', descricao: null, valor: null },
  { codigo: '0301010056', nome: 'Avaliação funcional', descricao: null, valor: null },
  { codigo: '0202021000', nome: 'Procedimento sem relação', descricao: null, valor: null },
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
      abortSignal: () => query, range: async () => result, limit: async () => result,
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
    await waitFor(() => expect(within(table).getByText('1 CBO relacionado')).toBeTruthy());
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

  it('aplica o CBO detectado com evidência oficial e permite voltar à lista geral', async () => {
    open();
    const button = await screen.findByRole('button', { name: 'Ver apenas procedimentos da minha profissão' });
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.getByText(/Profissional de teste/, { selector: 'p' })).toBeInTheDocument();
    fireEvent.click(button);
    const table = screen.getByRole('table');
    expect(within(table).getByText('CBO relacionado')).toBeInTheDocument();
    expect(within(table).getByText('Não exige CBO')).toBeInTheDocument();
    expect(within(table).queryByText(baseRows[2].nome)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exibir todos os procedimentos' }));
    expect(within(table).getByText(baseRows[2].nome)).toBeInTheDocument();
  });

  it('copia o código limpo no cartão móvel sem abrir os detalhes', async () => {
    vi.stubGlobal('innerWidth', 390);
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      open();
      fireEvent.click(await screen.findByRole('button', { name: 'Copiar código 02.01.01.204-8' }));
      expect(writeText).toHaveBeenCalledWith('0201012048');
      expect(await screen.findByRole('button', { name: 'Código copiado 02.01.01.204-8' })).toBeInTheDocument();
      expect(fixture.toast.success).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    } finally {
      if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('tenta a cópia alternativa quando o navegador recusa a área de transferência', async () => {
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const execCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');
    const fallback = vi.fn(() => {
      expect(document.querySelector('textarea')?.value).toBe('0201012048');
      return true;
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('Permissão negada')) },
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: fallback });
    try {
      open();
      fireEvent.click(await screen.findByRole('button', { name: 'Copiar código 02.01.01.204-8' }));
      await waitFor(() => expect(fallback).toHaveBeenCalledWith('copy'));
      expect(fixture.toast.success).toHaveBeenCalledTimes(1);
      expect(document.querySelector('textarea')).toBeNull();
    } finally {
      if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
      else Reflect.deleteProperty(navigator, 'clipboard');
      if (execCommand) Object.defineProperty(document, 'execCommand', execCommand);
      else Reflect.deleteProperty(document, 'execCommand');
    }
  });

  it('imprime só a página exibida e mantém os filtros e o CID coerentes com a referência', async () => {
    fixture.user.role = 'master';
    fixture.reference = '202001';
    fakeQueries(Array.from({ length: 21 }, (_, index) => ({
      ...baseRows[0], codigo: String(201012048 + index).padStart(10, '0'), nome: `Procedimento <${index + 1}>`,
    })));
    open();
    const input = await screen.findByLabelText('Pesquisar por código ou descrição');
    await screen.findByText('01/2020', { exact: true });
    fireEvent.change(input, { target: { value: 'Procedimento <' } });
    fireEvent.submit(input.closest('form')!);
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    fireEvent.change(input, { target: { value: 'texto pendente' } });
    fireEvent.click(screen.getByRole('button', { name: 'Imprimir Tabela (A4)' }));
    await waitFor(() => expect(fixture.print).toHaveBeenCalledTimes(1));
    const [, html, meta] = fixture.print.mock.calls[0];
    expect(html).toContain('Procedimento &lt;21&gt;');
    expect(html).not.toContain('Procedimento &lt;20&gt;');
    expect(html).toContain('<td>Não confirmado</td>');
    expect(meta).toMatchObject({
      'Referência das regras': '01/2020',
      'Filtros aplicados': 'Busca Procedimento &lt;',
      'Resultados impressos': 'Página 2 de 2 · 1 de 21 resultados',
    });
    expect(screen.queryByText(/Seu CBO detectado/)).not.toBeInTheDocument();
  });

});
