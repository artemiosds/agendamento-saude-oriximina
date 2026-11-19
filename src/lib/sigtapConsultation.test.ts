import { describe, expect, it } from 'vitest';
import { filterSigtapRows, formatSigtapCode, matchesSigtapFilter, normalizeCidCode, requiresCid, type SigtapConsultationRow } from './sigtapConsultation';
import { parseBpaSigtapCatalog, type BpaSigtapCatalog, type BpaSigtapProcedure } from './bpaSigtapCatalog';

const rule = (details: string[], instruments: string[] = [], cbos: string[] = []): BpaSigtapProcedure => ({
  detalhes: new Set(details), instrumentos: new Set(instruments), cbos: new Set(cbos), cids: new Set(),
  sexo: '', quantidadeMaxima: null, idadeMinimaMeses: null, idadeMaximaMeses: null,
  servicosClassificacoes: new Set(),
});

describe('consulta SIGTAP', () => {
  const rows: SigtapConsultationRow[] = [
    { codigo: '0301010048', nome: 'Consulta em atenção especializada', descricao: null, origem: 'SIGTAP', valor: null },
    { codigo: '0301010056', nome: 'Avaliação', descricao: null, origem: 'SIGTAP', valor: null },
  ];
  const catalog: BpaSigtapCatalog = new Map([
    ['0301010048', rule(['048'], ['02'], ['223810'])],
    ['0301010056', rule([], ['01'], ['251510'])],
  ]);

  it('separa CID relacionado da exigência formal do atributo 048', () => {
    expect(requiresCid(catalog.get('0301010048'))).toBe(true);
    expect(requiresCid(catalog.get('0301010056'))).toBe(false);
    expect(requiresCid(undefined)).toBeNull();
    expect(requiresCid({ ...rule([]), detalhes: undefined })).toBeNull();
  });

  it('lê o atributo 048 no arquivo oficial mesmo sem relação de CID', () => {
    const parsed = parseBpaSigtapCatalog('202609', {
      procedimentos: '0301010048'.padEnd(330, ' ') + '202609',
      registros: '030101004802202609', ocupacoes: '', cids: '',
      detalhes: '0301010048048202609',
    });
    expect(parsed.get('0301010048')?.cids.size).toBe(0);
    expect(requiresCid(parsed.get('0301010048'))).toBe(true);
  });

  it('filtra CBO, instrumento e exigência somente com regra conhecida', () => {
    expect(filterSigtapRows(rows, '', '223810', null, new Set(['bpa_i', 'exige_cid']), catalog)).toEqual([rows[0]]);
    expect(filterSigtapRows(rows, 'AVALIA', '', null, new Set(), catalog)).toEqual([rows[1]]);
    expect(filterSigtapRows(rows, '', '', new Set(['0301010056']), new Set(), catalog)).toEqual([rows[1]]);
    expect(matchesSigtapFilter(undefined, 'exige_cid')).toBe(false);
  });

  it('normaliza código e CID sem modificar o identificador oficial', () => {
    expect(formatSigtapCode('0301010048')).toBe('03.01.01.004-8');
    expect(formatSigtapCode('CUSTOM-1')).toBe('CUSTOM-1');
    expect(normalizeCidCode('m54.5')).toBe('M545');
  });
});
