import { describe, expect, it } from 'vitest';
import {
  calculateExternalCapacity, classifyExternalQuota, classifyExternalQuotaForAvailabilities, isQuotaConfigurationUsable,
  quotaAllowsSlot, quotaMatchesAvailability, type ExternalQuotaWindow,
} from './externalQuota';

const quota: ExternalQuotaWindow = {
  profissional_interno_id: 'prof-1',
  unidade_id: 'unit-1', periodo_inicio: '2026-10-01', periodo_fim: '2026-12-31',
  turno: 'manha', horario_inicio: '07:30', horario_fim: '11:30', dia_semana: null,
  ativo: true, vagas_total: 10, vagas_usadas: 0,
};

describe('cota externa do período', () => {
  it('rejeita unidade vazia e horário igual fora do turno integral', () => {
    expect(isQuotaConfigurationUsable({ ...quota, unidade_id: '' })).toBe(false);
    expect(isQuotaConfigurationUsable({ ...quota, horario_fim: '07:30' })).toBe(false);
  });
  it('aceita horários iguais legados no turno integral', () => {
    expect(quotaAllowsSlot({ ...quota, turno: 'integral', horario_fim: '07:30' }, 'unit-1', '2026-10-15', '16:00')).toBe(true);
  });
  it('exige unidade, período e faixa horária exatos', () => {
    expect(quotaAllowsSlot(quota, 'unit-2', '2026-10-15', '08:00')).toBe(false);
    expect(quotaAllowsSlot(quota, 'unit-1', '2027-01-01', '08:00')).toBe(false);
    expect(quotaAllowsSlot(quota, 'unit-1', '2026-10-15', '11:30')).toBe(false);
    expect(quotaAllowsSlot(quota, 'unit-1', '2026-10-15', '07:30')).toBe(true);
  });
  it('conta saldo no período, sem multiplicá-lo pelos dias', () => {
    expect(quotaAllowsSlot({ ...quota, vagas_usadas: 10 }, 'unit-1', '2026-10-15', '08:00')).toBe(false);
    expect(quotaAllowsSlot({ ...quota, vagas_usadas: 9 }, 'unit-1', '2026-10-16', '08:00')).toBe(true);
  });
  it('respeita o dia da semana configurado', () => {
    expect(quotaAllowsSlot({ ...quota, dia_semana: 4 }, 'unit-1', '2026-10-15', '08:00')).toBe(true);
    expect(quotaAllowsSlot({ ...quota, dia_semana: 5 }, 'unit-1', '2026-10-15', '08:00')).toBe(false);
  });
});

