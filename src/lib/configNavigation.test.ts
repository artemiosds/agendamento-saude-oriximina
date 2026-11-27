import { describe, expect, it } from 'vitest';
import { CONFIG_GROUPS, CONFIG_SECTIONS, resolveConfigTab, searchConfigSections, visibleConfigSections } from './configNavigation';

describe('navegação das configurações', () => {
  it('mantém as 12 seções e identificadores originais, sem duplicação', () => {
    expect(CONFIG_SECTIONS.map(s => s.id).sort()).toEqual(['prontuario','medicamentos','impressao','especialidades','fluxo','carencia','campos','whatsapp','usuarios','unidades','integracoes','sistema'].sort());
    expect(CONFIG_SECTIONS.every(s => CONFIG_GROUPS.some(g => g.id === s.group))).toBe(true);
  });
  it('mantém as duas seções globais restritas, inclusive na busca', () => {
    expect(visibleConfigSections(true)).toHaveLength(12);
    expect(visibleConfigSections(false)).toHaveLength(10);
    expect(searchConfigSections('SIGTAP', false)).toHaveLength(0);
    expect(searchConfigSections('LGPD', false)).toHaveLength(0);
    expect(searchConfigSections('SIGTAP', true).map(s => s.id)).toEqual(['unidades']);
    expect(resolveConfigTab('sistema', false)).toBe('prontuario');
    expect(resolveConfigTab('unidades', false)).toBe('prontuario');
    expect(resolveConfigTab('unidades', true)).toBe('unidades');
  });
  it('busca sem acentos, por palavras múltiplas e termos internos', () => {
    expect(searchConfigSections('EVOLUCAO soap', false).map(s => s.id)).toEqual(['prontuario']);
    expect(searchConfigSections('carencia pos alta', false).map(s => s.id)).toEqual(['carencia']);
    expect(searchConfigSections('google agenda', true).map(s => s.id)).toEqual(['unidades']);
    expect(searchConfigSections('  ', false)).toHaveLength(10);
    expect(searchConfigSections('zzzzzzzz', true)).toHaveLength(0);
    expect(resolveConfigTab('fluxo', false)).toBe('fluxo');
  });
});
