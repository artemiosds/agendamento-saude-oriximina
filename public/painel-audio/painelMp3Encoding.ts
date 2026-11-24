// SPDX-License-Identifier: GPL-3.0-or-later
// Part of the isolated MP3 worker program, never imported by the React application.

export function readPainelWav(bytes: Uint8Array): { samples: Int16Array; sampleRate: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (bytes.byteLength < 44 || text(0, 4) !== 'RIFF' || text(8, 4) !== 'WAVE') throw new Error('Formato de voz inválido');
  let sampleRate = 0;
  let pcmStart = 0;
  let pcmLength = 0;
  for (let offset = 12; offset + 8 <= bytes.byteLength;) {
    const size = view.getUint32(offset + 4, true);
    if (offset + 8 + size > bytes.byteLength) throw new Error('Arquivo de voz incompleto');
    const tag = text(offset, 4);
    if (tag === 'fmt ') {
      if (size < 16 || view.getUint16(offset + 8, true) !== 1 ||
          view.getUint16(offset + 10, true) !== 1 || view.getUint16(offset + 22, true) !== 16) {
        throw new Error('A voz deve ser PCM mono de 16 bits');
      }
      sampleRate = view.getUint32(offset + 12, true);
    }
    if (tag === 'data') { pcmStart = offset + 8; pcmLength = size; }
    offset += 8 + size + size % 2;
  }
  if (![16000, 22050, 24000, 32000, 44100, 48000].includes(sampleRate) ||
      !pcmStart || !pcmLength || pcmLength % 2 || pcmLength / 2 > sampleRate * 24) {
    throw new Error('A chamada excedeu o limite de áudio');
  }
  const samples = new Int16Array(pcmLength / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(pcmStart + i * 2, true);
  return { samples, sampleRate };
}

/** Same two-tone bell as the original panel, included in the single MP3 stream. */
export function prependPainelBell(voice: Int16Array, rate: number): Int16Array {
  const pause = Math.round(rate * 1.5);
  const result = new Int16Array(pause + voice.length);
  for (let i = 0; i < Math.round(rate * 1.4); i++) {
    let value = 0;
    for (const [frequency, start] of [[880, 0], [660, 0.45]]) {
      const t = i / rate - start;
      if (t < 0 || t > 0.95) continue;
      const gain = t < 0.03 ? t / 0.03 : Math.exp(-8 * (t - 0.03));
      value += Math.sin(2 * Math.PI * frequency * t) * gain * 0.35;
    }
    result[i] = Math.round(value * 32767);
  }
  result.set(voice, pause);
  return result;
}
