import { describe, expect, it } from 'vitest';
import { getCidFromBpaCatalog, parseBpaSigtapCatalog } from './bpaSigtapCatalog';

const base = {
  procedimentos: '0301010048'.padEnd(330, ' ') + '202611',
  registros: '', ocupacoes: '', cids: '',
};

describe('dicionário CID-10 do arquivo SIGTAP', () => {
  it('confere código exato e descrição sem transformar o dicionário em lista restritiva', () => {
    const catalog = parseBpaSigtapCatalog('202611', { ...base,
      cidDefinitions: 'Z000' + 'Exame médico geral'.padEnd(100, ' ') + 'extra\r\n'
        + 'Z001' + 'Exame de rotina de saúde da criança'.padEnd(100, ' '),
    });
    expect(getCidFromBpaCatalog(catalog, ' z00.0 ')).toEqual({ codigo: 'Z000', descricao: 'Exame médico geral' });
    expect(getCidFromBpaCatalog(catalog, 'Z001')?.descricao).toBe('Exame de rotina de saúde da criança');
    expect(getCidFromBpaCatalog(catalog, 'Z00')).toBeNull();
    expect(getCidFromBpaCatalog(catalog, 'Z00X')).toBeNull();
    expect(catalog.get('0301010048')?.cids.size).toBe(0);
  });

  it('diferencia arquivo ausente ou inválido de código inexistente', () => {
    for (const cidDefinitions of [undefined, '', 'Z000linha truncada']) {
      const catalog = parseBpaSigtapCatalog('202611', { ...base, cidDefinitions });
      expect(() => getCidFromBpaCatalog(catalog, 'Z000')).toThrow('indisponível');
    }
  });

  it('mantém os dicionários separados por catálogo sem aceitar texto livre', () => {
    const withCode = parseBpaSigtapCatalog('202611', { ...base, cidDefinitions: 'Z000' + 'Exame médico geral'.padEnd(100, ' ') });
    const other = parseBpaSigtapCatalog('202611', { ...base, cidDefinitions: 'Z001' + 'Exame da criança'.padEnd(100, ' ') });
    expect(getCidFromBpaCatalog(other, 'Z000')).toBeNull();
    expect(getCidFromBpaCatalog(withCode, 'Z000')?.codigo).toBe('Z000');
    expect(getCidFromBpaCatalog(withCode, 'Z000 OR 1=1')).toBeNull();
  });
});
