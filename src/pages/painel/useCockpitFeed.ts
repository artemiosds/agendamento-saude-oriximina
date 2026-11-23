import { careStage } from '@/lib/unitCockpit';
import { cockpitTimeline } from '@/lib/cockpitTimeline';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const fields = 'id,paciente_id,paciente_nome,sala_id,profissional_id,profissional_nome,status,tipo,iniciado_em,concluido_em,nome_procedimento' as const;
function page(unit: string, day: string, offset: number) {
  return supabase.from('agendamentos').select(fields).eq('unidade_id', unit).eq('data', day).order('id').range(offset, offset + 499);
}
export type CockpitAppointment = NonNullable<Awaited<ReturnType<typeof page>>['data']>[number];
function triageBatch(ids: string[], offset: number) {
  return supabase.from('triage_records').select('agendamento_id,iniciado_em,confirmado_em,classificacao_risco,tecnico_id')
    .in('agendamento_id', ids).order('id').range(offset, offset + 499);
}
export type CockpitTriage = NonNullable<Awaited<ReturnType<typeof triageBatch>>['data']>[number];
function queueBatch(unit: string, ids: string[], offset: number) {
  return supabase.from('fila_espera').select('id,paciente_id,unidade_id,hora_chegada').eq('unidade_id', unit)
    .in('id', ids).order('id').range(offset, offset + 499);
}
function attendanceBatch(unit: string, day: string, ids: string[], offset: number) {
  return supabase.from('atendimentos').select('id,agendamento_id,paciente_id,profissional_id,unidade_id,data,sala_id,hora_inicio,criado_em')
    .eq('unidade_id', unit).eq('data', day).in('agendamento_id', ids).order('id').range(offset, offset + 499);
}
async function paginated<T>(read: (offset: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await read(offset);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}
async function batches<T>(ids: string[], read: (batch: string[], offset: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += 80) rows.push(...await paginated(offset => read(ids.slice(i, i + 80), offset)));
  return rows;
}
type Source = 'agenda' | 'fila' | 'atendimentos' | 'triagem';
type AgendaEvent = Partial<CockpitAppointment> & { unidade_id?: string; data?: string };
const initialConnections = { agenda: false, fila: false, atendimentos: false, triagem: false };

export function useCockpitFeed(unit: string, day: string) {
  const [rows, setRows] = useState<CockpitAppointment[] | null>(null);
  const [triage, setTriage] = useState<CockpitTriage[]>([]);
  const [arrivals, setArrivals] = useState<Record<string, string>>({});
  const [starts, setStarts] = useState<Record<string, string>>({});
  const [calledAt, setCalledAt] = useState<Record<string, string>>({});
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [connections, setConnections] = useState(initialConnections);
  const connectionsRef = useRef(connections);
  const requestRefresh = useRef<() => void>(() => {});
  const revision = useRef(0);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const connection = useCallback((source: Source, connected: boolean) => {
    connectionsRef.current = { ...connectionsRef.current, [source]: connected };
    setConnections(previous => previous[source] === connected ? previous : { ...previous, [source]: connected });
  }, []);

  useEffect(() => {
    let active = true, busy = false, dirty = false;
    let known = new Map<string, string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      if (!active) return;
      if (busy) { dirty = true; return; }
      busy = true;
      const version = revision.current;
      try {
        const appointments = await paginated(offset => page(unit, day, offset));
        const ids = appointments.map(a => a.id);
        const [records, queue, visits] = await Promise.all([
          batches(ids, triageBatch), batches(ids, (batch, offset) => queueBatch(unit, batch, offset)),
          batches(ids, (batch, offset) => attendanceBatch(unit, day, batch, offset)),
        ]);
        if (!active) return;
        if (version !== revision.current) { dirty = true; return; }
        const snapshot = cockpitTimeline(appointments, queue, visits, unit, day);
        known = new Map(appointments.map(a => [a.id, a.status]));
        const retain = (previous: Record<string, string>, recorded: Record<string, string>) =>
          Object.fromEntries(ids.flatMap(id => recorded[id] || previous[id] ? [[id, recorded[id] || previous[id]]] : []));
        setRows(snapshot.rows);
        setTriage(records);
        setArrivals(previous => retain(previous, snapshot.arrivals));
        setStarts(previous => retain(previous, snapshot.starts));
        setLastSyncedAt(Date.now());
        setError(false);
      } catch { if (active) setError(true); }
      finally {
        busy = false;
        if (dirty && active) { dirty = false; schedule(); }
      }
    }
    function schedule() {
      if (!active || timer !== undefined) return;
      timer = setTimeout(() => { timer = undefined; void refresh(); }, 150);
    }
    requestRefresh.current = schedule;
    const channel = supabase.channel('cockpit:' + unit + ':' + day)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos', filter: 'unidade_id=eq.' + unit }, event => {
        if (!active) return;
        const next = event.new as AgendaEvent, before = event.old as AgendaEvent;
        if (next.data && next.data !== day && !known.has(next.id || '')) return;
        revision.current++;
        if (next.id && next.unidade_id === unit && next.data === day && next.status) {
          const previous = known.get(next.id) ?? before.status;
          const stage = careStage(next.status), id = next.id;
          if (Number.isFinite(Date.parse(event.commit_timestamp))) {
            if ((event.eventType === 'INSERT' || (previous && careStage(previous) === 'outside')) &&
              (stage === 'reception' || next.status === 'apto_atendimento')) {
              setArrivals(prev => prev[id] ? prev : { ...prev, [id]: event.commit_timestamp });
            }
            if (stage === 'consultation' && (event.eventType === 'INSERT' || (previous && careStage(previous) !== 'consultation'))) {
              setStarts(prev => ({ ...prev, [id]: event.commit_timestamp }));
            }
            if (stage === 'calling' && careStage(previous || '') !== 'calling') setCalledAt(prev => ({ ...prev, [id]: event.commit_timestamp }));
          }
          known.set(id, next.status);
        }
        schedule();
      }).subscribe(status => {
        if (!active) return;
        connection('agenda', status === 'SUBSCRIBED');
        schedule();
      });
    const auxiliaries = (['fila_espera', 'atendimentos'] as const).map(table => supabase.channel('cockpit-source:' + table + ':' + unit + ':' + day)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter: 'unidade_id=eq.' + unit }, event => {
        if (!active) return;
        const next = event.new as { data?: string };
        if (table === 'atendimentos' && next.data && next.data !== day) return;
        revision.current++;
        schedule();
      }).subscribe(status => {
        if (!active) return;
        connection(table === 'fila_espera' ? 'fila' : 'atendimentos', status === 'SUBSCRIBED');
        schedule();
      }));
    schedule();
    const fallback = setInterval(() => {
      if (!Object.values(connectionsRef.current).every(Boolean)) schedule();
    }, 45000);
    window.addEventListener('focus', schedule);
    return () => {
      active = false;
      clearTimeout(timer); clearInterval(fallback);
      window.removeEventListener('focus', schedule);
      [channel, ...auxiliaries].forEach(c => { void supabase.removeChannel(c); });
    };
  }, [unit, day, retry, connection]);

  const ids = rows?.map(row => row.id).sort().join(',') || '';
  useEffect(() => {
    if (!ids) { connection('triagem', true); return; }
    let alive = true;
    const all = ids.split(','), connected = new Set<number>();
    const count = Math.ceil(all.length / 80);
    connection('triagem', false);
    const channels = [];
    for (let i = 0; i < all.length; i += 80) {
      const index = i, batch = all.slice(i, i + 80);
      channels.push(supabase.channel('cockpit-triagem:' + unit + ':' + day + ':' + i)
        .on('postgres_changes', { schema: 'public', table: 'triage_records', event: '*', filter: 'agendamento_id=in.(' + batch.join(',') + ')' }, () => {
          if (!alive) return;
          revision.current++; requestRefresh.current();
        }).subscribe(status => {
          if (!alive) return;
          if (status === 'SUBSCRIBED') connected.add(index); else connected.delete(index);
          connection('triagem', connected.size === count);
          requestRefresh.current();
        }));
    }
    return () => { alive = false; channels.forEach(c => { void supabase.removeChannel(c); }); };
  }, [ids, unit, day, connection]);
  return { rows, triage, arrivals, starts, calledAt, lastSyncedAt, online: Object.values(connections).every(Boolean), connections, error, reload: () => setRetry(n => n + 1) };
}
