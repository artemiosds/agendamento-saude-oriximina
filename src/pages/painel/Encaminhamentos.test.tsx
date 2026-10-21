import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  user: { id: 'prof-1', authUserId: 'auth-1', role: 'profissional', unidadeId: 'unit-1', usuario: 'prof' },
  list: vi.fn(), invalidate: vi.fn(), print: vi.fn(), config: vi.fn(),
  from: vi.fn(), calls: [] as Array<{ table: string; columns: string; filters: string[][] }>,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('@/contexts/OperacionalContext', () => ({ useOperacional: () => ({
  funcionarios: [{ id: 'prof-1', unidadeId: 'unit-1', ativo: true, role: 'profissional', nome: 'Emissor', tipoConselho: 'CRFa', numeroConselho: '123', ufConselho: 'PA' }],
  unidades: [{ id: 'unit-1', nome: 'Unidade Um', nomeExibicao: 'Unidade Um' }],
}) }));
vi.mock('@/services/encaminhamentoService', () => ({ listarEncaminhamentos: h.list, invalidarCacheEncaminhamentos: h.invalidate }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: h.from } }));
vi.mock('@/lib/printLayout', () => ({ loadDocumentConfig: h.config, openPrintDocument: h.print,
  buildDocumentShell: (_title: string, body: string) => `<html><body>${body}</body></html>` }));
vi.mock('@/components/ModalVerEncaminhamento', () => ({ default: () => null }));
import Encaminhamentos from './Encaminhamentos';

const doc = { id: 'doc-1', paciente_id: 'patient-1', paciente_nome: 'Ana', profissional_id: 'prof-1', profissional_nome: 'Emissor', unidade_id: 'unit-1', status: 'assinado', tipo_documento: 'Encaminhamento', created_at: '2026-10-01' };
const received = (id: string, unit = 'unit-1') => ({ id, paciente_nome: id, unidade: unit, profissional_origem_id: 'prof-1', profissional_origem_nome: 'Emissor', profissional_destino_id: 'prof-1', status: 'recebido', data_geracao: '2026-10-01' });
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks(); h.calls = [];
  h.user = { id: 'prof-1', authUserId: 'auth-1', role: 'profissional', unidadeId: 'unit-1', usuario: 'prof' };
  h.list.mockResolvedValue([received('Ana'), received('Outra unidade', 'unit-2')]);
  h.config.mockResolvedValue({});
  h.from.mockImplementation((table: string) => {
    const call = { table, columns: '', filters: [] as string[][] }; h.calls.push(call);
    const query = {
      select: (columns: string) => { call.columns = columns; return query; },
      eq: (key: string, value: string) => { call.filters.push([key, value]); return query; },
      in: () => query, order: () => query, range: () => query, abortSignal: () => query,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [doc], error: null }).then(resolve),
      single: async () => ({ data: { ...doc, conteudo_html: '<p>Justificativa original</p><div class="signature">Assinatura original</div>', campos_formulario: { especialidade_destino: 'Fonoaudiologia' } }, error: null }),
      maybeSingle: async () => ({ data: { cpf: '000.000.000-00', cns: '000000000000000', data_nascimento: '2000-01-02' }, error: null }),
    };
    return query;
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); });
function mount() { return render(<QueryClientProvider client={client}><Encaminhamentos /></QueryClientProvider>); }
async function sentTab() {
  fireEvent.mouseDown(screen.getByRole('tab', { name: /Enviados/ }), { button: 0, ctrlKey: false });
  await screen.findByRole('button', { name: 'Ver encaminhamento de Ana' });
}

