import { beforeEach, describe, expect, it, vi } from 'vitest';
import { autoFixInvalidTreatmentSessions } from './treatmentSessionAutoFix';

const fixture = vi.hoisted(() => ({ rpc: vi.fn(), log: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: fixture.rpc },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(fixture.log);
});

describe('autoajuste de sessões em lote', () => {
  it('contabiliza apenas itens corrigidos e pagina sem uma chamada por sessão', async () => {
    fixture.rpc
      .mockResolvedValueOnce({ data: {
        results: [
          { session_id: 's1', status: 'corrigido' },
          { session_id: 's2', status: 'estado_protegido' },
          { session_id: 's3', status: 'vinculo_inconsistente' },
          { session_id: 's4', status: 'ja_pendente' },
        ], next_cursor: 's4', has_more: true,
      }, error: null })
      .mockResolvedValueOnce({ data: {
        results: [
          { session_id: 's5', status: 'data_valida' },
          { session_id: 's6', status: 'falha', reason: 'erro_na_atualizacao' },
        ], next_cursor: 's6', has_more: false,
      }, error: null });

    const result = await autoFixInvalidTreatmentSessions();
    expect(result).toMatchObject({ scanned: 6, fixed: 1, errors: 1 });
    expect(result.items).toHaveLength(6);
    expect(fixture.rpc).toHaveBeenCalledTimes(2);
    expect(fixture.rpc).toHaveBeenNthCalledWith(1, 'auto_fix_invalid_treatment_sessions_batch',
      { p_after: null, p_limit: 100 });
    expect(fixture.rpc).toHaveBeenNthCalledWith(2, 'auto_fix_invalid_treatment_sessions_batch',
      { p_after: 's4', p_limit: 100 });
  });

  it('informa falha total quando o servidor recusa autorização', async () => {
    fixture.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(autoFixInvalidTreatmentSessions()).rejects.toMatchObject({
      result: { scanned: 0, fixed: 0, errors: 1 },
    });
  });

  it('preserva o número de correções confirmadas se um lote posterior falhar', async () => {
    fixture.rpc
      .mockResolvedValueOnce({ data: {
        results: [{ session_id: 's1', status: 'corrigido' }],
        next_cursor: 's1', has_more: true,
      }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'network failure' } });
    await expect(autoFixInvalidTreatmentSessions()).rejects.toMatchObject({
      result: { scanned: 1, fixed: 1, errors: 1 },
    });
  });

  it('não entra em repetição quando o cursor não avança', async () => {
    fixture.rpc.mockResolvedValue({ data: {
      results: [{ session_id: 's1', status: 'falha' }],
      next_cursor: null, has_more: true,
    }, error: null });
    await expect(autoFixInvalidTreatmentSessions()).rejects.toMatchObject({
      result: { fixed: 0, errors: 1 },
    });
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
  });
});
