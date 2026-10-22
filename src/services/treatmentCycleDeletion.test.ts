import { describe, expect, it, vi } from 'vitest';
import { deleteTreatmentCycle } from './treatmentCycleDeletion';

describe('exclusão de ciclo de tratamento', () => {
  it('envia a justificativa e confirma os agendamentos removidos em uma única operação', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { sessions_removed: 7, appointments_removed: 4 }, error: null });
    const result = await deleteTreatmentCycle('cycle-1', '  Plano cadastrado incorretamente  ', { rpc } as any);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('delete_treatment_cycle_with_appointments', {
      p_cycle_id: 'cycle-1', p_reason: 'Plano cadastrado incorretamente',
    });
    expect(result).toEqual({ sessions_removed: 7, appointments_removed: 4 });
  });

  it('recusa exclusão sem justificativa e não chama o banco', async () => {
    const rpc = vi.fn();
    await expect(deleteTreatmentCycle('cycle-1', '  ', { rpc } as any)).rejects.toThrow('justificativa');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('não anuncia sucesso quando a transação falha ou não confirma a contagem', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'Sessão com histórico clínico' } })
      .mockResolvedValueOnce({ data: null, error: null });
    await expect(deleteTreatmentCycle('cycle-1', 'Motivo', { rpc } as any)).rejects.toMatchObject({ message: 'Sessão com histórico clínico' });
    await expect(deleteTreatmentCycle('cycle-1', 'Motivo', { rpc } as any)).rejects.toThrow('não confirmou');
  });

  it('explica quando a função ainda não foi publicada no banco sem tentar exclusão parcial', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } });
    await expect(deleteTreatmentCycle('cycle-1', 'Motivo', { rpc } as any)).rejects.toThrow('atualização do banco');
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
