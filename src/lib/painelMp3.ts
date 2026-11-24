import { PAINEL_MP3_UNLOCK, PAINEL_MP3_WORKER, PAINEL_VOICE_TEST } from './painelAudioMode';

const GENERATION_TIMEOUT = 10000;
const CACHE_TTL = 120000;
const MAX_AUDIO_BYTES = 256000;
type WorkerFactory = () => Worker;
const aborted = () => new DOMException('Áudio cancelado', 'AbortError');

/** One player per TV. Workers end immediately; only two short MP3s can stay in memory. */
export class PainelMp3Player {
  private worker: Worker | null = null;
  private cancelGeneration: (() => void) | null = null;
  private cancelPlayback: (() => void) | null = null;
  private sequence = 0;
  private cache = new Map<string, { audio: ArrayBuffer; expires: number }>();
  private cacheTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(private audio: HTMLAudioElement, private createWorker: WorkerFactory = () => new Worker(PAINEL_MP3_WORKER)) {}

  /** play() starts synchronously inside the user's click, before any synthesis/download. */
  async activate(signal: AbortSignal): Promise<void> {
    await this.playSource(PAINEL_MP3_UNLOCK, signal, 5000);
    await this.generate(PAINEL_VOICE_TEST, signal, 15000);
  }

  async say(text: string, signal: AbortSignal): Promise<void> {
    const bytes = await this.generate(text, signal);
    if (signal.aborted || this.disposed) throw aborted();
    const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
    try { await this.playSource(url, signal, 28000); }
    finally { URL.revokeObjectURL(url); }
  }

  private cleanCache() {
    const now = Date.now();
    for (const [key, value] of this.cache) if (value.expires <= now) this.cache.delete(key);
    if (this.cacheTimer) clearTimeout(this.cacheTimer);
    this.cacheTimer = null;
    if (this.cache.size) {
      const next = Math.min(...[...this.cache.values()].map(value => value.expires));
      this.cacheTimer = setTimeout(() => this.cleanCache(), Math.max(1, next - now));
    }
  }

  private generate(text: string, signal: AbortSignal, timeout = GENERATION_TIMEOUT): Promise<ArrayBuffer> {
    if (this.disposed || signal.aborted) return Promise.reject(aborted());
    if (!text.trim() || text.length > 400) return Promise.reject(new Error('Texto de chamada inválido'));
    this.cleanCache();
    const cached = this.cache.get(text);
    if (cached) return Promise.resolve(cached.audio);
    // A test/activation and a call must never compete for the same player.
    this.cancelGeneration?.();
    return new Promise((resolve, reject) => {
      let worker: Worker;
      try { worker = this.createWorker(); } catch { reject(new Error('A TV não conseguiu iniciar o gerador de MP3')); return; }
      this.worker = worker;
      const id = ++this.sequence;
      let done = false;
      const onAbort = () => finish(aborted());
      const timer = setTimeout(() => finish(new Error('A preparação do MP3 excedeu o tempo limite')), timeout);
      const cancel = () => finish(aborted());
      this.cancelGeneration = cancel;
      const finish = (error?: Error, bytes?: ArrayBuffer) => {
        if (done) return;
        done = true;
        clearTimeout(timer); signal.removeEventListener('abort', onAbort);
        worker.onmessage = null; worker.onerror = null; worker.terminate();
        if (this.worker === worker) this.worker = null;
        if (this.cancelGeneration === cancel) this.cancelGeneration = null;
        if (error || !bytes) { reject(error || new Error('MP3 vazio')); return; }
        while (this.cache.size >= 2) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(text, { audio: bytes, expires: Date.now() + CACHE_TTL });
        this.cleanCache();
        resolve(bytes);
      };
      worker.onmessage = ({ data }) => {
        if (data?.id !== id) return;
        const bytes = data.audio;
        if (data.error || !(bytes instanceof ArrayBuffer) || bytes.byteLength < 100 || bytes.byteLength > MAX_AUDIO_BYTES) {
          finish(new Error('O gerador não retornou um MP3 válido')); return;
        }
        const header = new Uint8Array(bytes, 0, 3);
        if (!((header[0] === 0xff && (header[1] & 0xe0) === 0xe0) ||
              (header[0] === 73 && header[1] === 68 && header[2] === 51))) {
          finish(new Error('O gerador retornou um formato de áudio inválido')); return;
        }
        finish(undefined, bytes);
      };
      worker.onerror = () => finish(new Error('Não foi possível gerar a voz em MP3'));
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) { onAbort(); return; }
      try { worker.postMessage({ id, text }); } catch { finish(new Error('Não foi possível preparar o MP3')); }
    });
  }

  private playSource(source: string, signal: AbortSignal, timeout: number): Promise<void> {
    if (this.disposed || signal.aborted) return Promise.reject(aborted());
    this.cancelPlayback?.();
    return new Promise((resolve, reject) => {
      let done = false;
      const cancel = () => finish(aborted());
      const ended = () => finish();
      const failed = () => finish(new Error('A TV não conseguiu reproduzir o MP3. Ative o som e teste novamente.'));
      const timer = setTimeout(() => finish(new Error('A reprodução do MP3 excedeu o tempo limite')), timeout);
      const finish = (error?: Error) => {
        if (done) return;
        done = true; clearTimeout(timer);
        signal.removeEventListener('abort', cancel);
        this.audio.removeEventListener('ended', ended); this.audio.removeEventListener('error', failed);
        if (this.cancelPlayback === cancel) this.cancelPlayback = null;
        try { this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); } catch { /* detached element */ }
        if (error) reject(error); else resolve();
      };
      this.cancelPlayback = cancel;
      this.audio.addEventListener('ended', ended); this.audio.addEventListener('error', failed);
      signal.addEventListener('abort', cancel, { once: true });
      this.audio.muted = false; this.audio.volume = 1; this.audio.preload = 'auto'; this.audio.src = source;
      // No awaited work may precede this play() in activate(). Old TVs can return undefined.
      try { Promise.resolve(this.audio.play()).catch(failed); } catch { failed(); }
    });
  }

  stop() { this.cancelGeneration?.(); this.cancelPlayback?.(); }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.stop(); this.cache.clear();
    if (this.cacheTimer) clearTimeout(this.cacheTimer);
    this.cacheTimer = null;
  }
}
