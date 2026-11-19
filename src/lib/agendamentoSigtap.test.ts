import { expect, it } from 'vitest';
import { examesAgendados, termoSigtap, usarProcedimentoLegado } from './agendamentoSigtap';
it('preserva a ordem, evita duplicidade e aceita o código principal legado', () => {
  const a={codigo:'0205010040',nome:'A'}, b={codigo:'0205010058',nome:'B'};
  expect(examesAgendados({procedimentos_agendados:[a,b,a]},b.codigo,b.nome)).toEqual([a,b]);
  expect(examesAgendados({},a.codigo,a.nome)).toEqual([a]);
  expect(examesAgendados({})).toEqual([]);
});
it('interpreta termos usuais e códigos formatados', () => {
  expect(termoSigtap('raio-x de tórax')).toBe('radiografia de tórax');
  expect(termoSigtap('ecocardiograma')).toBe('ecocardiografia');
  expect(termoSigtap('02.05.01.004-0')).toBe('0205010040');
});

it('um exame planejado e removido nunca é recuperado como produção pela coluna legada', () => {
  const plano = {procedimentos_agendados:[{codigo:'0205010040',nome:'A'},{codigo:'0205010058',nome:'B'}]};
  expect(usarProcedimentoLegado(plano)).toBe(false);
  expect(usarProcedimentoLegado({procedimentos_agendados:[]})).toBe(false);
  expect(usarProcedimentoLegado({})).toBe(true);
  expect(usarProcedimentoLegado(null)).toBe(true);
});
