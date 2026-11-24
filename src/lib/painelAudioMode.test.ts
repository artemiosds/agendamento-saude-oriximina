import { beforeEach, describe, expect, it, vi } from 'vitest';
import { modoAudioPainel, preferenciaAudioPainel, salvarModoAudioPainel } from './painelAudioMode';
import { linkPainelTV } from './painelVideo';
beforeEach(() => localStorage.clear());
describe('opção MP3 por painel', () => {
  it('preserva o link antigo e acrescenta somente a opção solicitada', () => {
    expect(linkPainelTV('https://sms.test', 'CER')).toBe('https://sms.test/painel-tv?unidade=CER');
    expect(linkPainelTV('https://sms.test', 'CER', 'mp3')).toBe('https://sms.test/painel-tv?unidade=CER&audio=mp3');
    expect(modoAudioPainel('desconhecido')).toBe('navegador');
  });
  it('isola a preferência por unidade e prioriza a escolha explícita do link', () => {
    salvarModoAudioPainel('A', 'mp3'); expect(preferenciaAudioPainel('A', null)).toBe('mp3');
    expect(preferenciaAudioPainel('B', null)).toBe('navegador');
    expect(preferenciaAudioPainel('A', 'navegador')).toBe('navegador');
  });
  it('continua funcionando com armazenamento local indisponível', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error(); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error(); });
    expect(preferenciaAudioPainel('A', null)).toBe('navegador'); expect(() => salvarModoAudioPainel('A', 'mp3')).not.toThrow();
    get.mockRestore(); set.mockRestore();
  });
});
