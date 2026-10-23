import { afterEach, describe, expect, it, vi } from 'vitest';
import { carregarVozPainel, escolherVozPainel, textoChamadaPainel } from './painelVoice';

const voice = (name: string, lang = 'pt-BR', isDefault = false) => ({ name, lang, default: isDefault } as SpeechSynthesisVoice);
afterEach(() => vi.useRealTimers());
describe('voz do painel', () => {
  it('prioriza voz natural brasileira e Google antes da voz básica do sistema', () => {
    const basic = voice('Microsoft Maria', 'pt-BR', true);
    const google = voice('Google português do Brasil');
    const natural = voice('Microsoft Francisca Online (Natural)');
    expect(escolherVozPainel([basic, google])).toBe(google);
    expect(escolherVozPainel([basic, google, natural])).toBe(natural);
    expect(escolherVozPainel([voice('Natural', 'pt-PT'), basic])).toBe(basic);
    expect(escolherVozPainel([voice('English', 'en-US')])).toBeUndefined();
  });
  it('aguarda a lista assíncrona do Chrome sem substituir outros listeners', async () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    let voices: SpeechSynthesisVoice[] = [];
    const other = vi.fn(); target.addEventListener('voiceschanged', other);
    const synth = Object.assign(target, { getVoices: () => voices }) as unknown as SpeechSynthesis;
    const pending = carregarVozPainel(synth, new AbortController().signal);
    voices = [voice('Google português do Brasil')]; target.dispatchEvent(new Event('voiceschanged'));
    expect(await pending).toBe(voices[0]); expect(other).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('limita espera e libera listeners ao cancelar uma chamada', async () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    const synth = Object.assign(target, { getVoices: () => [] }) as unknown as SpeechSynthesis;
    const pending = carregarVozPainel(synth, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1200); expect(await pending).toBeUndefined();
    const controller = new AbortController();
    const cancelled = carregarVozPainel(synth, controller.signal);
    const assertion = expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await assertion; expect(vi.getTimerCount()).toBe(0);
  });
  it('usa pausas e texto fluido preservando nome e destino', () => {
    expect(textoChamadaPainel('JOÃO DA SILVA', 'SALA 2')).toBe('Atenção. joão da silva, por favor, compareça à sala 2.');
  });
});
