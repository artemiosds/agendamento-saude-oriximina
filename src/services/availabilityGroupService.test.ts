import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveAvailabilityGroup } from './availabilityGroupService';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

const group = {
  profissionalId: 'professional', unidadeId: 'unit',
  dataInicio: '2026-11-21', dataFim: '2026-12-31',
};
const regular = {
  salaId: 'room', horaInicio: '08:00', horaFim: '12:00',
  vagasPorHora: 3, vagasPorDia: 12, diasSemana: [1], duracaoConsulta: 20,
};
const shift = {
  ...regular, salaId: 'turno-a', diasSemana: [2],
  vagasPorHora: 0, vagasPorDia: 6, duracaoConsulta: 0,
};

beforeEach(() => rpc.mockReset());

describe('gravação da grade de disponibilidade', () => {
  it('envia todos os horários e a versão anterior numa única operação', async () => {
    rpc.mockResolvedValue({ data: 2, error: null });

    await saveAvailabilityGroup(['old1', 'old2'], group, [regular, shift]);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('save_availability_group', {
      p_previous_ids: ['old1', 'old2'],
      p_profissional_id: 'professional',
      p_unidade_id: 'unit',
      p_data_inicio: '2026-11-21',
      p_data_fim: '2026-12-31',
      p_slots: [
        { sala_id: 'room', hora_inicio: '08:00', hora_fim: '12:00', vagas_por_hora: 3, vagas_por_dia: 12, dias_semana: [1], duracao_consulta: 20 },
        { sala_id: 'turno-a', hora_inicio: '08:00', hora_fim: '12:00', vagas_por_hora: 0, vagas_por_dia: 6, dias_semana: [2], duracao_consulta: 0 },
      ],
    });
  });

  it('repassa falhas e rejeita respostas que confirmam só parte da grade', async () => {
    const error = { code: '42501', message: 'Acesso não autorizado' };
    rpc.mockResolvedValueOnce({ data: null, error }).mockResolvedValueOnce({ data: 1, error: null });
    await expect(saveAvailabilityGroup(['old'], group, [regular])).rejects.toBe(error);
    await expect(saveAvailabilityGroup(['old'], group, [regular, shift])).rejects.toThrow('O banco não confirmou todos os horários');
  });

  it('confirma a quantidade de horários na exclusão de um grupo', async () => {
    rpc.mockResolvedValue({ data: 2, error: null });
    await expect(saveAvailabilityGroup(['old1', 'old2'], group, [])).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('save_availability_group', expect.objectContaining({
      p_previous_ids: ['old1', 'old2'], p_slots: [],
    }));
  });
});
