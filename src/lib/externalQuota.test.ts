import { describe, expect, it } from 'vitest';
import { isQuotaConfigurationUsable, quotaAllowsSlot, type ExternalQuotaWindow } from './externalQuota';

const quota: ExternalQuotaWindow = {
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
