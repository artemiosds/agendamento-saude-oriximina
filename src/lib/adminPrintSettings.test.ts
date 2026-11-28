import {describe,it,expect} from 'vitest';
import {printSettingError,logoExtension,legacyPrintHeader} from './adminPrintSettings';
const original={margens:{superior:20,inferior:20,esquerda:25,direita:20},relatorioEvolucao:{historicoSessoes:5}};
describe('configurações administrativas de impressão',()=>{
 it('valida limites A4 sem alterar valores legados não editados',()=>{
  expect(printSettingError({...original,margens:{...original.margens,superior:4}},original)).toMatch(/Margens/);
  expect(printSettingError({...original,margens:{...original.margens,superior:50}},original)).toBeNull();
  const legacy={...original,margens:{...original.margens,superior:55}};
  expect(printSettingError(legacy,legacy)).toBeNull();
 });
 it('recusa quantidade de sessões fora do limite',()=>{
  expect(printSettingError({...original,relatorioEvolucao:{historicoSessoes:51}},original)).toMatch(/sessões/);
  expect(printSettingError({...original,relatorioEvolucao:{historicoSessoes:1}},original)).toBeNull();
 });
 it('preserva formatos existentes de logo e recusa tipos inesperados',()=>{
  expect(logoExtension('image/svg+xml')).toBe('svg');
  expect(logoExtension('image/jpeg')).toBe('jpg');
  expect(logoExtension('text/html')).toBeNull();
 });
 it('mantém propriedades legadas desconhecidas e sincroniza os campos existentes',()=>{
  const value={linha1:'SMS',linha2:'CER',linha3:'',linha4:'',logoEsquerda:'a',logoCentral:'',logoDireita:'b',mostrarLogoCentral:false};
  expect(legacyPrintHeader(value,{outra:true,linha1:'anterior'})).toEqual({outra:true,...value});
 });
});
