import { describe, expect, it } from 'vitest';
import { sanitizeVitalInput, validateTriageVitals } from './triageVitals';
const blank = { peso: '', altura: '', temperatura: '', frequenciaCardiaca: '', saturacaoOxigenio: '', glicemia: '' };
describe('sinais vitais antes da gravação', () => {
  it.each(['63000', '9999', '400.01', '0.49', '-1', 'NaN', '1e3'])('rejeita peso %s sem presumir gramas', peso => {
    expect(validateTriageVitals({ ...blank, peso }).errors.peso).toContain('entre 0,5 kg e 400 kg');
  });
  it.each(['63,000', '63.000', '63'])('aceita decimal e normaliza o peso %s', peso => {
    expect(validateTriageVitals({ ...blank, peso }).values.peso).toBe(63);
  });
  it.each(['1,56', '156'])('normaliza altura %s para cm e calcula IMC', altura => {
    const result = validateTriageVitals({ ...blank, peso: '63', altura });
    expect(result.valid).toBe(true); expect(result.values.altura).toBe(156); expect(result.values.imc).toBe(25.89);
  });
  it.each(['300', '9999', '0.1', '3', '19'])('rejeita altura %s após normalização', altura => {
    expect(validateTriageVitals({ ...blank, altura }).errors.altura).toBeTruthy();
  });
  it('mantém sinais vitais opcionais e limites válidos', () => {
    expect(validateTriageVitals(blank).valid).toBe(true);
    expect(validateTriageVitals({ ...blank, peso: '0.5', altura: '20' }).valid).toBe(true);
    expect(validateTriageVitals({ ...blank, peso: '400', altura: '260' }).valid).toBe(true);
  });
  it('bloqueia overflow do IMC derivado sem truncar o valor', () => {
    expect(validateTriageVitals({ ...blank, peso: '400', altura: '20' }).errors.imc).toBeTruthy();
  });
  it('valida todos os sinais e não usa parseFloat parcial', () => {
    const result = validateTriageVitals({ ...blank, temperatura: '99999', frequenciaCardiaca: '72.5', saturacaoOxigenio: '101', glicemia: '10000' });
    expect(Object.keys(result.errors)).toHaveLength(4);
    expect(validateTriageVitals({ ...blank, peso: '63kg' }).valid).toBe(false);
    expect(sanitizeVitalInput('63,0')).toBe('63.0');
  });
});
