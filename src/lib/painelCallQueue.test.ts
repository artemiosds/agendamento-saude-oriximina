import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PainelCallQueue } from './painelCallQueue';
import type { ChamadaPaciente } from './painelChamadas';
const call = (id: string) => ({ id, pacienteNome: 'PACIENTE', local: 'SALA', criadoEm: new Date().toISOString() });
let queues: PainelCallQueue[] = [];
function setup(announce: (c: ChamadaPaciente, signal: AbortSignal, repeat: () => boolean) => Promise<void> = vi.fn(async () => {})) {
  const options = { display: vi.fn(), announce, stopAudio: vi.fn(), changed: vi.fn(), error: vi.fn() };
  const queue = new PainelCallQueue(options); queues.push(queue); return { queue, ...options };
}
beforeEach(() => { vi.useFakeTimers(); queues = []; });
afterEach(() => { queues.forEach(q => q.dispose()); vi.useRealTimers(); });
describe('fila de chamadas da TV', () => {
  it('não consome chamadas antes de ativar áudio ou escolher exibição visual', async () => {
    const q = setup(); q.queue.accept(call('1')); await vi.advanceTimersByTimeAsync(60000);
    expect(q.display).not.toHaveBeenCalled(); q.queue.resume(); expect(q.display).toHaveBeenCalledTimes(1);
  });
  it('recusa excedente explicitamente e apresenta todas as 51 chamadas aceitas em uma rajada de 52', async () => {
    const q = setup(); q.queue.resume(); const results = Array.from({ length: 52 }, (_, i) => q.queue.accept(call(String(i))));
    expect(results.filter(r => r === 'ocupado')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000000);
    expect(q.display.mock.calls.map(([c]) => c.id)).toEqual(Array.from({ length: 51 }, (_, i) => String(i)));
  });
  it('deduplica a repetição do mesmo ID e aceita uma rechamada com novo ID', async () => {
    const q = setup(); q.queue.accept(call('1')); q.queue.accept(call('1')); q.queue.accept(call('2')); q.queue.resume();
    await vi.advanceTimersByTimeAsync(60000); expect(q.display.mock.calls.map(([c]) => c.id)).toEqual(['1', '2']);
  });
  it('interrompe o trabalhador e os timers ao sair ou trocar unidade', async () => {
    const q = setup(); q.queue.resume(); q.queue.accept(call('1')); q.queue.accept(call('2'));
    q.queue.dispose(); await vi.advanceTimersByTimeAsync(60000);
    expect(q.display).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    expect(q.queue.accept(call('3'))).toBe('ocupado');
  });
  it('continua após uma API de áudio ficar pendente indefinidamente', async () => {
    const q = setup(vi.fn(() => new Promise<void>(() => {}))); q.queue.resume(); q.queue.accept(call('1')); q.queue.accept(call('2'));
    await vi.advanceTimersByTimeAsync(40000);
    expect(q.display).toHaveBeenCalledTimes(2); expect(q.error).toHaveBeenCalled(); expect(q.stopAudio).toHaveBeenCalled();
  });
  it('reavalia se deve repetir a voz quando chega outra chamada', async () => {
    let repeat!: () => boolean;
    const q = setup(vi.fn(async (_c, _s, shouldRepeat) => { repeat = shouldRepeat; }));
    q.queue.resume(); q.queue.accept(call('1')); expect(repeat()).toBe(true);
    q.queue.accept(call('2')); expect(repeat()).toBe(false);
  });
});
