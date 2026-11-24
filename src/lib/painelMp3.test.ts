import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PainelMp3Player } from './painelMp3';
import { PAINEL_MP3_UNLOCK, PAINEL_VOICE_TEST } from './painelAudioMode';

class AudioStub extends EventTarget {
  src = ''; muted = true; volume = 0; preload = '';
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn(); load = vi.fn();
  removeAttribute = vi.fn(() => { this.src = ''; });
}
class WorkerStub {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn(); terminate = vi.fn();
  reply(audio: unknown = mp3(), id = this.postMessage.mock.calls[0][0].id) { this.onmessage?.({ data: { id, audio } }); }
}
function mp3() { const bytes = new Uint8Array(128); bytes.set([0xff, 0xfb, 0x90]); return bytes.buffer; }
let audio: AudioStub;
let workers: WorkerStub[];
let player: PainelMp3Player;
let signal: AbortSignal;
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
beforeEach(() => {
  vi.useFakeTimers(); audio = new AudioStub(); workers = []; signal = new AbortController().signal;
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:voice'), revokeObjectURL: vi.fn() });
  player = new PainelMp3Player(audio as unknown as HTMLAudioElement, () => {
    const worker = new WorkerStub(); workers.push(worker); return worker as unknown as Worker;
  });
});
afterEach(() => { player.dispose(); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('MP3 local isolado do banco e da voz do navegador', () => {
  it('desbloqueia play no clique antes de iniciar o trabalhador e reaproveita somente o teste', async () => {
    const activation = player.activate(signal);
    expect(audio.play).toHaveBeenCalledTimes(1); expect(audio.src).toBe(PAINEL_MP3_UNLOCK); expect(workers).toHaveLength(0);
    audio.dispatchEvent(new Event('ended')); await tick();
    expect(workers[0].postMessage).toHaveBeenCalledWith({ id: 1, text: PAINEL_VOICE_TEST });
    workers[0].reply(); await activation;
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    const playback = player.say(PAINEL_VOICE_TEST, signal); await tick();
    expect(workers).toHaveLength(1); expect(audio.src).toBe('blob:voice');
    audio.dispatchEvent(new Event('ended')); await playback;
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:voice'); expect(audio.src).toBe('');
  });
  it('não gera voz nem apresenta falso sucesso quando o navegador rejeita o desbloqueio', async () => {
    audio.play.mockRejectedValue(new Error('NotAllowedError'));
    await expect(player.activate(signal)).rejects.toThrow('não conseguiu reproduzir');
    expect(workers).toHaveLength(0);
  });
  it('suporta play sem Promise de TVs antigas e não depende de Web Speech ou AudioContext', async () => {
    audio.play.mockReturnValue(undefined as unknown as Promise<void>);
    const playback = player.say('Teste', signal); workers[0].reply(); await tick();
    audio.dispatchEvent(new Event('ended')); await expect(playback).resolves.toBeUndefined();
  });
  it('ignora resposta atrasada de outra geração e rejeita formato inválido', async () => {
    const playback = player.say('Teste', signal); const rejected = expect(playback).rejects.toThrow('formato');
    workers[0].reply(mp3(), 999); expect(workers[0].terminate).not.toHaveBeenCalled();
    workers[0].reply(new ArrayBuffer(128)); await rejected;
    expect(workers[0].terminate).toHaveBeenCalledTimes(1); expect(audio.play).not.toHaveBeenCalled();
  });
  it('encerra o trabalhador travado em dez segundos sem reter o texto em cache', async () => {
    const playback = player.say('Teste', signal); const rejected = expect(playback).rejects.toThrow('tempo limite');
    await vi.advanceTimersByTimeAsync(10000); await rejected;
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    const retry = player.say('Teste', signal); const cancelled = expect(retry).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers).toHaveLength(2); player.dispose(); await cancelled;
  });
  it('aborta geração e reprodução, revoga a URL e não aceita trabalho após sair da unidade', async () => {
    const controller = new AbortController(); const generation = player.say('Primeiro', controller.signal);
    const cancelled = expect(generation).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await cancelled; expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    const playback = player.say('Segundo', signal); const stopped = expect(playback).rejects.toMatchObject({ name: 'AbortError' });
    workers[1].reply(); await tick(); player.dispose(); await stopped;
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:voice');
    await expect(player.say('Terceiro', signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers).toHaveLength(2);
  });
  it('limita o cache a dois MP3s e elimina os bytes após dois minutos', async () => {
    async function say(text: string) {
      const before = workers.length; const playback = player.say(text, signal);
      if (workers.length > before) workers.at(-1)!.reply();
      await tick(); audio.dispatchEvent(new Event('ended')); await playback;
    }
    await say('A'); await say('B'); await say('B'); expect(workers).toHaveLength(2);
    await say('C'); await say('A'); expect(workers).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(120000); expect(vi.getTimerCount()).toBe(0);
    await say('A'); expect(workers).toHaveLength(5);
  });
  it('encerra reprodução que não emite ended e libera seu recurso', async () => {
    const playback = player.say('Teste', signal); const rejected = expect(playback).rejects.toThrow('tempo limite');
    workers[0].reply(); await tick(); await vi.advanceTimersByTimeAsync(28000); await rejected;
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:voice');
  });
});
