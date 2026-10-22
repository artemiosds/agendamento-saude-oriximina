import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  reads: [] as Array<{ start: string; end: string; from: number; to: number }>,
  failSecondPage: false,
  holdFirst: false,
  releaseFirst: null as null | (() => void),
  realtime: null as null | ((payload: Record<string, unknown>) => void),
  user: { id: 'admin', role: 'master', usuario: 'admin.sms', unidadeId: 'oriximina' },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: fixture.user }),
}));
vi.mock('@/contexts/OperacionalContext', () => ({
  useOperacional: () => ({ getTurnoInfo: () => [], logAction: async () => {} }),
}));
vi.mock('@/hooks/useRealtimeSync', () => ({ useRealtimeSync: ({ onEvent }: { onEvent: typeof fixture.realtime }) => {
  fixture.realtime = onEvent;
} }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const params = { start: '', end: '', from: 0, to: 999, signal: null as AbortSignal | null };
      const filters: Record<string, string> = {};
      const query = {
        select: () => query,
        eq: (key: string, value: string) => { filters[key] = value; return query; },
        gte: (_: string, value: string) => { params.start = value; return query; },
        lte: (_: string, value: string) => { params.end = value; return query; },
        order: () => query,
        range: (from: number, to: number) => { params.from = from; params.to = to; return query; },
        abortSignal: (signal: AbortSignal) => { params.signal = signal; return query; },
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve().then(async () => {
            fixture.reads.push({ start: params.start, end: params.end, from: params.from, to: params.to });
            if (fixture.holdFirst && params.start === '2026-09-23') {
              await new Promise<void>(release => { fixture.releaseFirst = release; });
            }
            if (params.signal?.aborted) return { data: null, error: new Error('aborted') };
            if (fixture.failSecondPage && params.from >= 1000) return { data: null, error: new Error('network') };
            const data = fixture.rows.filter(row => String(row.data) >= params.start && String(row.data) <= params.end)
              .filter(row => Object.entries(filters).every(([key, value]) => row[key] === value))
              .slice(params.from, params.to + 1);
            return { data, error: null };
          }).then(resolve, reject),
      };
      return query;
    },
  },
}));

import { AgendamentosSliceProvider, useAgendamentos } from './AgendamentosContext';
import { getAgendamentosSnapshot, isCompleteAgendaDate } from './_agendamentosBridge';

