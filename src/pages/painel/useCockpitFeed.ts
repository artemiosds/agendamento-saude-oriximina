import { careStage } from '@/lib/unitCockpit';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const fields = 'id,paciente_id,paciente_nome,sala_id,profissional_id,profissional_nome,status,tipo,iniciado_em,concluido_em,nome_procedimento' as const;
function page(unit: string, day: string, offset: number) {
  return supabase.from('agendamentos').select(fields).eq('unidade_id', unit).eq('data', day)
    .order('id').range(offset, offset + 499);
}

async function readAppointments(unit: string, day: string) {
  const rows: CockpitAppointment[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await page(unit, day, offset);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

export type CockpitAppointment = NonNullable<Awaited<ReturnType<typeof page>>['data']>[number];

function readTriageBatch(batch: string[]) {
  return supabase.from('triage_records')
    .select('agendamento_id,iniciado_em,confirmado_em,classificacao_risco,tecnico_id').in('agendamento_id', batch);
}
export type CockpitTriage = NonNullable<Awaited<ReturnType<typeof readTriageBatch>>['data']>[number];

async function readTriage(ids: string[]) {
  const records: CockpitTriage[] = [];
  for (let i = 0; i < ids.length; i += 80) {
    const { data, error } = await readTriageBatch(ids.slice(i, i + 80));
    if (error) throw error;
    records.push(...(data ?? []));
  }
  return records;
}

type AgendaEvent = Partial<CockpitAppointment> & { unidade_id?: string; data?: string };

function projectEvent(next: AgendaEvent): CockpitAppointment | null {
  if (!next.id || typeof next.status !== 'string' || typeof next.paciente_nome !== 'string') return null;
  return {
    id: next.id, status: next.status, paciente_id: next.paciente_id ?? '', paciente_nome: next.paciente_nome,
    sala_id: next.sala_id ?? '', profissional_id: next.profissional_id ?? '', profissional_nome: next.profissional_nome ?? '',
    tipo: next.tipo ?? '', iniciado_em: next.iniciado_em ?? null, concluido_em: next.concluido_em ?? null,
    nome_procedimento: next.nome_procedimento ?? null,
  };
}

export function useCockpitFeed(unit: string, day: string) {
  const [rows, setRows] = useState<CockpitAppointment[] | null>(null);
  const [triage, setTriage] = useState<CockpitTriage[]>([]);
  const [arrivals, setArrivals] = useState<Record<string, string>>({});
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [calledAt, setCalledAt] = useState<Record<string, string>>({});
  const [starts, setStarts] = useState<Record<string, string>>({});
  const [online, setOnline] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true, busy = false, dirty = false, connected = false, revision = 0;
    let known = new Map<string, string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      if (!active) return;
      if (busy) { dirty = true; return; }
      busy = true;
      const version = revision;
      try {
        const appointments = await readAppointments(unit, day);
        const records = await readTriage(appointments.map(a => a.id));
        if (!active) return;
        if (version !== revision) { dirty = true; return; }
        known = new Map(appointments.map(a => [a.id, a.status]));
        setRows(appointments);
        setTriage(records);
        setLastSyncedAt(Date.now());
        setError(false);
      } catch {
        if (active) setError(true);
      } finally {
        busy = false;
        if (dirty && active) { dirty = false; schedule(); }
      }
    }
    function schedule() {
      if (timer !== undefined) return;
      timer = setTimeout(() => { timer = undefined; void refresh(); }, 150);
    }

    setOnline(false);
    const channel = supabase.channel('cockpit:' + unit + ':' + day)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos', filter: 'unidade_id=eq.' + unit }, event => {
        if (!active) return;
        const next = event.new as AgendaEvent;
        const before = event.old as AgendaEvent;
        if (next.id && next.data === day && next.unidade_id === unit && next.status) {
          revision++;
          const previous = known.get(next.id) ?? before.status;
          const state = careStage(next.status);
          const timestampAvailable = Number.isFinite(Date.parse(event.commit_timestamp));
          if (timestampAvailable && (event.eventType === 'INSERT' || (previous && careStage(previous) === 'outside')) &&
            (state === 'reception' || next.status === 'apto_atendimento')) {
            const id = next.id;
            setArrivals(prev => prev[id] ? prev : { ...prev, [id]: event.commit_timestamp });
          }
          if (timestampAvailable && state === 'consultation' &&
            (event.eventType === 'INSERT' || (previous && careStage(previous) !== 'consultation'))) {
            const id = next.id;
            setStarts(prev => ({ ...prev, [id]: event.commit_timestamp }));
          }
          if (timestampAvailable && state === 'calling' && careStage(previous || '') !== 'calling') {
            const id = next.id;
            setCalledAt(prev => ({ ...prev, [id]: event.commit_timestamp }));
          }
          known.set(next.id, next.status);
          const row = projectEvent(next);
          if (row) setRows(prev => {
            if (!prev) return prev;
            const at = prev.findIndex(a => a.id === row.id);
            if (at === -1) return [...prev, row].sort((a, b) => a.id.localeCompare(b.id));
            const updated = [...prev];
            updated[at] = row;
            return updated;
          });
          schedule();
        } else if ((event.eventType === 'DELETE' && before.id && known.has(before.id)) ||
          (next.id && next.data && next.unidade_id && known.has(next.id) && (next.data !== day || next.unidade_id !== unit))) {
          const id = (next.id || before.id)!;
          revision++;
          known.delete(id);
          setRows(prev => prev?.filter(a => a.id !== id) ?? null);
          schedule();
        } else if (event.eventType === 'DELETE' || !next.data || next.data === day) schedule();
      }).subscribe(status => {
        if (!active) return;
        connected = status === 'SUBSCRIBED';
        setOnline(connected);
        if (connected) schedule();
      });

    schedule();
    const fallback = setInterval(() => { if (!connected) schedule(); }, 45000);
    window.addEventListener('focus', schedule);
    return () => {
      active = false;
      clearTimeout(timer);
      clearInterval(fallback);
      window.removeEventListener('focus', schedule);
      void supabase.removeChannel(channel);
    };
  }, [unit, day, retry]);

  // Keep completed triage in today's history even after its consultation finishes.
  // All IDs still come exclusively from the selected unit and day.
  const ids = rows?.map(row => row.id).sort().join(',') || '';
  useEffect(() => {
    if (!ids) return;
    let alive = true, generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const all = ids.split(',');
    const channels = [];
    function sync() {
      if (timer !== undefined) return;
      timer = setTimeout(async () => {
        timer = undefined;
        const version = ++generation;
        try {
          const records = await readTriage(all);
          if (alive && generation === version) setTriage(records);
        } catch { if (alive) setError(true); }
      }, 140);
    }
    for (let i = 0; i < all.length; i += 80) {
      const batch = all.slice(i, i + 80);
      channels.push(supabase.channel('cockpit-triagem:' + unit + ':' + day + ':' + i)
        .on('postgres_changes', { schema: 'public', table: 'triage_records', event: '*', filter: 'agendamento_id=in.(' + batch.join(',') + ')' }, sync)
        .subscribe(status => { if (alive && status === 'SUBSCRIBED') sync(); }));
    }
    return () => {
      alive = false;
      clearTimeout(timer);
      channels.forEach(c => void supabase.removeChannel(c));
    };
  }, [ids, unit, day]);

  return { rows, triage, arrivals, starts, calledAt, lastSyncedAt, online, error, reload: () => setRetry(n => n + 1) };
}
