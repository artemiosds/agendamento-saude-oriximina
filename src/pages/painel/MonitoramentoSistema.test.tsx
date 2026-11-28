import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MonitoramentoSistema from './MonitoramentoSistema';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'master', usuario: 'admin.sms' }, isGlobalAdmin: true }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mocks.from, auth: { getSession: mocks.getSession } },
}));

function countQuery(count: number | null, error: { message: string } | null = null) {
  const result={count,error};
  const builder={abortSignal:()=>Promise.resolve(result),gte:()=>builder,lte:()=>builder};
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null });
  mocks.from.mockImplementation((table: string) => ({
    select: (_columns: string, options?: { head?: boolean }) => options?.head
      ? countQuery(table === 'treatment_sessions' ? 14 : 2, table === 'action_logs' ? { message: 'Consulta negada' } : null)
      : { eq: () => ({ order: () => ({limit:()=>({abortSignal:()=>Promise.resolve({data:[],count:0,error:null})})}) }) },
  }));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    checked_at: '2026-11-16T12:00:00Z', database_bytes: 4096,
    buckets: [{ name: 'sms', file_count: 3, used_bytes: 2048, unknown_size_count: 0 }],
  }) }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Monitoramento do Sistema', () => {
  it('mostra contagens reais, falha de consulta e uso agregado sem inventar saldo', async () => {
    render(<MonitoramentoSistema />);
    await screen.findByText('Dados parciais');
    expect(screen.getByText('1 buckets')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Banco de Dados' }), { button: 0, ctrlKey: false });
    expect(screen.getByRole('row', { name: /treatment_sessions 14/ })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /action_logs.*Falha na consulta/ })).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Arquivos e Storage' }), { button: 0, ctrlKey: false });
    expect(screen.getByText('Não calculável')).toBeInTheDocument();
    expect(screen.getAllByText('2 KB').length).toBeGreaterThan(0);
    expect(mocks.from).not.toHaveBeenCalledWith('tratamentos');
    expect(mocks.from).not.toHaveBeenCalledWith('sessoes_tratamento');
  });

  it('não interpreta uma falha do medidor como zero arquivos nem oferece exclusão', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    render(<MonitoramentoSistema />);
    await screen.findAllByText('Não verificado');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Arquivos e Storage' }), { button: 0, ctrlKey: false });
    expect(screen.getByText(/Medidor de armazenamento ainda não disponível/)).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Retenção' }), { button: 0, ctrlKey: false });
    expect(screen.queryByRole('button', { name: 'Limpar Logs Antigos' })).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.from).not.toHaveBeenCalledWith('system_cleanup_logs'));
  });

  it('calcula o saldo somente após receber um limite informado pelo usuário', async () => {
    render(<MonitoramentoSistema />);
    await screen.findByText('1 buckets');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Arquivos e Storage' }), { button: 0, ctrlKey: false });
    expect(screen.getByText('Não calculável')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Limite de arquivos informado (GB)'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar referência' }));
    expect(screen.queryByText('Não calculável')).not.toBeInTheDocument();
    expect(screen.getByText(/Saldo estimado:/)).toBeInTheDocument();
    expect(localStorage.getItem('sms-monitoramento-limite-storage-gb-v1')).toBe('1');
  });
});
