import type { ChamadaPaciente } from './painelChamadas';

export function aguardarPainel(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new DOMException('Operação cancelada', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

export function limitarPainel<T>(work: Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => finish(new DOMException('Operação cancelada', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('Tempo limite do painel excedido')), ms);
    let done = false;
    function finish(error?: unknown, value?: T) {
      if (done) return;
      done = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(value as T);
    }
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    work.then(value => finish(undefined, value), error => finish(error));
  });
}

interface QueueOptions {
  display: (call: ChamadaPaciente) => void;
  announce: (call: ChamadaPaciente, signal: AbortSignal, repeat: () => boolean) => Promise<void>;
  stopAudio: () => void;
  changed: (pending: number, busy: boolean) => void;
  error: (error: unknown) => void;
}

/** One worker per TV/unit. Accepted calls are never evicted by a new call. */
export class PainelCallQueue {
  private calls: ChamadaPaciente[] = [];
  private seen = new Set<string>();
  private controller = new AbortController();
  private running = false;
  private paused = true;
  constructor(private options: QueueOptions, private capacity = 50) {}
  get pending() { return this.calls.length; }
  get busy() { return this.running; }
  accept(call: ChamadaPaciente): 'recebida' | 'ocupado' {
    if (this.seen.has(call.id)) return 'recebida';
    if (this.controller.signal.aborted || this.calls.length >= this.capacity) return 'ocupado';
    this.seen.add(call.id); this.calls.push(call);
    // Keep queued IDs; prune only completed IDs to bound memory.
    if (this.seen.size > 1000) {
      const queued = new Set(this.calls.map(c => c.id));
      for (const id of this.seen) {
        if (this.seen.size <= 500) break;
        if (!queued.has(id)) this.seen.delete(id);
      }
    }
    this.options.changed(this.pending, this.running);
    void this.process();
    return 'recebida';
  }
  resume() { this.paused = false; void this.process(); }
  pause() { this.paused = true; }
  dispose() {
    this.controller.abort(); this.calls = []; this.seen.clear(); this.options.stopAudio();
  }
  private async process() {
    if (this.running || this.paused || this.controller.signal.aborted) return;
    this.running = true;
    const signal = this.controller.signal;
    try {
      while (this.calls.length && !this.paused && !signal.aborted) {
        const call = this.calls.shift()!;
        this.options.changed(this.pending, true);
        this.options.display(call);
        const started = Date.now();
        const duration = this.pending >= 3 ? 5000 : this.pending ? 8000 : 15000;
        try {
          await limitarPainel(this.options.announce(call, signal, () => this.pending === 0), 18000, signal);
        } catch (error) {
          this.options.stopAudio();
          if (!signal.aborted) this.options.error(error);
        }
        if (signal.aborted) return;
        await aguardarPainel(Math.max(0, duration - (Date.now() - started)), signal);
        if (!signal.aborted) await aguardarPainel(this.pending ? 800 : 2000, signal);
      }
    } catch (error) { if (!signal.aborted) this.options.error(error); }
    finally {
      this.running = false;
      if (!signal.aborted) this.options.changed(this.pending, false);
    }
  }
}
