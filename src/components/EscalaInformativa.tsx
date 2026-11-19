import { useId, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { eachDayOfInterval, endOfMonth, format, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, ChevronDown, Clock3, MapPin, Plus, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUnidadeFilter } from '@/hooks/useUnidadeFilter';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { dateKeyEscala, durationEscala, localKeyEscala, MAX_DATAS_ESCALA, minutesEscala, primeirasDatasSemanais, weekdayEscala } from '@/lib/escalaInformativa';
import type { RegistroEscala } from '@/lib/escalaInformativa';

type Mode = 'avulsa' | 'semanal' | 'excecao';
const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const toDate = (value: string) => new Date(value + 'T12:00:00');
const shifts = [
  { id: 'manha', label: 'Manhã · 08:00–12:00', start: '08:00', end: '12:00' },
  { id: 'tarde', label: 'Tarde · 14:00–18:00', start: '14:00', end: '18:00' },
  { id: 'integral', label: 'Integral · 08:00–17:00', start: '08:00', end: '17:00' },
  { id: 'plantao12', label: 'Plantão de 12h · 07:00–19:00', start: '07:00', end: '19:00' },
  { id: 'plantao24', label: 'Plantão de 24h · 07:00–07:00 do dia seguinte', start: '07:00', end: '07:00' },
] as const;

export function CadastroEscala({ date, entries, onSavedDate }: {
  date: string; entries: RegistroEscala[]; onSavedDate: (date: string) => void;
}) {
  const { user } = useAuth();
  const { isGlobalAdmin, userUnidadeId, profissionaisVisiveis, unidadesVisiveis } = useUnidadeFilter();
  const formId = useId();
  const staffId = useId();
  const placesId = useId();
  const saving = useRef(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean }>();
  const [busy, setBusy] = useState(false);
  const [personName, setPersonName] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [sector, setSector] = useState('');
  const [mode, setMode] = useState<Mode>('avulsa');
  const [source, setSource] = useState('');
  const [dates, setDates] = useState<Date[]>([]);
  const [month, setMonth] = useState(() => toDate(date));
  const [shift, setShift] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const staff = useMemo(() => {
    const people = profissionaisVisiveis.filter(p => isGlobalAdmin || (!!userUnidadeId && p.unidadeId === userUnidadeId));
    const counts = new Map<string, number>();
    for (const p of people) counts.set(p.nome, (counts.get(p.nome) ?? 0) + 1);
    return people.map(p => ({ id: p.id, label: (counts.get(p.nome) ?? 0) > 1 ? p.nome + ' · ' + (p.profissao || 'Profissional') + ' · ' + p.id.slice(0, 8) : p.nome }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [profissionaisVisiveis, isGlobalAdmin, userUnidadeId]);
  const person = staff.find(p => p.label === personName)?.id;
  const units = useMemo(() => unidadesVisiveis.filter(u => u.ativo && (isGlobalAdmin || u.id === userUnidadeId)), [unidadesVisiveis, isGlobalAdmin, userUnidadeId]);
  const suggestions = useMemo(() => {
    if (!open) return [];
    const places = new Map(entries.filter(r => r.local).map(r => [localKeyEscala(r.local!), r.local!]));
    for (const u of units) places.set(localKeyEscala(u.nome), u.nome);
    return [...places.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [open, entries, units]);
  const sources = useMemo(() => entries.filter(r => r.profissional === person && r.semanal), [entries, person]);
  const chosenSource = sources.find(r => r.id === source);
  const sortedDates = useMemo(() => dates.map(dateKeyEscala).sort(), [dates]);
  const weeklyDays = useMemo(() => primeirasDatasSemanais(sortedDates).length, [sortedDates]);
  const duration = durationEscala(startTime, endTime, shift === 'plantao24');
  const nextDay = duration > 0 && minutesEscala(startTime) + duration >= 1440;
  if (!user || !['master', 'gestao', 'coordenador'].includes(user.role) || (!isGlobalAdmin && !userUnidadeId)) return null;

  const isDisabled = (d: Date) => mode === 'excecao' && (!chosenSource || dateKeyEscala(d) < chosenSource.data || d.getDay() !== weekdayEscala(chosenSource.data));
  const toggleDays = (weekdays: number[]) => {
    const matching = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
      .filter(day => weekdays.includes(day.getDay()) && !isDisabled(day));
    if (!matching.length) return;
    const selected = new Map(dates.map(day => [dateKeyEscala(day), day]));
    const remove = matching.every(day => selected.has(dateKeyEscala(day)));
    for (const day of matching) {
      const key = dateKeyEscala(day);
      if (remove) selected.delete(key);
      else selected.set(key, day);
    }
    if (selected.size > MAX_DATAS_ESCALA) {
      setStatus({ error: true, text: 'Você pode marcar até 90 dias por salvamento.' });
      return;
    }
    setDates([...selected.values()]);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving.current) return;
    if (!person || !placeName.trim() || !duration || !dates.length || (mode === 'excecao' && !chosenSource)) {
      setStatus({ error: true, text: 'Selecione um profissional da lista, informe local e horário e marque os dias no calendário.' });
      return;
    }
    const official = units.find(u => localKeyEscala(u.nome) === localKeyEscala(placeName));
    saving.current = true;
    setBusy(true);
    setStatus(undefined);
    try {
      const { data, error } = await supabase.rpc('salvar_escalas_personalizadas' as never, {
        p_profissional: person, p_unidade: official?.id ?? null,
        p_local: placeName.trim(), p_setor: sector.trim() || null,
        p_datas: sortedDates, p_inicio: startTime, p_duracao: duration,
        p_semanal: mode === 'semanal', p_origem: mode === 'excecao' ? source : null,
      } as never);
      if (error) throw error;
      const count = Number(data);
      if (!Number.isInteger(count) || count < 1) throw new Error('A gravação não foi confirmada.');
      setStatus({ text: mode === 'semanal'
        ? 'Escala semanal salva em ' + count + (count === 1 ? ' dia da semana.' : ' dias da semana.')
        : count + (count === 1 ? ' data salva na escala.' : ' datas salvas na escala.') });
      setDates([]);
      onSavedDate(sortedDates[0]);
    } catch (error) {
      setStatus({ error: true, text: (error as { message?: string }).message || 'Não foi possível salvar a escala.' });
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  return <section className="rounded-xl border border-primary/20 bg-card">
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-primary/10 p-2 text-primary"><CalendarDays className="h-5 w-5" aria-hidden="true" /></span>
        <div><h3 className="text-sm font-semibold">Escala informativa</h3>
          <p className="text-sm text-muted-foreground">Informe onde o profissional trabalha, sem abrir vagas na agenda.</p></div>
      </div>
      <Button type="button" variant={open ? 'outline' : 'default'} aria-expanded={open} aria-controls={formId} onClick={() => {
        if (!open && dates.length === 0) setMonth(toDate(date));
        setOpen(!open);
      }}>
        {open ? <ChevronDown className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        {open ? 'Recolher cadastro' : 'Adicionar plantão / escala'}
      </Button>
    </div>
    {open && <form id={formId} onSubmit={save} className="border-t p-4">
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,370px)]">
          <div className="min-w-0 space-y-4">
            <label className="block space-y-1.5 text-sm font-medium"><span>Profissional</span>
              <Input required list={staffId} placeholder="Digite o nome e selecione na lista" value={personName}
                onChange={e => { setPersonName(e.target.value); setSource(''); if (mode === 'excecao') setDates([]); }} />
              <datalist id={staffId}>{staff.map(p => <option key={p.id} value={p.label} />)}</datalist>
            </label>
            <div className="space-y-2">
              <label className="block space-y-1.5 text-sm font-medium">
                <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-primary" aria-hidden="true" /> Local de trabalho</span>
                <Input required list={placesId} maxLength={100} value={placeName} onChange={e => setPlaceName(e.target.value)} placeholder="Escolha uma unidade ou digite um local" />
                <datalist id={placesId}>{suggestions.map(p => <option key={p} value={p} />)}</datalist>
                <span className="block text-xs font-normal text-muted-foreground">Locais digitados aparecem só na escala, sem criar unidades no sistema.</span>
              </label>
              <label className="block space-y-1.5 text-sm font-medium"><span>Setor ou sala (opcional)</span>
                <Input maxLength={100} value={sector} onChange={e => setSector(e.target.value)} placeholder="Ex. Sala de Parto" />
              </label>
            </div>
            <label className="block space-y-1.5 text-sm font-medium">
              <span className="flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-primary" aria-hidden="true" /> Turno</span>
              <select aria-label="Turno" className={selectClass} value={shift} onChange={e => {
                const picked = shifts.find(s => s.id === e.target.value);
                setShift(e.target.value);
                if (picked) { setStartTime(picked.start); setEndTime(picked.end); }
              }}>
                <option value="">Horário manual</option>{shifts.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-sm font-medium"><span>Início</span><Input required type="time" value={startTime} onChange={e => {
                setStartTime(e.target.value);
                if (shift === 'plantao24') setEndTime(e.target.value); else setShift('');
              }} /></label>
              <label className="space-y-1 text-sm font-medium"><span>Fim</span><Input required type="time" value={endTime}
                onChange={e => { setEndTime(e.target.value); setShift(''); }} /></label>
            </div>
            {nextDay && <p className="text-xs text-muted-foreground">Esse turno termina no dia seguinte.</p>}
            <fieldset className="space-y-2"><legend className="text-sm font-medium">Como cadastrar</legend>
              <div className="flex flex-wrap gap-2">{([
                ['avulsa', 'Datas avulsas'], ['semanal', 'Repetir toda semana'], ['excecao', 'Alterar ocorrências'],
              ] as const).filter(([m]) => m !== 'excecao' || sources.length || mode === 'excecao').map(([m, label]) =>
                <Button key={m} type="button" size="sm" variant={mode === m ? 'secondary' : 'outline'} aria-pressed={mode === m}
                  onClick={() => { setMode(m); if (m === 'excecao') setDates([]); }}>{label}</Button>)}</div>
              {mode === 'excecao' && <label className="block space-y-1 text-sm"><span>Horário semanal original</span>
                <select required className={selectClass} value={source} onChange={e => {
                  const next = sources.find(r => r.id === e.target.value);
                  setSource(e.target.value); setDates([]);
                  if (next) {
                    setPlaceName(next.local || ''); setSector(next.setor || ''); setMonth(toDate(date < next.data ? next.data : date));
                    setStartTime(next.inicio); setEndTime(next.fim); setShift(next.duracao === 1440 ? 'plantao24' : '');
                  }
                }}><option value="">Selecione o horário original</option>{sources.map(r => <option key={r.id} value={r.id}>
                  {format(toDate(r.data), 'EEEE', { locale: ptBR })} · {r.inicio}–{r.fim} · {r.local}
                </option>)}</select>
              </label>}
            </fieldset>
          </div>
          <div className="min-w-0 rounded-lg border bg-muted/20 p-3">
            <h4 className="text-sm font-semibold">Marque os dias no calendário</h4>
            <p className="text-xs text-muted-foreground">{mode === 'semanal'
              ? 'Cada dia da semana começa na primeira data marcada para ele.'
              : mode === 'excecao' ? 'Escolha as ocorrências que serão alteradas, sem mudar a série.'
              : 'Clique para marcar ou desmarcar. A seleção continua quando você muda de mês.'}</p>
            <Calendar mode="multiple" locale={ptBR} weekStartsOn={1} showOutsideDays={false} month={month} onMonthChange={setMonth}
              labels={{ labelNext: () => 'Próximo mês', labelPrevious: () => 'Mês anterior' }}
              selected={dates} max={MAX_DATAS_ESCALA} disabled={isDisabled} onSelect={value => setDates(value ?? [])}
              className="mx-auto w-fit max-w-full px-0"
              classNames={{
                head_cell: 'w-8 text-xs font-normal text-muted-foreground sm:w-9', cell: 'relative h-8 w-8 p-0 text-center sm:h-9 sm:w-9',
                day: 'inline-flex h-8 w-8 items-center justify-center rounded-md text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:w-9',
                day_selected: '!bg-[#2A6F97] !text-white hover:!bg-[#215976]',
              }} />
            <div className="flex flex-wrap gap-1.5 border-t pt-2" aria-label="Atalhos do mês exibido">
              <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => toggleDays([1])}>Segundas</Button>
              <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => toggleDays([2])}>Terças</Button>
              <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => toggleDays([6, 0])}>Finais de semana</Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span aria-live="polite" className="text-xs font-semibold">{dates.length ? sortedDates.length + (sortedDates.length === 1 ? ' data marcada' : ' datas marcadas') : 'Nenhuma data marcada'}</span>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2" disabled={!dates.length} onClick={() => setDates([])}>Limpar seleção</Button>
            </div>
            {mode === 'semanal' && dates.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{weeklyDays} {weeklyDays === 1 ? 'dia da semana será repetido' : 'dias da semana serão repetidos'}.</p>}
            {!!dates.length && <ul aria-label="Datas selecionadas" className="mt-2 flex max-h-24 flex-wrap gap-1 overflow-auto">
              {sortedDates.map(d => <li key={d}><button type="button" aria-label={'Remover ' + format(toDate(d), 'dd/MM/yyyy')}
                onClick={() => setDates(previous => previous.filter(x => dateKeyEscala(x) !== d))}
                className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-xs text-primary hover:bg-primary/10">
                {format(toDate(d), 'dd/MM/yy')}<X className="h-3 w-3" aria-hidden="true" />
              </button></li>)}
            </ul>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button type="submit" disabled={busy || !dates.length}>{busy ? 'Salvando…' : 'Salvar escala informativa'}</Button>
          {status && <span role={status.error ? 'alert' : 'status'} className={status.error ? 'text-sm text-destructive' : 'text-sm text-primary'}>{status.text}</span>}
        </div>
      </fieldset>
    </form>}
  </section>;
}
