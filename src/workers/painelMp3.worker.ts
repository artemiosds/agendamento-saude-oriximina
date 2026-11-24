// SPDX-License-Identifier: GPL-3.0-or-later
// Standalone program: text in, MP3 out. No network, database, DOM or storage access.
import meSpeak from 'mespeak';
import config from 'mespeak/src/mespeak_config.json';
import portuguese from 'mespeak/voices/pt.json';
import { Mp3Encoder } from '@breezystack/lamejs';
import { prependPainelBell, readPainelWav } from '../lib/painelMp3Encoding';

const port = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(value: unknown, transfer?: Transferable[]): void;
};
let consumed = false;
port.onmessage = ({ data }) => {
  if (consumed) return;
  consumed = true;
  const id = data?.id;
  try {
    if (!Number.isSafeInteger(id) || typeof data?.text !== 'string' || !data.text.trim() || data.text.length > 400) {
      throw new Error('Texto de chamada inválido');
    }
    // Remove control characters from the spoken text, never interpret it as markup.
    // eslint-disable-next-line no-control-regex
    const text = data.text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    meSpeak.loadConfig(config);
    meSpeak.loadVoice(portuguese);
    if (!meSpeak.isConfigLoaded() || !meSpeak.isVoiceLoaded('pt')) throw new Error('Voz em português indisponível');
    const wav = meSpeak.speak(text, { rawdata: 'array', speed: 175, voice: 'pt', pitch: 50 });
    if (!wav?.length) throw new Error('Não foi possível gerar a voz');
    const { samples, sampleRate } = readPainelWav(Uint8Array.from(wav));
    const pcm = prependPainelBell(samples, sampleRate);
    const encoder = new Mp3Encoder(1, sampleRate, 64);
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < pcm.length; i += 1152) {
      const chunk = encoder.encodeBuffer(pcm.subarray(i, i + 1152));
      if (chunk.length) chunks.push(Uint8Array.from(chunk));
    }
    chunks.push(Uint8Array.from(encoder.flush()));
    const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    if (size < 100 || size > 256000) throw new Error('Tamanho de áudio inválido');
    const audio = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { audio.set(chunk, offset); offset += chunk.length; }
    port.postMessage({ id, audio: audio.buffer }, [audio.buffer]);
  } catch {
    // Do not log names/text. The caller can keep visual calls and offer retry.
    port.postMessage({ id, error: 'Não foi possível gerar o MP3 local.' });
  }
};
