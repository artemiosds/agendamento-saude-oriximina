// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

describe('artefato real do gerador MP3 publicado', () => {
  it('gera voz portuguesa e MP3 no ambiente isolado de um worker, sem DOM, fetch ou síntese nativa', () => {
    const results: { id: number; audio?: ArrayBuffer; error?: string }[] = [];
    const port = { onmessage: null as null | ((v: unknown) => void), postMessage: (v: typeof results[number]) => results.push(v) };
    const context = createContext({ self: port, console: { warn: vi.fn(), log: vi.fn(), error: vi.fn() }, setTimeout, clearTimeout });
    runInContext(readFileSync(new URL('../../public/painel-audio/mp3-worker-v1.js', import.meta.url), 'utf8'), context, { timeout: 10000 });
    port.onmessage!({ data: { id: 1, text: 'Teste de voz do painel de chamadas.' } });
    expect(results).toHaveLength(1); expect(results[0].error).toBeUndefined(); expect(results[0].audio!.byteLength).toBeGreaterThan(1000);
    const header = new Uint8Array(results[0].audio!); expect(header[0]).toBe(255); expect(header[1] & 224).toBe(224);
    port.onmessage!({ data: { id: 2, text: 'Não deve processar duas chamadas no mesmo trabalhador.' } });
    expect(results).toHaveLength(1);
  }, 15000);
});
