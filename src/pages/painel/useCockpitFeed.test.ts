import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCockpitFeed } from './useCockpitFeed';

type Event = { eventType: string; new: object; old: object; commit_timestamp: string };
type Channel = { topic: string; filter?: Record<string,string>; receive?: (event: Event) => void };
const f = vi.hoisted(() => ({
  from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: f }));

const day = '2026-11-19';
const time = '2026-11-19T15:00:00Z';
const item = { id: 'a', unidade_id: 'u', data: day, paciente_id: 'p', paciente_nome: 'Paciente fictício',
  profissional_id: 'd', profissional_nome: 'Profissional teste', sala_id: 's', tipo: 'Consulta',
  status: 'confirmado', iniciado_em: null, concluido_em: null, nome_procedimento: null };
let rows: typeof item[];
let channels: Channel[];

beforeEach(() => {
  vi.useFakeTimers();
  rows = [item];
  channels = [];
  f.from.mockImplementation((table: string) => {
    const conditions: Record<string,string> = {};
    const query = {
      select: () => query, eq: (key: string, value: string) => { conditions[key] = value; return query; },
      order: () => query,
      range: async () => ({ data: rows.filter(r => r.unidade_id === conditions.unidade_id && r.data === conditions.data), error: null }),
      in: async () => ({ data: [], error: null }),
    };
    if (!['agendamentos','triage_records'].includes(table)) throw Error('Unexpected table ' + table);
    return query;
  });
  f.channel.mockImplementation((topic: string) => {
    const channel: Channel = { topic };
    channels.push(channel);
    const wrapper = {
      on: (_event: string, filter: Record<string,string>, receive: Channel['receive']) => {
        channel.filter = filter; channel.receive = receive; return wrapper;
      },
      subscribe: (callback?: (status: string) => void) => { callback?.('SUBSCRIBED'); return wrapper; },
    };
    return wrapper;
  });
  f.removeChannel.mockResolvedValue('ok');
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

function emit(next: object, old: object = {}, kind = 'UPDATE', timestamp = time) {
  const listener = channels.find(c => c.topic.startsWith('cockpit:'))?.receive;
  if (!listener) throw Error('Agenda feed missing');
  act(() => listener({ eventType: kind, new: next, old, commit_timestamp: timestamp }));
}

it('aplica chegada, atendimento e conclusão no evento da Agenda sem criar tempos para registros históricos', async () => {
  const { result } = renderHook(() => useCockpitFeed('u', day));
  await act(async () => { await vi.advanceTimersByTimeAsync(160); });
  expect(result.current.rows?.[0].status).toBe('confirmado');
  expect(result.current.starts).toEqual({});
  expect(channels[0].filter).toMatchObject({ table: 'agendamentos', filter: 'unidade_id=eq.u' });
  rows = [{...item, status: 'apto_atendimento'}];
  emit(rows[0], item);
  expect(result.current.rows?.[0].status).toBe('apto_atendimento');
  expect(result.current.arrivals.a).toBe(time);
  rows = [{...item, status: 'em_atendimento'}];
  const start = '2026-11-19T15:18:00Z';
  emit(rows[0], {}, 'UPDATE', start);
  expect(result.current.rows?.[0].status).toBe('em_atendimento');
  expect(result.current.starts.a).toBe(start);
  rows = [{...item, status: 'concluido'}];
  emit(rows[0]);
  expect(result.current.rows?.[0].status).toBe('concluido');
  expect(result.current.arrivals.a).toBe(time);
});

it('mantém isolamento por unidade e data e retira apenas registros conhecidos quando excluídos', async () => {
  const { result } = renderHook(() => useCockpitFeed('u', day));
  await act(async () => { await vi.advanceTimersByTimeAsync(160); });
  emit({...item, id:'estranho', unidade_id:'externa', status:'apto_atendimento'}, {}, 'INSERT');
  emit({...item, id:'outro-dia', data:'2026-11-20', status:'apto_atendimento'}, {}, 'INSERT');
  expect(result.current.rows?.map(r => r.id)).toEqual(['a']);
  expect(result.current.arrivals).toEqual({});
  emit({}, {id:'estranho'}, 'DELETE');
  expect(result.current.rows?.map(r => r.id)).toEqual(['a']);
  rows = [];
  emit({}, {id:'a'}, 'DELETE');
  expect(result.current.rows).toEqual([]);
});
