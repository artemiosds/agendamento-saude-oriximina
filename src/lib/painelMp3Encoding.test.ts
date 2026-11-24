import { describe, expect, it } from 'vitest';
import { prependPainelBell, readPainelWav } from './painelMp3Encoding';

function wav() {
  const bytes = new Uint8Array(48); const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => bytes.set([...value].map(c => c.charCodeAt(0)), offset);
  text(0, 'RIFF'); view.setUint32(4, 40, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 22050, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, 4, true);
  view.setInt16(44, -321, true); view.setInt16(46, 123, true); return bytes;
}
describe('codificação limitada de chamadas', () => {
  it('lê PCM real sem alterar as amostras da fala', () => {
    const voice = readPainelWav(wav()); expect(voice.sampleRate).toBe(22050); expect([...voice.samples]).toEqual([-321, 123]);
    const withBell = prependPainelBell(voice.samples, voice.sampleRate);
    expect([...withBell.slice(-2)]).toEqual([-321, 123]); expect(withBell.length).toBe(33077);
    expect(withBell.slice(0, 30000).some(sample => sample !== 0)).toBe(true);
  });
  it('rejeita cabeçalho ausente, WAV truncado e voz estéreo', () => {
    expect(() => readPainelWav(new Uint8Array(4))).toThrow();
    const truncated = wav(); new DataView(truncated.buffer).setUint32(40, 1000, true);
    expect(() => readPainelWav(truncated)).toThrow('incompleto');
    const stereo = wav(); new DataView(stereo.buffer).setUint16(22, 2, true);
    expect(() => readPainelWav(stereo)).toThrow('mono');
  });
  it('rejeita formato e frequência não suportados antes do encoder', () => {
    const float = wav(); new DataView(float.buffer).setUint16(20, 3, true); expect(() => readPainelWav(float)).toThrow();
    const rate = wav(); new DataView(rate.buffer).setUint32(24, 1, true); expect(() => readPainelWav(rate)).toThrow();
  });
});