const row = (id: string, date = '2026-09-23') => ({
  id, paciente_id: `p${id}`, paciente_nome: `Paciente ${id}`, unidade_id: 'oriximina',
  profissional_id: 'profissional', profissional_nome: 'Profissional', data: date,
  hora: '13:30', status: 'confirmado', tipo: 'Consulta', origem: 'recepcao', criado_em: '2026-09-23T10:00:00',
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    <AgendamentosSliceProvider>{children}</AgendamentosSliceProvider>
  </QueryClientProvider>
);

beforeEach(() => {
  fixture.rows = [];
  fixture.reads = [];
  fixture.failSecondPage = false;
  fixture.holdFirst = false;
  fixture.releaseFirst = null;
  fixture.realtime = null;
  fixture.user = { id: 'admin', role: 'master', usuario: 'admin.sms', unidadeId: 'oriximina' };
  window.history.replaceState({}, '', '/painel/agenda');
});

describe('A1.2: intervalo completo da Agenda', () => {
  it('reconcilia chegada atrasada sem regredir um atendimento já iniciado', async () => {
    fixture.rows = [{ ...row('arrival'), status: 'em_atendimento' }];
    const { result } = renderHook(() => useAgendamentos(), { wrapper });
    await act(async () => { await result.current.loadAgendaRange('2026-09-23', '2026-09-23', { visible: true }); });
    await act(async () => { fixture.realtime?.({ eventType: 'UPDATE', old: { id: 'arrival' },
      new: { ...row('arrival'), status: 'confirmado_chegada' } }); });
    await waitFor(() => expect(fixture.reads).toHaveLength(2));
    expect(result.current.agendamentos[0].status).toBe('em_atendimento');
  });

  it.each(['unidade', 'profissional'])('não aplica chegada de outro vínculo: %s', async scope => {
    fixture.user = { id: 'profissional', role: 'profissional', usuario: 'prof', unidadeId: 'oriximina' };
    fixture.rows = [row('arrival')];
    const { result } = renderHook(() => useAgendamentos(), { wrapper });
    await act(async () => { await result.current.loadAgendaRange('2026-09-23', '2026-09-23', { visible: true }); });
    const incoming = { ...row('arrival'), status: 'confirmado_chegada',
      ...(scope === 'unidade' ? { unidade_id: 'outra' } : { profissional_id: 'outro' }) };
    await act(async () => { fixture.realtime?.({ eventType: 'UPDATE', old: { id: 'arrival' }, new: incoming }); });
    await waitFor(() => expect(fixture.reads).toHaveLength(2));
    expect(result.current.agendamentos[0]).toMatchObject({ status: 'confirmado', unidadeId: 'oriximina', profissionalId: 'profissional' });
  });

  it('reconcilia chegada durante leitura em voo e descarta a resposta substituída', async () => {
    fixture.rows = [row('arrival')];
    const { result } = renderHook(() => useAgendamentos(), { wrapper });
    await act(async () => { await result.current.loadAgendaRange('2026-09-23', '2026-09-23', { visible: true }); });
    fixture.holdFirst = true;
    let replaced: unknown;
    let pending!: Promise<void>;
    act(() => { pending = result.current.loadAgendaRange('2026-09-23', '2026-09-23', { force: true }).catch(e => { replaced = e; }); });
    await waitFor(() => expect(fixture.releaseFirst).toBeTypeOf('function'));
    fixture.holdFirst = false;
    fixture.rows = [{ ...row('arrival'), status: 'confirmado_chegada' }];
    await act(async () => { fixture.realtime?.({ eventType: 'UPDATE', old: { id: 'arrival' }, new: fixture.rows[0] }); });
    await waitFor(() => expect(fixture.reads).toHaveLength(3));
    await act(async () => { fixture.releaseFirst?.(); await pending; });
    expect(String(replaced)).toContain('substituída');
    expect(result.current.agendamentos[0].status).toBe('confirmado_chegada');
    expect(result.current.completeAgendaDates.has('2026-09-23')).toBe(true);
  });

  it.each(['confirmado_chegada', 'apto_atendimento'])('aplica chegada %s sem consultar novamente o intervalo e preserva os demais cartões', async status => {
    fixture.rows = [row('arrival'), row('other')];
    const { result } = renderHook(() => useAgendamentos(), { wrapper });
    await act(async () => {
      await result.current.loadAgendaRange('2026-09-23', '2026-09-23', { visible: true });
    });
    const other = result.current.agendamentos.find(a => a.id === 'other');
    const updated = { ...fixture.rows[0], status, hora_chegada: '13:35' };
    await act(async () => {
      fixture.realtime?.({ eventType: 'UPDATE', old: { id: 'arrival' }, new: updated });
    });
    expect(fixture.reads).toHaveLength(1); // apenas carga inicial
    expect(result.current.agendamentos.find(a => a.id === 'arrival')).toMatchObject({ status, horaChegada: '13:35' });
    expect(result.current.agendamentos.find(a => a.id === 'other')).toBe(other);
    expect(getAgendamentosSnapshot().filter(a => a.status === status)).toHaveLength(1);
    expect(result.current.completeAgendaDates.has('2026-09-23')).toBe(true);
    expect(isCompleteAgendaDate('2026-09-23')).toBe(true);
    expect(result.current.agendaRevision).toBeGreaterThan(0);
  });

  it('reconcilia a data quando o evento de chegada também muda o horário', async () => {
    fixture.rows = [row('arrival')];
    const { result } = renderHook(() => useAgendamentos(), { wrapper });
    await act(async () => { await result.current.loadAgendaRange('2026-09-23', '2026-09-23', { visible: true }); });
    fixture.rows = [{ ...fixture.rows[0], status: 'confirmado_chegada', hora: '14:00' }];
    await act(async () => { fixture.realtime?.({ eventType: 'UPDATE', old: { id: 'arrival' }, new: fixture.rows[0] }); });
    await waitFor(() => expect(fixture.reads).toHaveLength(2));
    expect(result.current.agendamentos[0]).toMatchObject({ status: 'confirmado_chegada', hora: '14:00' });
  });

  it('busca todas as páginas da data movimentada e reaproveita o dia visitado', async () => {
    fixture.rows = Array.from({ length: 1005 }, (_, index) => row(String(index)));
    const { result } = renderHook(() => useAgendamentos(), { wrapper });
    await act(async () => {
      await result.current.loadAgendaRange('2026-09-23', '2026-09-23', { visible: true });
    });
    expect(result.current.agendamentos).toHaveLength(1005);
    expect(result.current.completeAgendaDates.has('2026-09-23')).toBe(true);
    expect(fixture.reads).toEqual([
      { start: '2026-09-23', end: '2026-09-23', from: 0, to: 999 },
      { start: '2026-09-23', end: '2026-09-23', from: 1000, to: 1999 },
    ]);
    await act(async () => {
      await result.current.loadAgendaRange('2026-09-23', '2026-09-23');
    });
    expect(fixture.reads).toHaveLength(2);
  });

  it('não aceita uma página parcial como ocupação completa e permite repetir', async () => {
    fixture.rows = Array.from({ length: 1005 }, (_, index) => row(String(index)));
    fixture.failSecondPage = true;
    const { result } = renderHook(() => useAgendamentos(), { wrapper });
    let failure: unknown;
    await act(async () => {
      try {
        await result.current.loadAgendaRange('2026-09-23', '2026-09-23');
      } catch (error) {
        failure = error;
      }
    });
    expect(String(failure)).toContain('network');
    expect(result.current.agendamentos).toHaveLength(0);
    expect(result.current.completeAgendaDates.has('2026-09-23')).toBe(false);
    fixture.failSecondPage = false;
    await act(async () => {
      await result.current.loadAgendaRange('2026-09-23', '2026-09-23');
    });
    expect(result.current.agendamentos).toHaveLength(1005);
    expect(result.current.completeAgendaDates.has('2026-09-23')).toBe(true);
  });

  it('descarta resposta antiga depois de navegar rapidamente para outro dia', async () => {
    fixture.rows = [row('old'), row('new', '2026-09-24')];
    fixture.holdFirst = true;
    const { result } = renderHook(() => useAgendamentos(), { wrapper });
    let first: Promise<void>;
    act(() => { first = result.current.loadAgendaRange('2026-09-23', '2026-09-23', { visible: true }); });
    await waitFor(() => expect(fixture.releaseFirst).toBeTypeOf('function'));
    await act(async () => {
      await result.current.loadAgendaRange('2026-09-24', '2026-09-24', { visible: true });
    });
    await act(async () => { fixture.releaseFirst?.(); await first; });
    expect(result.current.agendamentos.map(a => a.id)).toEqual(['new']);
    expect(result.current.completeAgendaDates.has('2026-09-23')).toBe(false);
    expect(result.current.completeAgendaDates.has('2026-09-24')).toBe(true);
  });

  it('invalida data antiga e nova ao receber remarcação via Realtime', async () => {
    fixture.rows = [row('moved')];
    const { result } = renderHook(() => useAgendamentos(), { wrapper });
    await act(async () => {
      await result.current.loadAgendaRange('2026-09-23', '2026-09-24', { visible: true });
    });
    fixture.rows = [row('moved', '2026-09-24')];
    await act(async () => {
      fixture.realtime?.({ eventType: 'UPDATE', old: { id: 'moved', data: '2026-09-23' },
        new: { ...fixture.rows[0] } });
    });
    await waitFor(() => expect(result.current.completeAgendaDates.has('2026-09-24')).toBe(true));
    expect(result.current.agendamentos.filter(a => a.id === 'moved').map(a => a.data)).toEqual(['2026-09-24']);
    expect(fixture.reads.filter(read => read.start === '2026-09-23')).toHaveLength(2);
    expect(fixture.reads.filter(read => read.start === '2026-09-24')).toHaveLength(1);
  });
});