describe('reserva externa em data específica', () => {
  const specific = { ...quota, periodo_inicio: '2026-10-15', periodo_fim: '2026-10-15' };
  const availability = {
    profissionalId: 'prof-1', unidadeId: 'unit-1', date: '2026-10-15',
    horaInicio: '07:30', horaFim: '11:30',
  };

  it('não transforma uma cota de período em reserva diária', () => {
    expect(classifyExternalQuota(quota, '2026-10-15')).toBe('limite_periodo');
    expect(quotaMatchesAvailability(quota, availability, 1)).toBe(false);
  });

  it('exige correspondência exata de profissional, unidade, data e faixa', () => {
    expect(quotaMatchesAvailability(specific, availability, 1)).toBe(true);
    expect(quotaMatchesAvailability({ ...specific, unidade_id: 'unit-2' }, availability, 1)).toBe(false);
    expect(quotaMatchesAvailability({ ...specific, profissional_interno_id: 'prof-2' }, availability, 1)).toBe(false);
    expect(quotaMatchesAvailability({ ...specific, horario_fim: '12:00' }, availability, 1)).toBe(false);
  });

  it('não distribui cota integral ambiguamente entre vários turnos', () => {
    expect(quotaMatchesAvailability({ ...specific, turno: 'integral' }, availability, 2)).toBe(false);
    expect(quotaMatchesAvailability({ ...specific, turno: 'integral' }, availability, 1)).toBe(true);
  });

  it('classifica a reserva como inválida quando não há disponibilidade exata', () => {
    expect(classifyExternalQuotaForAvailabilities(specific, '2026-10-15', [
      { ...availability, horaFim: '12:00' },
    ])).toBe('configuracao_invalida');
  });

  it('confirma a reserva somente quando a disponibilidade é inequívoca', () => {
    expect(classifyExternalQuotaForAvailabilities(specific, '2026-10-15', [availability]))
      .toBe('reserva_data_especifica');
  });

  it('protege 10 vagas dentro da capacidade total de 30', () => {
    expect(calculateExternalCapacity({
      capacidadeTotal: 30, reservasConfiguradas: [10], ocupacaoExterna: 3, ocupacaoInterna: 18,
    })).toMatchObject({
      reservaExternaConfigurada: 10, reservaExternaRestante: 7,
      capacidadeInterna: 20, vagasInternasLivres: 2, vagasTotaisLivres: 9,
    });
  });

  it('limita reservas somadas à capacidade e sinaliza conflito', () => {
    expect(calculateExternalCapacity({
      capacidadeTotal: 30, reservasConfiguradas: [20, 15], ocupacaoExterna: 0, ocupacaoInterna: 0,
    })).toMatchObject({ reservaExternaConfigurada: 30, conflitoReserva: true });
  });

  it('não reserva cota inativa, vencida ou sem unidade', () => {
    expect(quotaMatchesAvailability({ ...specific, ativo: false }, availability, 1)).toBe(false);
    expect(quotaMatchesAvailability({ ...specific, periodo_inicio: '2026-10-14', periodo_fim: '2026-10-14' }, availability, 1)).toBe(false);
    expect(quotaMatchesAvailability({ ...specific, unidade_id: '' }, availability, 1)).toBe(false);
  });

  it('não reserva para outro dia da semana', () => {
    expect(quotaMatchesAvailability({ ...specific, dia_semana: 5 }, availability, 1)).toBe(false);
  });

  it('mantém capacidade integral quando não existe reserva', () => {
    expect(calculateExternalCapacity({
      capacidadeTotal: 30, reservasConfiguradas: [], ocupacaoExterna: 0, ocupacaoInterna: 12,
    })).toMatchObject({ vagasInternasLivres: 18, vagasTotaisLivres: 18 });
  });

  it('não permite que a soma calculada ultrapasse a capacidade total', () => {
    expect(calculateExternalCapacity({
      capacidadeTotal: 30, reservasConfiguradas: [10], ocupacaoExterna: 10, ocupacaoInterna: 20,
    })).toMatchObject({ vagasInternasLivres: 0, vagasTotaisLivres: 0 });
  });

  it('detecta saldo esgotado sem tornar a configuração inválida', () => {
    const exhausted = { ...quota, vagas_usadas: quota.vagas_total };
    expect(classifyExternalQuota(exhausted, '2026-10-15')).toBe('limite_periodo');
    expect(quotaAllowsSlot(exhausted, 'unit-1', '2026-10-15', '08:00')).toBe(false);
  });

  it('classifica horário incoerente como configuração inválida', () => {
    expect(classifyExternalQuota({ ...specific, horario_inicio: '11:30', horario_fim: '07:30' }))
      .toBe('configuracao_invalida');
  });

  it('não reserva em outra faixa de horário', () => {
    expect(quotaMatchesAvailability(specific, { ...availability, horaInicio: '13:00', horaFim: '17:00' }, 1))
      .toBe(false);
  });

  it('não reserva fora da data específica', () => {
    expect(quotaMatchesAvailability(specific, { ...availability, date: '2026-10-16' }, 1)).toBe(false);
  });

  it('soma reservas válidas abaixo da capacidade', () => {
    expect(calculateExternalCapacity({
      capacidadeTotal: 30, reservasConfiguradas: [4, 6], ocupacaoExterna: 0, ocupacaoInterna: 0,
    })).toMatchObject({ reservaExternaConfigurada: 10, conflitoReserva: false, vagasInternasLivres: 20 });
  });

  it('reduz o saldo reservado conforme o externo agenda', () => {
    expect(calculateExternalCapacity({
      capacidadeTotal: 30, reservasConfiguradas: [10], ocupacaoExterna: 7, ocupacaoInterna: 0,
    }).reservaExternaRestante).toBe(3);
  });

  it('normaliza entradas negativas sem criar capacidade', () => {
    expect(calculateExternalCapacity({
      capacidadeTotal: -1, reservasConfiguradas: [-10], ocupacaoExterna: -2, ocupacaoInterna: -3,
    })).toMatchObject({ capacidadeTotal: 0, reservaExternaConfigurada: 0, vagasTotaisLivres: 0 });
  });

  it('rejeita período invertido e profissional ausente', () => {
    expect(classifyExternalQuota({ ...quota, periodo_inicio: '2026-12-31', periodo_fim: '2026-10-01' }))
      .toBe('configuracao_invalida');
    expect(classifyExternalQuota({ ...quota, profissional_interno_id: '' }))
      .toBe('configuracao_invalida');
  });

  it('rejeita contador usado acima do total', () => {
    expect(classifyExternalQuota({ ...quota, vagas_usadas: 11 })).toBe('configuracao_invalida');
  });
});
