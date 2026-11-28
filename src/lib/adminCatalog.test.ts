import { describe, expect, it } from 'vitest';
import { readCompleteCatalog, missingCatalogSeeds, catalogEdit, matchesCatalogSearch } from './adminCatalog';

describe('catálogo administrativo', () => {
  it('consulta todas as páginas, inclusive páginas menores que o limite pedido', async () => {
    const rows = [{id:'a'},{id:'b'},{id:'c'}];
    const calls: number[] = [];
    const result = await readCompleteCatalog(async (from) => { calls.push(from); return rows.slice(from, from + 1); }, 2);
    expect(result).toEqual(rows);
    expect(calls).toEqual([0,1,2,3]);
  });
  it('não retorna catálogo parcial após erro ou duplicação de página', async () => {
    await expect(readCompleteCatalog(async from => { if (from) throw Error('rede'); return [{id:'a'}]; }, 1)).rejects.toThrow('rede');
    await expect(readCompleteCatalog(async () => [{id:'a'}], 1)).rejects.toThrow('mudou');
  });
  it('preserva códigos já existentes, inclusive inativos, e não duplica a entrada', () => {
    const seeds = ['a','b','b','c'].map(codigo_rename => ({codigo_rename}));
    expect(missingCatalogSeeds(seeds, [{codigo_rename:'a'},{codigo_rename:null}]).map(x=>x.codigo_rename)).toEqual(['b','c']);
    expect(() => missingCatalogSeeds([{codigo_rename:''}], [])).toThrow('Código');
  });
  it('gera alteração mínima e condição sobre os valores efetivamente editados', () => {
    const original = {nome:'A', estoque:5, ativo:true};
    expect(catalogEdit(original, {...original,nome:'B'}, ['nome','estoque'])).toEqual({patch:{nome:'B'},expected:{nome:'A'}});
    expect(catalogEdit(original, original, ['nome'])).toEqual({patch:{},expected:{}});
  });
  it('busca sem acentos, múltiplos termos e campos ausentes', () => {
    expect(matchesCatalogSearch('  acido  500 ', ['Ácido',null,'500 mg'])).toBe(true);
    expect(matchesCatalogSearch('inexistente', ['Ácido',undefined])).toBe(false);
    expect(matchesCatalogSearch('', [null])).toBe(true);
  });
});
