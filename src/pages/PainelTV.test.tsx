import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ unit: 'A', channels: [] as any[], removed: [] as any[] }));
vi.mock('react-router-dom', () => ({ useSearchParams: () => [new URLSearchParams({ unidade: fixture.unit }), vi.fn()] }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: () => {
    const q = { select: () => q, eq: () => q, order: () => q, abortSignal: () => q, maybeSingle: () => q,
      then: (resolve: any) => Promise.resolve({ data: { custom_data: {} }, error: null }).then(resolve) }; return q;
  },
  channel(name: string) {
    const ch = { name, event: (_v: any) => {}, status: (_s: string) => {}, send: vi.fn(async () => 'ok'),
      on(_t: unknown, e: any, callback: any) { if (e?.event !== 'video_atualizado') this.event = callback; return this; },
      subscribe(callback: any) { this.status = callback; callback('SUBSCRIBED'); return this; },
    }; fixture.channels.push(ch); return ch;
  }, removeChannel: async (ch: any) => { fixture.removed.push(ch); return 'ok'; },
} }));
import PainelTV from './PainelTV';
const call = (id: string, unit = 'A') => ({ id, pacienteNome: `PACIENTE ${id}`, local: 'SALA', criadoEm: new Date().toISOString(), unidadeId: unit });
beforeEach(() => { vi.useFakeTimers(); fixture.unit = 'A'; fixture.channels = []; fixture.removed = []; localStorage.clear(); });
afterEach(async () => { cleanup(); await act(async () => { await vi.advanceTimersByTimeAsync(0); }); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function show() { const r = render(<PainelTV />); await act(async () => { await vi.advanceTimersByTimeAsync(0); }); return r; }
describe('TV: isolamento, recepção e áudio', () => {
  it('confirma a recepção sem consumir a chamada antes da ativação', async () => {
    await show(); const ch = fixture.channels[0]; act(() => ch.event({ payload: call('1') }));
    expect(ch.send).toHaveBeenCalledWith(expect.objectContaining({ event: 'chamada_status', payload: { id: '1', unidadeId: 'A', status: 'recebida_sem_audio' } }), expect.anything());
    expect(screen.queryByText('PACIENTE 1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar sem áudio (somente exibição)' }));
    expect(screen.getByText('PACIENTE 1')).toBeInTheDocument();
  });
  it('não apresenta chamadas pendentes da unidade anterior nem recebe eventos de canal antigo', async () => {
    const { rerender } = await show(); const old = fixture.channels[0];
    fireEvent.click(screen.getByRole('button', { name: 'Continuar sem áudio (somente exibição)' }));
    act(() => { old.event({ payload: call('A1') }); old.event({ payload: call('A2') }); });
    fixture.unit = 'B'; rerender(<PainelTV />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const current = fixture.channels.at(-1);
    act(() => { old.event({ payload: call('A3') }); current.event({ payload: call('B1', 'B') }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(40000); });
    expect(screen.queryByText('PACIENTE A2')).not.toBeInTheDocument(); expect(screen.queryByText('PACIENTE A3')).not.toBeInTheDocument();
    expect(screen.getByText('PACIENTE B1')).toBeInTheDocument();
    expect(localStorage.getItem('painel_tv_hist_A')).not.toContain('B1');
  });
  it('remove canal com erro mesmo se trocar de unidade antes da reconexão', async () => {
    const { rerender } = await show(); const old = fixture.channels[0]; act(() => old.status('CHANNEL_ERROR'));
    fixture.unit = 'B'; rerender(<PainelTV />);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(fixture.removed).toContain(old); expect(fixture.channels.map(ch => ch.name)).toEqual(['painel-chamadas-A', 'painel-chamadas-B']);
  });
  it('rejeita mensagens incompletas e de outra unidade', async () => {
    await show(); const ch = fixture.channels[0];
    act(() => { ch.event({ payload: { id: 'invalido' } }); ch.event({ payload: call('1', 'B') }); });
    expect(ch.send).not.toHaveBeenCalled(); expect(screen.getByText(/0 chamada\(s\) aguardando/)).toBeInTheDocument();
  });
  it('não marca som como ativo se o navegador não oferece áudio', async () => {
    vi.stubGlobal('AudioContext', undefined); vi.stubGlobal('webkitAudioContext', undefined);
    await show(); fireEvent.click(screen.getByRole('button', { name: 'Clique para ativar o áudio' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText(/Som inativo/)).toBeInTheDocument(); expect(screen.getAllByText(/Não foi possível ativar o áudio/).length).toBeGreaterThan(0);
  });
  it('libera canais, timers e processamento ao desmontar', async () => {
    const { unmount } = await show(); const ch = fixture.channels[0]; act(() => ch.event({ payload: call('1') }));
    unmount(); await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fixture.removed).toContain(ch); expect(vi.getTimerCount()).toBe(0);
  });
});
