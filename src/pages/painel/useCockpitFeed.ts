import { careStage } from '@/lib/unitCockpit';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const fields = 'id,paciente_id,paciente_nome,sala_id,profissional_id,profissional_nome,status,tipo,iniciado_em,concluido_em' as const;
function page(unit: string, day: string, offset: number) {
  return supabase.from('agendamentos').select(fields).eq('unidade_id', unit).eq('data', day)
    .order('id').range(offset, offset + 499);
}

async function readAppointments(unit: string, day: string) {
  const first = await page(unit, day, 0);
  if (first.error) throw first.error;
  const rows = [...first.data];
  while (rows.length && rows.length % 500 === 0) {
    const next = await page(unit, day, rows.length);
    if (next.error) throw next.error;
    if (!next.data.length) break;
    rows.push(...next.data);
  }
  return rows;
}

async function readTriage(ids: string[]) {
  const query = (batch: string[]) => supabase.from('triage_records')
    .select('agendamento_id,iniciado_em,confirmado_em,classificacao_risco,tecnico_id').in('agendamento_id', batch);
  const records: NonNullable<Awaited<ReturnType<typeof query>>['data']> = [];
  for (let i = 0; i < ids.length; i += 80) {
    const result = await query(ids.slice(i, i + 80));
    if (result.error) throw result.error;
    records.push(...result.data);
  }
  return records;
}

export function useCockpitFeed(unit: string, day: string) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof readAppointments>> | null>(null);
  const [triage, setTriage] = useState<Awaited<ReturnType<typeof readTriage>>>([]);
  const [arrivals, setArrivals] = useState<Record<string,string>>({});
  const [online, setOnline] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true, busy = false, dirty = false;
    let known = new Map<string,string>();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      if (!active) return;
      if (busy) { dirty = true; return; }
      busy = true;
      try {
        const appointments = await readAppointments(unit, day);
        const records = await readTriage(appointments.map(a => a.id));
        if (active) { known = new Map(appointments.map(a => [a.id, a.status])); setRows(appointments); setTriage(records); setError(false); }
      } catch { if (active) setError(true); }
      finally { busy = false; if (dirty && active) { dirty = false; schedule(); } }
    }
    function schedule() { clearTimeout(timer); timer = setTimeout(refresh, 180); }
    setOnline(false);
    const channel = supabase.channel('cockpit:' + unit + ':' + day)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos', filter: 'unidade_id=eq.' + unit }, event => {
        const next = event.new as { id?: string; data?: string; status?: string };
        if (next.id && next.data === day && next.status) {
          const prior = known.get(next.id);
          if (prior && careStage(prior) === 'outside' && ['confirmado_chegada','chegada_confirmada','apto_atendimento'].includes(next.status)) {
            const id = next.id;
            setArrivals(previous => ({...previous, [id]: event.commit_timestamp}));
          }
          known.set(next.id, next.status);
        }
        const dates = [event.old, event.new].map(row => (row as { data?: string }).data);
        if (!dates.every(Boolean) || dates.includes(day)) schedule();
      }).subscribe(status => {
        if (!active) return;
        setOnline(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') schedule();
      });
    schedule();
    window.addEventListener('focus', schedule);
    return () => { active = false; clearTimeout(timer); window.removeEventListener('focus', schedule); void supabase.removeChannel(channel); };
  }, [unit, day, retry]);
  // Drafts are saved before the appointment changes status. Listen only to today's linked records.
  const ids = rows?.map(row => row.id).join(',') || '';
  useEffect(() => {
    if (!ids) return;
    let alive = true;
    let generation = 0;
    const all = ids.split(',');
    const channels = [];
    for (let i = 0; i < all.length; i += 80) {
      const batch = all.slice(i, i + 80);
      const sync = async () => {
        const version = ++generation;
        try {
          const records = await readTriage(all);
          if (alive && generation === version) setTriage(records);
        } catch { if (alive) setError(true); }
      };
      channels.push(supabase.channel('cockpit-triagem:' + unit + ':' + i)
        .on('postgres_changes', { schema: 'public', table: 'triage_records', event: '*', filter: 'agendamento_id=in.(' + batch.join(',') + ')' }, sync)
        .subscribe());
    }
    return () => { alive = false; channels.forEach(c => void supabase.removeChannel(c)); };
  }, [ids, unit]);
  return { rows, triage, arrivals, online, error, reload: () => setRetry(n => n + 1) };
}
