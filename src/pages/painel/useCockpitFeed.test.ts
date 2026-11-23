import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCockpitFeed, type CockpitTriage } from './useCockpitFeed';
import type { TimelineQueue, TimelineAttendance } from '@/lib/cockpitTimeline';

type Event = { eventType: string; new: object; old: object; commit_timestamp: string };
type Channel = { topic: string; filter?: Record<string,string>; receive?: (event: Event) => void; status?: (status: string) => void };
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
let triageRows: CockpitTriage[];
let queueRows: TimelineQueue[];
let attendanceRows: TimelineAttendance[];
let failureTable: string | null;
let channels: Channel[];

beforeEach(() => {
  vi.useFakeTimers();
  rows = [item];
  triageRows = []; queueRows = []; attendanceRows = []; failureTable = null;
  channels = [];
  f.from.mockImplementation((table: string) => {
    const conditions: Record<string,string> = {};
    let ids: string[] | null = null;
    const query = {
      select: () => query, eq: (key: string, value: string) => { conditions[key] = value; return query; },
      order: () => query,
      in: (_key: string, value: string[]) => { ids = value; return query; },
      range: async (offset: number, end: number) => {
        if (failureTable === table) return { data: null, error: new Error('Falha simulada') };
        const data = table === 'agendamentos' ? rows.filter(r => r.unidade_id === conditions.unidade_id && r.data === conditions.data)
          : table === 'triage_records' ? triageRows.filter(t => ids?.includes(t.agendamento_id))
          : table === 'fila_espera' ? queueRows.filter(t => t.unidade_id === conditions.unidade_id && ids?.includes(t.id))
          : attendanceRows.filter(t => t.unidade_id === conditions.unidade_id && t.data === conditions.data && ids?.includes(t.agendamento_id));
        return { data: data.slice(offset,end+1), error: null };
      },
    };
    if (!['agendamentos','triage_records','atendimentos','fila_espera'].includes(table)) throw Error('Unexpected table ' + table);
    return query;
  });
  f.channel.mockImplementation((topic: string) => {
    const channel: Channel = { topic };
    channels.push(channel);
    const wrapper = {
      on: (_event: string, filter: Record<string,string>, receive: Channel['receive']) => {
        channel.filter = filter; channel.receive = receive; return wrapper;
      },
      subscribe: (callback?: (status: string) => void) => { channel.status = callback; callback?.('SUBSCRIBED'); return wrapper; },
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
  await act(async () => { await vi.advanceTimersByTimeAsync(160); });
  expect(result.current.rows?.[0].status).toBe('apto_atendimento');
  expect(result.current.arrivals.a).toBe(time);
  rows = [{...item, status: 'em_atendimento'}];
  const start = '2026-11-19T15:18:00Z';
  emit(rows[0], {}, 'UPDATE', start);
  await act(async () => { await vi.advanceTimersByTimeAsync(160); });
  expect(result.current.rows?.[0].status).toBe('em_atendimento');
  expect(result.current.starts.a).toBe(start);
  rows = [{...item, status: 'concluido'}];
  emit(rows[0]);
  await act(async () => { await vi.advanceTimersByTimeAsync(160); });
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
  await act(async () => { await vi.advanceTimersByTimeAsync(160); });
  expect(result.current.rows).toEqual([]);
});

it('carrega e mantém a triagem confirmada depois de concluir a consulta, sem incluir outras unidades ou datas', async () => {
  const record = { agendamento_id: 'a', iniciado_em: time, confirmado_em: time, classificacao_risco: 'verde', tecnico_id: 't' };
  rows = [
    { ...item, status: 'apto_atendimento' },
    { ...item, id: 'externa', unidade_id: 'outra', status: 'concluido' },
    { ...item, id: 'ontem', data: '2026-11-18', status: 'concluido' },
  ];
  triageRows = [record, { ...record, agendamento_id: 'externa' }, { ...record, agendamento_id: 'ontem' }];
  const { result, unmount } = renderHook(() => useCockpitFeed('u', day));
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(result.current.triage).toEqual([record]);
  const triageChannelCount = channels.filter(c => c.topic.startsWith('cockpit-triagem:')).length;
  rows = [{ ...item, status: 'concluido' }];
  emit(rows[0]);
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(result.current.rows?.[0].status).toBe('concluido');
  expect(result.current.triage).toEqual([record]);
  expect(channels.filter(c => c.topic.startsWith('cockpit-triagem:'))).toHaveLength(triageChannelCount);
  const triageChannel = channels.find(c => c.topic.startsWith('cockpit-triagem:'))!;
  expect(triageChannel.filter?.filter).toBe('agendamento_id=in.(a)');
  triageRows = [{ ...record, classificacao_risco: 'amarelo' }];
  act(() => triageChannel.receive?.({ eventType: 'UPDATE', new: triageRows[0], old: record, commit_timestamp: time }));
  await act(async () => { await vi.advanceTimersByTimeAsync(160); });
  expect(result.current.triage[0].classificacao_risco).toBe('amarelo');
  unmount();
  expect(f.removeChannel).toHaveBeenCalledTimes(4);
});

it('carrega o histórico de triagem ao abrir o cockpit com consultas já concluídas', async () => {
  rows = [{ ...item, status: 'concluido' }];
  const record = { agendamento_id: 'a', iniciado_em: time, confirmado_em: time, classificacao_risco: 'verde', tecnico_id: 't' };
  triageRows = [record];
  const { result } = renderHook(() => useCockpitFeed('u', day));
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(result.current.triage).toEqual([record]);
});

it('recupera chegada, início e sala de registros persistidos após remontar, sem depender do evento ao vivo', async () => {
  rows = [{ ...item, status: 'em_atendimento', sala_id: '' }];
  queueRows = [{ id:'a', paciente_id:'p', unidade_id:'u', hora_chegada:'08:10' }];
  attendanceRows = [{ id:'at', agendamento_id:'a', paciente_id:'p', profissional_id:'d', unidade_id:'u', data:day,
    sala_id:'s', hora_inicio:'08:30', criado_em:time }];
  const first = renderHook(() => useCockpitFeed('u',day));
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(first.result.current.arrivals.a).toBe(day+'T08:10:00-03:00');
  expect(first.result.current.starts.a).toBe(day+'T08:30:00-03:00');
  expect(first.result.current.rows?.[0].sala_id).toBe('s');
  first.unmount();
  const second = renderHook(() => useCockpitFeed('u',day));
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(second.result.current.arrivals.a).toBe(day+'T08:10:00-03:00');
  expect(second.result.current.starts.a).toBe(day+'T08:30:00-03:00');
});

it('sinaliza falha em cada fonte e revalida sem apagar a tela, inclusive na reconexão', async () => {
  const { result } = renderHook(() => useCockpitFeed('u',day));
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(result.current.online).toBe(true);
  const triage = channels.find(c => c.filter?.table === 'triage_records')!;
  act(() => triage.status?.('CHANNEL_ERROR'));
  expect(result.current.online).toBe(false);
  expect(result.current.connections.triagem).toBe(false);
  expect(result.current.rows?.[0].id).toBe('a');
  act(() => triage.status?.('SUBSCRIBED'));
  await act(async () => { await vi.advanceTimersByTimeAsync(160); });
  expect(result.current.online).toBe(true);
  failureTable = 'atendimentos';
  act(() => window.dispatchEvent(new window.Event('focus')));
  await act(async () => { await vi.advanceTimersByTimeAsync(160); });
  expect(result.current.error).toBe(true);
  expect(result.current.rows?.[0].id).toBe('a');
  failureTable = null;
  act(() => result.current.reload());
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(result.current.error).toBe(false);
});

it('atualiza os horários por eventos da fila e dos atendimentos da unidade', async () => {
  const { result } = renderHook(() => useCockpitFeed('u',day));
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  queueRows = [{id:'a',paciente_id:'p',unidade_id:'u',hora_chegada:'09:00'}];
  const fila = channels.find(c => c.filter?.table === 'fila_espera')!;
  act(() => fila.receive?.({eventType:'UPDATE', new:queueRows[0],old:{},commit_timestamp:time}));
  await act(async () => { await vi.advanceTimersByTimeAsync(160); });
  expect(result.current.arrivals.a).toBe(day+'T09:00:00-03:00');
  const visits = channels.find(c => c.filter?.table === 'atendimentos')!;
  expect(visits.filter?.filter).toBe('unidade_id=eq.u');
  attendanceRows = [{id:'at',agendamento_id:'a',paciente_id:'p',profissional_id:'d',unidade_id:'u',data:day,sala_id:'s',hora_inicio:'09:10',criado_em:time}];
  act(() => visits.receive?.({eventType:'INSERT',new:attendanceRows[0],old:{},commit_timestamp:time}));
  await act(async () => { await vi.advanceTimersByTimeAsync(160); });
  expect(result.current.starts.a).toBe(day+'T09:10:00-03:00');
});
