import { describe, expect, it } from 'vitest';
import { cboStatusForCompetence, filterSigtapRows, formatSigtapCode, formatSigtapCompetence, matchesSigtapFilter, normalizeCidCode, requiresCid, requiresCidForCompetence, type SigtapConsultationRow } from './sigtapConsultation';
import { parseBpaSigtapCatalog, type BpaSigtapCatalog, type BpaSigtapProcedure } from './bpaSigtapCatalog';

const rule = (details: string[], instruments: string[] = [], cbos: string[] = []): BpaSigtapProcedure => ({
  detalhes: new Set(details), instrumentos: new Set(instruments), cbos: new Set(cbos), cids: new Set(),
  sexo: '', quantidadeMaxima: null, idadeMinimaMeses: null, idadeMaximaMeses: null,
  servicosClassificacoes: new Set(),
});

describe('consulta SIGTAP', () => {
  const rows: SigtapConsultationRow[] = [
    { codigo: '0301010048', nome: 'Consulta em atenção especializada', descricao: null, valor: null },
    { codigo: '0301010056', nome: 'Avaliação', descricao: null, valor: null },
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
    expect(requiresCidForCompetence(rule([]), '202610', '202611')).toBeNull();
    expect(requiresCidForCompetence(rule(['048']), '202611', '202611')).toBe(true);
    expect(requiresCidForCompetence(rule([]), '202611', '202611')).toBe(false);
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
    expect(filterSigtapRows(rows, '', '223810', null, new Set(), null)).toEqual(rows);
    expect(matchesSigtapFilter(undefined, 'exige_cid')).toBe(false);
  });

  it('normaliza código e CID sem modificar o identificador oficial', () => {
    expect(formatSigtapCode('0301010048')).toBe('03.01.01.004-8');
    expect(formatSigtapCode('CUSTOM-1')).toBe('CUSTOM-1');
    expect(normalizeCidCode('m54.5')).toBe('M545');
  });

  it('só pesquisa os dígitos no código quando a busca é numérica ou tem máscara de código', () => {
    const mixedRows = [
      { ...rows[0], codigo: '0201012048', nome: 'Consulta em atenção especializada' },
      { ...rows[1], codigo: '0301010056', nome: 'Consulta 2' },
    ];
    const search = (term: string) => filterSigtapRows(mixedRows, term, '', null, new Set(), null);
    expect(search('consulta 2')).toEqual([mixedRows[1]]);
    expect(search('consulta 3')).toEqual([]);
    expect(search('02.01.01.204-8')).toEqual([mixedRows[0]]);
    expect(search('0201012048')).toEqual([mixedRows[0]]);
  });

  it('encontra nome e descrição com ou sem acentos e espaços adicionais', () => {
    const accented = { ...rows[1], descricao: 'Avaliação de réde' };
    const search = (term: string) => filterSigtapRows([rows[0], accented], term, '', null, new Set(), null);
    expect(search(' ATENCAO   ESPECIALIZADA ')).toEqual([rows[0]]);
    expect(search('avaliação')).toEqual([accented]);
    expect(search('avaliacao')).toEqual([accented]);
    expect(search('avaliacao de rede')).toEqual([accented]);
  });

  it('distingue CBO relacionado, isento, sem evidência e de referência anterior', () => {
    const listed = catalog.get('0301010048');
    expect(cboStatusForCompetence(listed, '202611', '202611', '223810')).toBe('relacionado');
    expect(cboStatusForCompetence(listed, '202611', '202611', '251510')).toBe('nao_relacionado');
    expect(cboStatusForCompetence(listed, '202611', '202611')).toBe('lista_disponivel');
    expect(cboStatusForCompetence(rule(['021']), '202611', '202611', '223810')).toBe('nao_exige');
    expect(cboStatusForCompetence(rule([]), '202611', '202611', '223810')).toBe('nao_confirmado');
    expect(cboStatusForCompetence({ ...rule([]), detalhes: undefined }, '202611', '202611')).toBe('nao_confirmado');
    expect(cboStatusForCompetence(listed, '202610', '202611', '223810')).toBe('nao_confirmado');
    expect(cboStatusForCompetence(rule(['021']), '202610', '202611', '223810')).toBe('nao_confirmado');
    expect(cboStatusForCompetence(listed, '', '202611', '223810')).toBe('nao_confirmado');
    expect(formatSigtapCompetence('202611')).toBe('11/2026');
  });
});
