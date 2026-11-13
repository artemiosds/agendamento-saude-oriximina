import { describe, expect, it } from 'vitest';
import { normalizePatientCpf, patientCpfError } from './patientCpf';

describe('CPF do paciente', () => {
  it.each(['52998224725', '529.982.247-25', '01234567890'])('aceita %s', (value) => {
    expect(patientCpfError(value)).toBeUndefined();
  });

  it.each(['', null, 52998224725, '5299822472', '52998224726', '11111111111', 'x52998224725'])(
    'rejeita %s em cadastro novo', (value) => {
      expect(patientCpfError(value)).toBeDefined();
    },
  );

  it('normaliza máscara e mantém zero inicial', () => {
    expect(normalizePatientCpf('012.345.678-90')).toBe('01234567890');
  });

  it('só aceita ausência declarada e não usa a exceção para aceitar CPF inválido ou apagar CPF existente', () => {
    expect(patientCpfError('', { semCpf: true })).toBeUndefined();
    expect(patientCpfError('11111111111', { semCpf: true })).toBeDefined();
    expect(patientCpfError('', { semCpf: true, previousCpf: '52998224725' })).toBeDefined();
  });

  it('preserva registros antigos sem validar retroativamente, mas valida qualquer CPF novo', () => {
    expect(patientCpfError('', { previousCpf: '' })).toBeUndefined();
    expect(patientCpfError('12345678900', { previousCpf: '123.456.789-00' })).toBeUndefined();
    expect(patientCpfError('52998224726', { previousCpf: '' })).toBeDefined();
    expect(patientCpfError('52998224725', { previousCpf: '' })).toBeUndefined();
  });
});
