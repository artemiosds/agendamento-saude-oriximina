import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPatientDirectory } from './patientDirectoryService';

const db = vi.hoisted(() => ({ or: vi.fn(), range: vi.fn(), in: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => {
    const query: any = {
      select: () => query,
      or: (...args: unknown[]) => { db.or(...args); return query; },
      in: (...args: unknown[]) => { db.in(...args); return query; },
      order: () => query,
      range: (...args: unknown[]) => db.range(...args),
    };
    return query;
  } },
}));

beforeEach(() => {
  vi.clearAllMocks();
  db.range.mockResolvedValue({ data: [{ id: 'p1', nome: 'PACIENTE' }], count: 1200, error: null });
});

describe('diretório de pacientes', () => {
  it('lê só os primeiros 50 registros na abertura e aplica a unidade e a busca no banco', async () => {
    const result = await fetchPatientDirectory({ unitId: 'u1', search: 'ANA', limit: 50 });
    expect(db.range).toHaveBeenCalledExactlyOnceWith(0, 49);
    expect(db.or).toHaveBeenCalledWith('unidade_id.eq.u1,unidade_id.is.null,unidade_id.eq.');
    expect(db.or).toHaveBeenCalledWith(expect.stringContaining('nome.ilike.%ANA%'));
    expect(result.total).toBe(1200);
  });

  it('não permite leitura ampla quando a unidade do profissional não foi resolvida', async () => {
    await expect(fetchPatientDirectory({ unitId: '' })).rejects.toThrow('Unidade');
    expect(db.range).not.toHaveBeenCalled();
  });

  it('busca apenas os IDs da fila em lotes pequenos, mantendo a unidade', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `p${i}`);
    await fetchPatientDirectory({ unitId: 'u1', ids, full: true });
    expect(db.in).toHaveBeenCalledTimes(2);
    expect(db.in.mock.calls[0][1]).toHaveLength(100);
    expect(db.or).toHaveBeenCalledWith('unidade_id.eq.u1,unidade_id.is.null,unidade_id.eq.');
  });
});
