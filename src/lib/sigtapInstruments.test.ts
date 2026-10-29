import { describe, expect, it } from 'vitest';
import { instrumentoBadge, instrumentoRotulo, isInstrumentRejection, orientacaoInstrumento } from './sigtapInstruments';
describe('instrumentos SIGTAP',()=>{
 it('identifica BPA-C sem afirmar compatibilidade BPA-I',()=>{
  expect(instrumentoBadge(['01'])).toContain('Fora do BPA-I');
  expect(orientacaoInstrumento(['01'])).toContain('Não substitua o código de uma ação coletiva');
 });
 it('distingue AIH de APAC pelos códigos oficiais',()=>{
  expect(instrumentoRotulo(['03','04','05'])).toContain('AIH');
  expect(instrumentoRotulo(['03','04','05'])).not.toContain('APAC');
  expect(instrumentoRotulo(['06','07'])).toContain('APAC');
  expect(instrumentoRotulo(['08'])).toContain('Domiciliar');
  expect(instrumentoRotulo(['09'])).toContain('Psicossocial');
 });
 it('aceita BPA-I quando coexistem outros instrumentos',()=>expect(instrumentoBadge(['01','02','06'])).toBe('BPA-I'));
 it('não transforma catálogo ausente em selo verde',()=>expect(instrumentoBadge([])).toBe('Instrumento não confirmado'));
 it('agrupa mensagens novas e anteriores de instrumento',()=>{
  expect(isInstrumentRejection('Instrumento de registro incompatível com BPA-I: 01')).toBe(true);
  expect(isInstrumentRejection('Instrumento incompatível com BPA-I')).toBe(true);
  expect(isInstrumentRejection('CID incompatível com o procedimento')).toBe(false);
 });
});
