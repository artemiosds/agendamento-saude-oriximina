import { describe, it, expect } from 'vitest';
import { resolveUnitLogo } from './unitLogo';

describe('resolveUnitLogo', () => {
  it('usa a logo da unidade quando cadastrada', () => {
    expect(resolveUnitLogo('https://x/caps.png', 'https://x/inst.png', 'fb')).toBe('https://x/caps.png');
  });
  it('sem logo da unidade, mantém a institucional', () => {
    expect(resolveUnitLogo('', 'https://x/inst.png', 'fb')).toBe('https://x/inst.png');
  });
  it('sem nenhuma, usa o padrão', () => {
    expect(resolveUnitLogo(undefined, '', 'fb')).toBe('fb');
  });
});
