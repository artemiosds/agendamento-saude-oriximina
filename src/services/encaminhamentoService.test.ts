import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ list: vi.fn(), download: vi.fn(), upload: vi.fn(), update: vi.fn(), getSession: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: api.getSession }, storage: { from: () => api },
} }));
import { invalidarCacheEncaminhamentos, listarEncaminhamentos, marcarComoLido, salvarEncaminhamento, type EncaminhamentoData } from './encaminhamentoService';

const record = (id: string): EncaminhamentoData => ({ id, profissional_destino_id: 'prof-1', paciente_nome: 'Paciente de teste', data_geracao: '2026-10-01', status: 'recebido' } as EncaminhamentoData);

beforeEach(() => {
  vi.clearAllMocks();
  invalidarCacheEncaminhamentos();
  api.getSession.mockResolvedValue({ data: { session: { user: { id: 'auth-1' }, access_token: 'session-1' } }, error: null });
  api.list.mockResolvedValue({ data: [{ name: 'one.json', id: 'file' }], error: null });
  api.download.mockResolvedValue({ data: { text: async () => JSON.stringify(record('one')) }, error: null });
});
afterEach(() => vi.useRealTimers());

describe('referral storage performance and cache', () => {
  it('downloads concurrently in bounded batches of six and deduplicates in-flight loads', async () => {
    let active = 0, maxActive = 0;
    api.list.mockResolvedValue({ data: Array.from({ length: 14 }, (_, i) => ({ name: `${i}.json`, id: `file-${i}` })), error: null });
    api.download.mockImplementation(async (path: string) => {
      active++; maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 2));
      active--;
      return { data: { text: async () => JSON.stringify(record(path)) }, error: null };
    });
    const [first, second] = await Promise.all([listarEncaminhamentos('prof-1'), listarEncaminhamentos('prof-1')]);
    expect(first).toHaveLength(14);
    expect(second).toEqual(first);
    expect(maxActive).toBe(6);
    expect(api.download).toHaveBeenCalledTimes(14);
  });

  it('reuses the TTL cache, expires it and allows manual invalidation', async () => {
    vi.useFakeTimers();
    await listarEncaminhamentos('prof-1');
    await listarEncaminhamentos('prof-1');
    expect(api.download).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3 * 60 * 1000 + 1);
    await listarEncaminhamentos('prof-1');
    expect(api.download).toHaveBeenCalledTimes(2);
    invalidarCacheEncaminhamentos();
    await listarEncaminhamentos('prof-1');
    expect(api.download).toHaveBeenCalledTimes(3);
  });

  it('separates professional folders, authorization scopes and sessions', async () => {
    await listarEncaminhamentos('prof-1', 'unit-1');
    await listarEncaminhamentos('prof-2', 'unit-1');
    await listarEncaminhamentos('prof-1', 'unit-2');
    api.getSession.mockResolvedValue({ data: { session: { user: { id: 'auth-2' }, access_token: 'session-2' } }, error: null });
    await listarEncaminhamentos('prof-1', 'unit-1');
    expect(api.download).toHaveBeenCalledTimes(4);
    expect(api.list).not.toHaveBeenCalledWith('', expect.anything());
  });

  it('paginates both root folders and files without silently stopping at the storage limit', async () => {
    api.list.mockImplementation(async (folder: string, options: { offset: number }) => {
      if (!folder) return { data: [{ name: 'prof-1', id: null }, { name: 'root.json', id: 'root-file' }], error: null };
      return { data: options.offset === 0 ? Array.from({ length: 100 }, (_, i) => ({ name: `${i}.json`, id: String(i) })) : [{ name: 'last.json', id: 'last' }], error: null };
    });
    expect(await listarEncaminhamentos()).toHaveLength(101);
    expect(api.list).toHaveBeenCalledWith('prof-1', expect.objectContaining({ offset: 100 }));
  });

  it('does not cache a failed download as a complete inbox', async () => {
    api.download.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    await expect(listarEncaminhamentos('prof-1')).rejects.toThrow('offline');
    expect(await listarEncaminhamentos('prof-1')).toHaveLength(1);
    expect(api.download).toHaveBeenCalledTimes(2);
  });

  it('does not repopulate an invalidated cache with a response started before invalidation', async () => {
    let finish!: (value: unknown) => void;
    api.download.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const old = listarEncaminhamentos('prof-1');
    await vi.waitFor(() => expect(api.download).toHaveBeenCalledTimes(1));
    invalidarCacheEncaminhamentos();
    finish({ data: { text: async () => JSON.stringify(record('old')) }, error: null });
    await old;
    await listarEncaminhamentos('prof-1');
    expect(api.download).toHaveBeenCalledTimes(2);
  });

  it('updates cached read status without downloading all documents again and invalidates on emission', async () => {
    await listarEncaminhamentos('prof-1');
    api.update.mockResolvedValue({ error: null });
    expect(await marcarComoLido(record('one'))).toBe(true);
    expect((await listarEncaminhamentos('prof-1'))[0].status).toBe('lido');
    expect(api.download).toHaveBeenCalledTimes(1);
    api.upload.mockResolvedValue({ error: null });
    const { id: _id, status: _status, data_geracao: _date, ...payload } = record('new');
    await salvarEncaminhamento(payload);
    await listarEncaminhamentos('prof-1');
    expect(api.download).toHaveBeenCalledTimes(2);
  });
});