describe('document-only referrals page', () => {
  it('isolates received units and professional folders, and loads only essential sent columns', async () => {
    mount(); await screen.findByText('Ana');
    expect(screen.queryByText('Outra unidade')).not.toBeInTheDocument();
    expect(h.list).toHaveBeenCalledWith('prof-1', expect.any(String));
    const listQuery = h.calls.find(c => c.table === 'documentos_gerados')!;
    expect(listQuery.columns).toBe('id,tipo_documento,paciente_id,paciente_nome,profissional_id,profissional_nome,status,created_at,unidade_id');
    expect(listQuery.filters).toEqual([['unidade_id', 'unit-1'], ['profissional_id', 'prof-1']]);
    expect(screen.getByLabelText('Indicadores documentais').children).toHaveLength(4);
  });

  it('retains management access to all professional folders within its unit and global owner access', async () => {
    h.user.role = 'gestao';
    const view = mount(); await screen.findByText('Ana');
    expect(h.list).toHaveBeenCalledWith(undefined, expect.any(String));
    expect(h.calls[0].filters).toEqual([['unidade_id', 'unit-1']]);
    h.user = { ...h.user, usuario: 'admin.sms', role: 'master' };
    view.rerender(<QueryClientProvider client={client}><Encaminhamentos /></QueryClientProvider>);
    await screen.findByText('Outra unidade');
    expect(h.calls.filter(c => c.table === 'documentos_gerados').slice(-1)[0]?.filters).toEqual([]);
  });

  it('debounces filters, clamps pagination and never reloads every 30 seconds', async () => {
    h.list.mockResolvedValue(Array.from({ length: 23 }, (_, i) => received(`Paciente ${String(i).padStart(2, '0')}`)));
    mount(); await screen.findByText('Paciente 00');
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText('Buscar paciente nos recebidos'), { target: { value: 'Paciente 01' } });
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(360); });
    expect(screen.getByText('Paciente 01')).toBeInTheDocument();
    expect(screen.queryByText('Paciente 22')).not.toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(31_000); });
    expect(h.list).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(h.invalidate).toHaveBeenCalledTimes(1);
  });

  it('loads HTML only on demand, rechecks document scope, preserves original content and prints', async () => {
    mount(); await screen.findByText('Ana'); await sentTab();
    expect(h.calls.some(c => c.columns.includes('conteudo_html'))).toBe(false);
    expect(screen.queryByTitle('Marcar agendado')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver encaminhamento de Ana' }));
    const frame = await screen.findByTitle('Documento de Ana');
    expect(frame.getAttribute('sandbox')).toBe('');
    for (const text of ['Justificativa original', 'Assinatura original', '000.000.000-00', '000000000000000', 'Fonoaudiologia', 'CRFa 123 PA']) expect(frame.getAttribute('srcdoc')).toContain(text);
    expect(h.calls.find(c => c.columns.includes('conteudo_html'))?.filters).toEqual([['id', 'doc-1'], ['unidade_id', 'unit-1'], ['profissional_id', 'prof-1']]);
    fireEvent.click(screen.getByRole('button', { name: 'Imprimir' }));
    await waitFor(() => expect(h.print).toHaveBeenCalledTimes(1));
    expect(h.calls.filter(c => c.columns.includes('conteudo_html'))).toHaveLength(1);
  });

  it('does not open an old document response after the user changes scope', async () => {
    const view = mount(); await screen.findByText('Ana'); await sentTab();
    let finish!: (value: unknown) => void;
    const originalFrom = h.from.getMockImplementation()!;
    h.from.mockImplementation((table: string) => {
      const query = originalFrom(table);
      if (table === 'documentos_gerados') query.single = () => new Promise(resolve => { finish = resolve; });
      return query;
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ver encaminhamento de Ana' }));
    await waitFor(() => expect(finish).toBeDefined());
    h.user = { ...h.user, id: 'prof-2', authUserId: 'auth-2', unidadeId: 'unit-2' };
    view.rerender(<QueryClientProvider client={client}><Encaminhamentos /></QueryClientProvider>);
    await act(async () => { finish({ data: { ...doc, conteudo_html: '<p>Old scope</p>', campos_formulario: {} }, error: null }); });
    expect(screen.queryByTitle('Documento de Ana')).not.toBeInTheDocument();
  });
});
