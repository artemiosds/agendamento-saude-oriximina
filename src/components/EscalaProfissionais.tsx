import { memo, useCallback, useDeferredValue, useEffect, useId, useMemo, useState } from 'react';
import { addDays, eachDayOfInterval, endOfMonth, format, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MapPin, Printer, Trash2, Pencil, Users, CalendarDays, ClipboardList, AlertTriangle, ShieldAlert, ChevronRight, ChevronLeft } from 'lucide-react';
import { CadastroEscala, type EscalaEditRequest } from './EscalaInformativa';
import { EscalaPeriodo } from './EscalaPeriodo';
import { resolveProfessionalCbo } from '@/lib/sigtapClinicalValidation';
import { dateKeyEscala, distribuirRegistros, localKeyEscala, minutesEscala as time, registros, summarizeEscalaDay, buildEscalaView, matchesEscalaCategory } from '@/lib/escalaInformativa';
import type { RegistroEscala, EscalaViewCategory } from '@/lib/escalaInformativa';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useOperacional } from '@/contexts/OperacionalContext';
import { useUnidadeFilter } from '@/hooks/useUnidadeFilter';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { openPrintDocument } from '@/lib/printLayout';
import { cn } from '@/lib/utils';
import { buildEscalaProfissionaisPrint } from '@/lib/escalaProfissionaisPrint';
import { toast } from 'sonner';

const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const localDate = (date: string) => new Date(date + 'T12:00:00');
const clock = (minutes: number) => String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
const slotKey = (person: string, unit: string, room: string | null | undefined, start: string, end: string) =>
  JSON.stringify([person, unit, room || '', start.slice(0, 5), end.slice(0, 5)]);
const normalized = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
const EMPTY: RegistroEscala[] = [];
const recordPlace = (r: RegistroEscala) => r.profissional
  ? r.unidade_oficial ? 'unidade:' + r.unidade_oficial : localKeyEscala(r.local || '')
  : r.local_avulso ? localKeyEscala(r.local_avulso) : 'unidade:' + r.unidade;
const coverageKey = (person: string, unit: string, start: number, duration: number) => JSON.stringify([person, unit, start, duration]);

interface Entrada {
  id: string;
  personId: string;
  person: string;
  place: string;
  placeGroup: string;
  start: number;
  hours: string;
  minutes: number;
  gradeKey?: string;
  unitId?: string;
  reason?: string;
  mode: string;
  duration?: number;
  informational?: boolean;
  continuation?: boolean;
  conflict?: boolean;
  currentInactive?: boolean;
  remove?: { id: string; recurring: boolean };
  editOccurrence?: {recordId:string;date:string};
}

type AgendaBlock = ReturnType<typeof useOperacional>['bloqueios'][number];
function applyBlocks(from: number, to: number, blocks: AgendaBlock[], unit: string, personId: string) {
  let spans = [[from, to]];
  const reasons: string[] = [];
  for (const b of blocks) {
    if ((b.unidadeId && b.unidadeId !== unit) || (b.profissionalId && b.profissionalId !== personId)) continue;
    const left = b.diaInteiro ? 0 : time(b.horaInicio);
    const right = b.diaInteiro ? 1440 : time(b.horaFim);
    if (left >= to || right <= from) continue;
    reasons.push(b.titulo || b.tipo);
    spans = spans.flatMap(([a, z]) => [[a, Math.min(z, left)], [Math.max(a, right), z]].filter(([l, r]) => l < r));
  }
  return { hours: spans.map(([a, z]) => clock(a) + '–' + clock(z)).join(', '),
    reason: reasons.join(', '), minutes: spans.reduce((sum, [a, z]) => sum + z - a, 0) };
}

const hoursLabel=(minutes:number)=>Math.floor(minutes/60)+'h'+(minutes%60?' '+minutes%60+'min':'');
const viewCards=[
  {key:'people',label:'Profissionais na escala',unit:'profissionais distintos',Icon:Users,tone:'text-primary'},
  {key:'grade',label:'Grade oficial',unit:'registros exibidos',Icon:CalendarDays,tone:'text-blue-700 dark:text-blue-300'},
  {key:'manual',label:'Escala informativa',unit:'registros exibidos',Icon:ClipboardList,tone:'text-teal-700 dark:text-teal-300'},
  {key:'blocked',label:'Bloqueios / ajustes',unit:'registros afetados',Icon:ShieldAlert,tone:'text-amber-700 dark:text-amber-300'},
  {key:'conflict',label:'Horários simultâneos',unit:'registros em conflito',Icon:AlertTriangle,tone:'text-destructive'},
] as const;
type Inspection={key:string;category:EscalaViewCategory;personId?:never;dayKey?:never}|{key:string;personId:string;dayKey:string;category?:never};

const CalendarDay = memo(function CalendarDay({ day, entries, compact, onRemove, onEdit }: { day: Date; entries: Entrada[]; compact: boolean; onRemove: (row: Entrada) => void; onEdit:(row:Entrada)=>void }) {
  const [expanded, setExpanded] = useState(false);
  const limit = compact ? 2 : 4;
  const today = dateKeyEscala(day) === dateKeyEscala(new Date());
  const audit=useMemo(()=>summarizeEscalaDay(entries),[entries]);
  return <section className={cn('min-w-0 rounded-lg border bg-card px-2.5 py-2', today && 'border-primary/50')}
    aria-label={format(day, "EEEE, dd 'de' MMMM", { locale: ptBR })}>
    <div className="flex items-center justify-between gap-1">
      <span className={cn('text-sm font-semibold capitalize', today ? 'text-primary' : 'text-foreground')}>{format(day, 'EEE dd', { locale: ptBR })}</span>
      {today && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Hoje</span>}
    </div>
    {entries.length>0&&<p className="mt-1 text-[11px] text-muted-foreground tabular-nums">{entries.length} {entries.length===1?'registro':'registros'} · {hoursLabel(audit.uniqueMinutes)} previstos</p>}
    {!entries.length && <p className="mt-2 text-xs text-muted-foreground">Sem escala cadastrada</p>}
    {entries.slice(0, expanded ? undefined : limit).map(r => <div key={r.id} className={cn('mt-2 rounded border-l-2 bg-muted/25 p-1.5 text-xs', r.conflict?'border-destructive':r.reason?'border-amber-500':r.informational ? 'border-teal-600' : 'border-blue-500')}>
      <div className="flex items-start justify-between gap-1">
        <p className="break-words font-semibold">{r.person}</p>
        <div className="flex shrink-0 items-center gap-0.5">
        {r.editOccurrence&&!r.continuation&&<button type="button" className="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary" title="Alterar apenas esta ocorrência" aria-label={'Alterar ocorrência de '+r.person} onClick={()=>onEdit(r)}><Pencil className="h-3.5 w-3.5" aria-hidden="true"/></button>}
        {r.remove && <button type="button" className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title={r.remove.recurring?'Encerrar recorrência':'Remover entrada manual'} aria-label={(r.remove.recurring?'Encerrar recorrência de ':'Remover escala de ') + r.person + ' em ' + r.place}
          onClick={() => onRemove(r)}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>}
        </div>
      </div>
      <p className="break-words text-muted-foreground">{r.place}</p>
      <p className="mt-1 font-medium tabular-nums">{r.hours || 'Bloqueado'}</p>
      <p className="text-[11px] text-muted-foreground">{r.mode}{r.duration ? ' · ' + r.duration + ' min' : ''}</p>
      {r.reason && <p className="mt-1 rounded bg-amber-100 px-1 text-amber-950">{r.reason}</p>}
      {r.conflict && <p className="mt-1 rounded bg-destructive/10 px-1 font-semibold text-destructive">Horário simultâneo · conferir</p>}
      {r.currentInactive && <p className="mt-1 text-muted-foreground">Cadastro atualmente inativo</p>}
    </div>)}
    {entries.length > limit && <button type="button" aria-expanded={expanded} className="mt-2 text-xs font-semibold text-primary hover:underline"
      onClick={() => setExpanded(!expanded)}>{expanded ? 'Mostrar menos' : 'Ver mais ' + (entries.length - limit)}</button>}
  </section>;
});

export function EscalaProfissionais() {
  return <Dialog><DialogTrigger asChild><Button variant="outline">Consultar Escala da Rede</Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] max-w-6xl overflow-y-auto"><DialogTitle>Escala dos Profissionais</DialogTitle><Escala /></DialogContent></Dialog>;
}

export function Escala() {
  const { user } = useAuth();
  const { can, loading:permissionsLoading }=usePermissions();
  const { funcionarios, disponibilidades, bloqueios, refreshDisponibilidades, refreshBloqueios, refreshFuncionarios, configuracoes, refreshConfiguracoes } = useOperacional();
  const { unidadesVisiveis, salasVisiveis, isGlobalAdmin, userUnidadeId } = useUnidadeFilter();
  const [place, setPlace] = useState('');
  const [name, setName] = useState('');
  const [profession,setProfession]=useState('');
  const [layout,setLayout]=useState<'calendar'|'grid'>('calendar');
  const [inspection,setInspection]=useState<Inspection>();
  const [inspectionPage,setInspectionPage]=useState(0);
  const [monthly, setMonthly] = useState(false);
  const [date, setDate] = useState(() => dateKeyEscala(new Date()));
  const [reload, setReload] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [snapshot, setSnapshot] = useState<{ key: string; rows: RegistroEscala[]; error?: string }>();
  const [target, setTarget] = useState<Entrada>();
  const [editRequest,setEditRequest]=useState<EscalaEditRequest>();
  const [endDate,setEndDate]=useState('');
  const [removing, setRemoving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const listId = useId();
  const deferredName = useDeferredValue(name);
  const { start, days } = useMemo(() => {
    const ref = localDate(date);
    const start = monthly ? new Date(ref.getFullYear(), ref.getMonth(), 1) : startOfWeek(ref, { weekStartsOn: 1 });
    return { start, days: eachDayOfInterval({ start, end: monthly ? endOfMonth(start) : addDays(start, 6) }) };
  }, [date, monthly]);
  const from = dateKeyEscala(start);
  const to = dateKeyEscala(days[days.length - 1]);
  const signedIn = !!user;
  const today = dateKeyEscala(new Date());
  const requestKey = [user?.id, userUnidadeId, isGlobalAdmin, from, to, reload].join('/');
  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    async function read() {
      try {
        const { data, error } = await supabase.rpc('listar_escalas_personalizadas' as never, { p_inicio: from, p_fim: to } as never);
        if (error) throw error;
        if (active) setSnapshot({ key: requestKey, rows: Array.isArray(data) ? data : EMPTY });
      } catch {
        if (active) setSnapshot({ key: requestKey, rows: EMPTY, error: 'Não foi possível carregar as escalas manuais deste período.' });
      }
    }
    void read();
    return () => { active = false; };
  }, [requestKey, from, to, signedIn]);
  const current = signedIn && snapshot?.key === requestKey ? snapshot : undefined;
  const manual = current?.rows ?? EMPTY;
  const canWrite = !!user && !permissionsLoading && ['master', 'coordenador', 'gestao'].includes(user.role) && (isGlobalAdmin || !!userUnidadeId) && can('disponibilidade','can_view');
  const canEnd=canWrite&&can('disponibilidade','can_edit');
  const canDelete=canWrite&&can('disponibilidade','can_delete');
  const formScope=JSON.stringify([user?.id,userUnidadeId,isGlobalAdmin]);
  useEffect(()=>{setEditRequest(undefined);setInspection(undefined);setProfession('');},[formScope]);
  const onEdit=useCallback((row:Entrada)=>{
    if(!canEnd||!current||current.error||!row.editOccurrence||row.continuation)return;
    setEditRequest(previous=>({...row.editOccurrence!,token:(previous?.token??0)+1}));
  },[canEnd,current]);
  const refreshScale = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await Promise.all([refreshDisponibilidades(), refreshBloqueios(), refreshFuncionarios(), refreshConfiguracoes()]); }
    catch { toast.error('Não foi possível confirmar todos os dados da grade. Tente novamente.'); }
    finally { setReload(n => n+1); setRefreshing(false); }
  };
  const onRemove = useCallback((row: Entrada) => { setRemoveError(''); setEndDate(dateKeyEscala(addDays(localDate(today),1))); setTarget(row); }, [today]);
  const onSaved = useCallback((savedDate: string) => {
    setDate(savedDate); setMonthly(true); setPlace(''); setName(''); setProfession(''); setReload(n => n + 1);
  }, []);
  const confirmRemove = async () => {
    if (!target?.remove || removing || !current || current.error || !manual.some(row=>row.id===target.remove?.id) || (target.remove.recurring?!canEnd:!canDelete)) return;
    if(target.remove.recurring&&(!endDate||endDate<today)){setRemoveError('Informe uma data de encerramento a partir de hoje.');return;}
    setRemoving(true);
    try {
      const { error } = target.remove.recurring
        ? await supabase.rpc('encerrar_escala_personalizada' as never, {p_id:target.remove.id,p_primeiro_dia_sem_escala:endDate} as never)
        : await supabase.rpc('remover_escala_personalizada' as never, { p_id: target.remove.id } as never);
      if (error) throw error;
      toast.success(target.remove.recurring?'Recorrência encerrada. O histórico foi preservado.':'Escala avulsa removida.');
      setTarget(undefined); setReload(n => n + 1);
    } catch (error) {
      setRemoveError((error as { message?: string }).message || 'Não foi possível remover a escala.');
    } finally {
      setRemoving(false);
    }
  };
  const units = useMemo(() => new Map(unidadesVisiveis.filter(u => isGlobalAdmin || u.id === userUnidadeId)
    .map(u => [u.id, u.nome])), [unidadesVisiveis, isGlobalAdmin, userUnidadeId]);
  const rooms = useMemo(() => new Map(salasVisiveis.map(s => [s.id, s.nome])), [salasVisiveis]);
  const turnLabels = useMemo(() => {
    const configured = (configuracoes as {config_fluxo_atendimento?: {turnos?: unknown}}).config_fluxo_atendimento?.turnos;
    const labels = new Map<string,string>();
    if (Array.isArray(configured)) for (const item of configured) {
      if (item && typeof item.id === 'string' && typeof item.nome === 'string' && item.nome.trim()) labels.set(item.id,item.nome);
    }
    return labels;
  }, [configuracoes]);
  const { staff, gradesByDay, externalPlaces } = useMemo(() => {
    const gradesByDay = Array.from({ length: 7 }, () => [] as typeof disponibilidades);
    const gradeStaff = new Set<string>();
    for (const grade of disponibilidades) {
      if (!units.has(grade.unidadeId)) continue;
      gradeStaff.add(grade.profissionalId);
      for (const weekday of new Set(grade.diasSemana)) gradesByDay[weekday]?.push(grade);
    }
    const externalPlaces = new Map<string, string>();
    const manualByPerson = new Map<string, RegistroEscala[]>();
    for (const r of manual) {
      if (!r.profissional) continue;
      const list = manualByPerson.get(r.profissional) ?? [];
      list.push(r);
      manualByPerson.set(r.profissional, list);
    }
    const staff = funcionarios.filter(p => p.role === 'profissional' && (p.ativo || (from < today && (gradeStaff.has(p.id) || manualByPerson.has(p.id) || registros(p).length > 0)))).flatMap(p => {
      const rows = [...registros(p), ...(manualByPerson.get(p.id) ?? [])];
      const visible = new Set(rows.filter(r => (r.profissional || r.local_avulso)
        ? isGlobalAdmin || (!!userUnidadeId && r.unidade === userUnidadeId) : units.has(r.unidade)).map(r => r.id));
      if (!isGlobalAdmin && !units.has(p.unidadeId) && !visible.size && !gradeStaff.has(p.id)) return [];
      for (const r of rows) {
        const label = r.profissional && !r.unidade_oficial ? r.local : r.local_avulso;
        if (label && visible.has(r.id)) externalPlaces.set(localKeyEscala(label), label);
      }
      return [{ p, rows, visible, search: normalized(p.nome) }];
    });
    return { staff, gradesByDay, externalPlaces: [...externalPlaces].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')) };
  }, [funcionarios, disponibilidades, units, isGlobalAdmin, userUnidadeId, manual, from, today]);
  const activePlace = place.startsWith('avulso:') && !externalPlaces.some(([key]) => key === place) ? '' : place;
  const professionOptions=useMemo(()=>[...new Set(staff.map(({p})=>p.profissao?.trim()||'Sem profissão informada'))].sort((a,b)=>a.localeCompare(b,'pt-BR')),[staff]);
  const selected = useMemo(() => {
    const query = normalized(deferredName);
    return staff.filter(s=>(!query||s.search.includes(query))&&(!profession||(s.p.profissao?.trim()||'Sem profissão informada')===profession));
  }, [staff, deferredName,profession]);
  const { calendar, summary, count, placeTotals, overlapMinutes, conflictDays, invalidHours, unidentifiedGrades } = useMemo(() => {
    const people = new Map(selected.map(({ p }) => [p.id, p]));
    const notesByDay = new Map<string, Entrada[]>();
    const projectedDays = [addDays(days[0], -1), ...days];
    const nextByDay = new Map(projectedDays.slice(0, -1).map((d, index) => [dateKeyEscala(d), dateKeyEscala(projectedDays[index + 1])]));
    const addNote = (date: string, note: Entrada) => {
      const list = notesByDay.get(date) ?? [];
      list.push(note);
      notesByDay.set(date, list);
    };
    for (const { p, rows, visible } of selected) {
      if (!visible.size) continue;
      // Project all rows, so an exception at another place still hides the original occurrence.
      for (const [key, entries] of distribuirRegistros(rows, projectedDays)) {
        for (const r of entries) {
          if (!visible.has(r.id) || (!p.ativo && key >= today) || (activePlace && activePlace !== recordPlace(r))) continue;
          const placeName = r.local || r.local_avulso || units.get(r.unidade) || '';
          const placeGroup = (r.unidade_oficial && units.get(r.unidade_oficial)) || placeName;
          const minutes = r.duracao ?? time(r.fim) - time(r.inicio);
          const start = time(r.inicio);
          const carry = r.duracao ? Math.max(0, start + minutes - 1440) : 0;
          const note: Entrada = { id: 'note:' + r.id, personId: p.id, person: p.nome, placeGroup,
            place: [placeName, r.setor || rooms.get(r.sala || '')].filter(Boolean).join(' - '),
            unitId: r.profissional || r.local_avulso ? undefined : r.unidade,
            gradeKey: r.profissional ? (r.unidade_oficial ? coverageKey(p.id, r.unidade_oficial, start, minutes) : undefined)
              : r.local_avulso ? undefined : slotKey(p.id, r.unidade, r.sala, r.inicio, r.fim),
            start, hours: r.inicio + '–' + (start + minutes >= 1440 && r.duracao ? '24:00' : r.fim),
            minutes: minutes - carry,
            mode: r.profissional ? 'Manual · ' + (r.semanal ? 'Semanal' : 'Avulsa') : 'Escala informativa', informational: true,
            currentInactive: !p.ativo,
            editOccurrence: r.profissional&&p.ativo&&canEnd&&key>=today&&(r.semanal||r.origem)&&rows.some(s=>s.semanal&&s.id===(r.origem||r.id)&&visible.has(s.id)&&(!s.fim_recorrencia||key<=s.fim_recorrencia)) ? {recordId:r.id,date:key}:undefined,
            remove: r.profissional && (r.semanal ? canEnd && (!r.fim_recorrencia || r.fim_recorrencia>=today) : canDelete && r.data>=today) ? { id: r.id, recurring: r.semanal } : undefined };
          if (key >= from) addNote(key, note);
          const next = nextByDay.get(key);
          if (carry && next && (p.ativo || next < today)) {
            addNote(next, { ...note, id: note.id + ':continuacao', gradeKey: undefined, minutes: carry,
              start: 0, hours: '00:00–' + r.fim, mode: 'Manual · Continuação', continuation: true });
          }
        }
      }
    }
    let count = 0, workDays = 0, minutes = 0, overlapMinutes = 0, conflictDays = 0, invalidHours = 0;
    const unidentified = new Set<string>();
    const knownProfessionals = new Set(funcionarios.filter(p=>p.role==='profissional').map(p=>p.id));
    const totals = new Map<string, { label: string; quantity: number }>();
    const calendar = days.map(day => {
      const key = dateKeyEscala(day);
      const entries: Entrada[] = [];
      const officialKeys = new Set<string>();
      const notes = notesByDay.get(key) ?? [];
      const manualCoverage = new Set(notes.filter(n => !n.unitId && n.gradeKey).map(n => n.gradeKey));
      const coveredUnits = new Map<string,string>();
      let dayBlocks: typeof bloqueios | undefined;
      for (const grade of gradesByDay[day.getDay()]) {
        const person = people.get(grade.profissionalId);
        if ((activePlace && activePlace !== 'unidade:' + grade.unidadeId) || key < grade.dataInicio || (grade.dataFim && key > grade.dataFim)) continue;
        if (!knownProfessionals.has(grade.profissionalId)) { if (!deferredName.trim()) unidentified.add(grade.id); continue; }
        if (!person || (!person.ativo && key >= today)) continue;
        officialKeys.add(slotKey(person.id, grade.unidadeId, grade.salaId, grade.horaInicio, grade.horaFim));
        const from = time(grade.horaInicio), to = time(grade.horaFim);
        const coverage = coverageKey(person.id, grade.unidadeId, from, to-from);
        if (manualCoverage.has(coverage)) { coveredUnits.set(coverage,grade.unidadeId); continue; }
        dayBlocks ??= bloqueios.filter(b => key >= b.dataInicio && key <= b.dataFim);
        entries.push({ id: 'grade:' + grade.id, personId: person.id, person: person.nome, placeGroup: units.get(grade.unidadeId) || '',
          place: [units.get(grade.unidadeId), grade.vagasPorHora > 0 ? rooms.get(grade.salaId || '') : (turnLabels.get(grade.salaId || '') || rooms.get(grade.salaId || '') || (grade.salaId ? 'Turno cadastrado: ' + grade.salaId : 'Turno sem identificação'))].filter(Boolean).join(' · '),
          start: from, ...applyBlocks(from, to, dayBlocks, grade.unidadeId, person.id),
          mode: grade.vagasPorHora > 0 ? 'Por hora' : 'Por turno', duration: grade.vagasPorHora > 0 ? grade.duracaoConsulta : undefined, currentInactive: !person.ativo });
      }
      for (const note of notes) {
        if (note.gradeKey && officialKeys.has(note.gradeKey)) continue;
        const blockUnit=note.unitId || (note.gradeKey ? coveredUnits.get(note.gradeKey) : undefined);
        if (blockUnit) {
          dayBlocks ??= bloqueios.filter(b => key >= b.dataInicio && key <= b.dataFim);
          entries.push({ ...note, ...applyBlocks(note.start, note.start + note.minutes, dayBlocks, blockUnit, note.personId) });
        } else entries.push(note);
      }
      entries.sort((a, b) => a.start - b.start || a.person.localeCompare(b.person, 'pt-BR') || a.place.localeCompare(b.place, 'pt-BR'));
      const audit = summarizeEscalaDay(entries);
      if (audit.uniqueMinutes > 0) workDays++;
      minutes += audit.uniqueMinutes;
      overlapMinutes += audit.overlapMinutes;
      invalidHours += audit.invalid;
      if (audit.conflicts.size) conflictDays++;
      for (const index of audit.conflicts) entries[index].conflict = true;
      for (const e of entries) if (e.minutes > 0 && e.placeGroup && !e.continuation) {
        const key = localKeyEscala(e.placeGroup);
        const previous = totals.get(key);
        totals.set(key, { label: previous?.label ?? e.placeGroup, quantity: (previous?.quantity ?? 0) + 1 });
      }
      count += entries.length;
      return { day, entries };
    });
    const summary = workDays + (workDays === 1 ? ' dia com escala' : ' dias com escala') + ' · ' + count + (count === 1 ? ' registro' : ' registros')
      + ' · ' + Math.floor(minutes / 60) + 'h ' + minutes % 60 + 'min de carga prevista sem sobreposição';
    return { calendar, summary, count, overlapMinutes, conflictDays, invalidHours, unidentifiedGrades:unidentified.size, placeTotals: [...totals.values()].sort((a, b) => b.quantity - a.quantity).map(({ label, quantity }) =>
      quantity + (quantity === 1 ? ' turno em ' : ' turnos em ') + label) };
  }, [selected, activePlace, days, from, gradesByDay, bloqueios, units, rooms, turnLabels, canEnd, canDelete, funcionarios, deferredName, today]);
  const presentation=useMemo(()=>buildEscalaView(calendar),[calendar]);
  const professionsById=useMemo(()=>new Map(selected.map(({p})=>[p.id,p.profissao||'Sem profissão informada'])),[selected]);
  const detailReady=!!current&&!current.error&&!refreshing&&name===deferredName;
  const inspectionKey=JSON.stringify([requestKey,activePlace,deferredName,profession]);
  const activeInspection=detailReady&&inspection?.key===inspectionKey?inspection:undefined;
  const details=useMemo(()=>{
    if(!activeInspection)return [];
    if(activeInspection.category){return calendar.map(({day,entries})=>({day,entries:entries.filter(e=>matchesEscalaCategory(e,activeInspection.category!))})).filter(d=>d.entries.length);}
    return calendar.filter(d=>dateKeyEscala(d.day)===activeInspection.dayKey).map(({day,entries})=>({day,entries:entries.filter(e=>e.personId===activeInspection.personId)}));
  },[calendar,activeInspection]);
  const detailTitle=activeInspection?.category?viewCards.find(c=>c.key===activeInspection.category)?.label:presentation.rows.find(r=>r.id===activeInspection?.personId)?.name;
  const detailPages=Math.max(1,Math.ceil(details.length/7));
  const pageIndex=Math.min(inspectionPage,detailPages-1);
  const inspectCategory=(category:EscalaViewCategory)=>{if(detailReady){setInspectionPage(0);setInspection({key:inspectionKey,category});}};
  const inspectCell=(personId:string,dayKey:string)=>{if(detailReady){setInspectionPage(0);setInspection({key:inspectionKey,personId,dayKey});}};
  const period = format(start, 'dd/MM/yyyy') + ' a ' + format(days[days.length - 1], 'dd/MM/yyyy');
  const print = async () => {
    if (printing || refreshing || name !== deferredName || !count || !current || current.error || invalidHours || unidentifiedGrades) return;
    setPrinting(true);
    try {
      const document = buildEscalaProfissionaisPrint({
        calendar, monthly,
        people: selected.map(({ p }) => ({ id: p.id, profession: p.profissao,
          registration: [p.tipoConselho, p.numeroConselho, p.ufConselho].filter(Boolean).join(' / '),
          cbo: resolveProfessionalCbo(p), unit: units.get(p.unidadeId) })),
        placeFilter: activePlace ? units.get(activePlace.replace(/^unidade:/, '')) || externalPlaces.find(([key]) => key === activePlace)?.[1] || activePlace : 'Todos os locais autorizados',
        professionalFilter: [deferredName,profession?'Profissão: '+profession:''].filter(Boolean).join(' · '), emittedBy: user?.nome || user?.usuario || 'Usuário autenticado',
      });
      await openPrintDocument(document.title, document.body, document.meta);
    } catch (error) {
      console.error('[Escala] Falha ao preparar impressão:', error);
      toast.error('Não foi possível preparar a escala. Tente novamente.');
    } finally {
      setPrinting(false);
    }
  };

  return <div className="space-y-4">
    <CadastroEscala key={formScope} date={date} entries={manual} onSavedDate={onSaved} editRequest={editRequest} />
    <section className="space-y-3 rounded-xl border bg-card p-3 sm:p-4" aria-label="Filtros da escala">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="font-semibold">Consultar escala</h3><p className="text-xs text-muted-foreground">{period}</p></div>
        <Button type="button" variant="outline" size="sm" disabled={refreshing} onClick={()=>void refreshScale()}>{refreshing?'Atualizando…':'Atualizar escala'}</Button>
        <Button type="button" variant="outline" size="sm" disabled={printing || refreshing || name !== deferredName || !count || !current || !!current.error || !!invalidHours || !!unidentifiedGrades} onClick={() => void print()}><Printer className="h-4 w-4" /> {printing ? 'Preparando escala…' : 'Imprimir Escala Oficial (A4)'}</Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex items-end gap-1" aria-label="Visão do calendário">
          <Button type="button" variant={!monthly ? 'secondary' : 'ghost'} aria-pressed={!monthly} onClick={() => setMonthly(false)}>Semanal</Button>
          <Button type="button" variant={monthly ? 'secondary' : 'ghost'} aria-pressed={monthly} onClick={() => setMonthly(true)}>Mensal</Button>
        </div>
        <EscalaPeriodo date={date} monthly={monthly} onChange={setDate} />
        <label className="min-w-0 space-y-1 text-xs font-medium"><span><MapPin className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Local</span>
          <select className={selectClass} value={activePlace} onChange={e => setPlace(e.target.value)}><option value="">Todos os locais autorizados</option>
            <optgroup label="Unidades cadastradas">{[...units].map(([id, label]) => <option key={id} value={'unidade:' + id}>{label}</option>)}</optgroup>
            {!!externalPlaces.length && <optgroup label="Locais avulsos">{externalPlaces.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</optgroup>}
          </select>
        </label>
        <label className="min-w-0 space-y-1 text-xs font-medium"><span>Profissional</span>
          <Input type="search" list={listId} placeholder="Pesquisar profissional" value={name} onChange={e => setName(e.target.value)} />
          <datalist id={listId}>{staff.map(({ p }) => <option key={p.id} value={p.nome} />)}</datalist>
        </label>
        <label className="min-w-0 space-y-1 text-xs font-medium"><span>Profissão</span><select className={selectClass} value={profession} onChange={e=>setProfession(e.target.value)}><option value="">Todas as profissões</option>{profession&&!professionOptions.includes(profession)&&<option value={profession}>{profession} (sem registros)</option>}{professionOptions.map(p=><option key={p} value={p}>{p}</option>)}</select></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2"><div className="flex flex-wrap gap-1" aria-label="Visualização da escala"><Button type="button" size="sm" variant={layout==='calendar'?'secondary':'ghost'} aria-pressed={layout==='calendar'} onClick={()=>setLayout('calendar')}>Calendário</Button><Button type="button" size="sm" variant={layout==='grid'?'secondary':'ghost'} aria-pressed={layout==='grid'} onClick={()=>setLayout('grid')}>Grade consolidada</Button></div>{(place||name||profession)&&<Button type="button" size="sm" variant="ghost" onClick={()=>{setPlace('');setName('');setProfession('');}}>Limpar filtros</Button>}</div>
    </section>
    {!current && signedIn && <p className="text-sm text-muted-foreground" role="status">Carregando escalas manuais…</p>}
    {current?.error && <div className="flex flex-wrap items-center gap-2 text-sm text-destructive" role="alert">
      {current.error}<Button type="button" size="sm" variant="outline" onClick={() => setReload(n => n + 1)}>Tentar novamente</Button>
    </div>}
    {conflictDays>0 && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>{conflictDays} {conflictDays===1?"dia com horários simultâneos":"dias com horários simultâneos"}</strong> · {Math.floor(overlapMinutes/60)}h {overlapMinutes%60}min descontados da soma. Os registros originais continuam visíveis. Confira todos os locais autorizados para identificar conflitos entre locais.</div>}
    {(invalidHours>0||unidentifiedGrades>0)&&<div role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">Conferência necessária: {invalidHours} horário(s) inválido(s) e {unidentifiedGrades} registro(s) sem profissional identificado no período e filtro. Não foram incluídos na carga; impressão bloqueada até a conferência.</div>}
    <section className="grid grid-cols-2 gap-2 lg:grid-cols-5" aria-label="Indicadores da escala no período e filtros atuais">{viewCards.map(({key,label,unit,Icon,tone})=><button key={key} type="button" disabled={!detailReady} onClick={()=>inspectCategory(key)} className="group min-w-0 rounded-lg border bg-card p-3 text-left transition hover:border-primary/50 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-70" aria-label={label+': '+presentation.totals[key]+'. Consultar registros'}><span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Icon className={cn('h-4 w-4 shrink-0',tone)} aria-hidden="true"/><span>{label}</span></span><span className="mt-1 flex items-center justify-between gap-1"><strong className={cn('text-2xl font-semibold tabular-nums',tone)}>{presentation.totals[key]}</strong><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true"/></span><span className="block text-[11px] text-muted-foreground">{unit}</span></button>)}</section>
    <p className="text-xs text-muted-foreground">Indicadores do período e filtros aplicados; uma continuação noturna é exibida no dia seguinte. Bloqueios e conflitos podem se sobrepor às categorias de origem.{!detailReady?' · Consulta em atualização ou parcial.':''}</p>
    <div className="space-y-2">
      <p className="text-sm font-medium" role="status">{summary}{!current||current.error?" · dados parciais":""}</p>
      {!!placeTotals.length && <ul className="flex flex-wrap gap-1.5" aria-label="Turnos por local">
        {placeTotals.map(total => <li key={total} className="rounded-full border bg-muted/30 px-2 py-0.5 text-xs">{total}</li>)}
      </ul>}
    </div>
    {layout==='calendar'?<div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
      {monthly&&['SEG','TER','QUA','QUI','SEX','SÁB','DOM'].map(d=><div key={d} className="hidden text-center text-[11px] font-semibold text-muted-foreground xl:block">{d}</div>)}
      {monthly && Array.from({ length: (start.getDay() + 6) % 7 }, (_, i) => <div key={i} className="hidden xl:block" aria-hidden="true" />)}
      {calendar.map(({ day, entries }) => <CalendarDay key={dateKeyEscala(day)} day={day} entries={entries} compact={monthly} onRemove={onRemove} onEdit={onEdit} />)}
    </div>:<section className="min-w-0 rounded-xl border bg-card" aria-label="Grade consolidada de profissionais"><div className="flex flex-wrap items-center justify-between gap-2 border-b p-3"><div><h3 className="text-sm font-semibold">Grade consolidada {monthly?'mensal':'semanal'}</h3><p className="text-xs text-muted-foreground">Clique em uma célula para consultar os registros e horários do dia.</p></div><span className="text-xs text-muted-foreground">{presentation.rows.length} profissionais · {calendar.length} dias</span></div>{!presentation.rows.length?<p className="p-4 text-sm text-muted-foreground">Nenhum registro de escala para os filtros atuais.</p>:<div className="max-h-[70vh] overflow-auto" tabIndex={0} aria-label="Tabela com rolagem horizontal e vertical"><table className="w-full border-separate border-spacing-0 text-xs"><thead><tr><th scope="col" className="sticky left-0 top-0 z-30 min-w-[170px] max-w-[220px] border-b border-r bg-card p-2 text-left">Profissional</th>{calendar.map(({day})=><th key={dateKeyEscala(day)} scope="col" className={cn('sticky top-0 z-10 min-w-[65px] border-b border-r bg-card px-2 py-2 text-center whitespace-nowrap',day.getDay()%6===0&&'bg-muted',dateKeyEscala(day)===today&&'text-primary')}><span className="block text-[10px] uppercase text-muted-foreground">{format(day,'EEE',{locale:ptBR})}</span><span className="font-semibold tabular-nums">{format(day,'dd')}</span></th>)}<th scope="col" className="sticky top-0 z-10 min-w-[84px] border-b bg-card p-2 text-right whitespace-nowrap">Total previsto</th></tr></thead><tbody>{presentation.rows.map(person=><tr key={person.id}><th scope="row" className="sticky left-0 z-20 min-w-[170px] max-w-[220px] border-b border-r bg-card p-2 text-left font-medium"><span className="block break-words">{person.name}</span><span className="block text-[10px] font-normal text-muted-foreground">{professionsById.get(person.id)}{person.inactive?' · Inativo':''}</span></th>{calendar.map(({day})=>{const key=dateKeyEscala(day),entries=person.cells.get(key)??[];const audit=summarizeEscalaDay(entries);const conflict=entries.some(e=>e.conflict),blocked=entries.some(e=>e.reason),grade=entries.some(e=>!e.informational),manual=entries.some(e=>e.informational);return <td key={key} className="border-b border-r p-1 text-center"><button type="button" disabled={!detailReady} onClick={()=>inspectCell(person.id,key)} aria-label={person.name+' em '+format(day,'dd/MM/yyyy')+': '+(entries.length?hoursLabel(audit.uniqueMinutes)+' previstos, '+entries.length+' registros':'sem escala cadastrada')+(conflict?', conflito':'')+(blocked?', bloqueio':'')} className={cn('min-h-[39px] w-full rounded px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:ring-1 hover:ring-primary whitespace-nowrap',conflict?'bg-destructive/10 text-destructive':blocked?'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-200':manual&&grade?'bg-muted text-foreground':manual?'bg-teal-100 text-teal-950 dark:bg-teal-950 dark:text-teal-200':grade?'bg-blue-100 text-blue-950 dark:bg-blue-950 dark:text-blue-200':'text-muted-foreground')}><span className="block font-semibold tabular-nums">{entries.length?(audit.invalid?'Conferir':hoursLabel(audit.uniqueMinutes)):'–'}</span>{entries.length>0&&<span className="block text-[10px]">{[grade?'G':'',manual?'I':'',blocked?'B':'',conflict?'!':''].filter(Boolean).join(' · ')}</span>}</button></td>})}<td className="border-b p-2 text-right font-semibold tabular-nums whitespace-nowrap">{hoursLabel(person.minutes)}</td></tr>)}</tbody></table></div>}<p className="border-t p-3 text-[11px] text-muted-foreground">G = grade oficial · I = informativa · B = bloqueio/ajuste · ! = conflito · – = sem escala cadastrada (não significa folga). Total sem duplicar horas do mesmo profissional.</p></section>}
    <Dialog open={!!activeInspection} onOpenChange={open=>{if(!open)setInspection(undefined);}}><DialogContent className="max-h-[85dvh] max-w-4xl overflow-y-auto"><DialogTitle>{detailTitle||'Detalhes da escala'}</DialogTitle><DialogDescription>{activeInspection?.dayKey?format(localDate(activeInspection.dayKey),'dd/MM/yyyy'):period} · {details.reduce((sum,d)=>sum+d.entries.length,0)} registros exibidos. Consulta conforme os filtros atuais.</DialogDescription>{!details.some(d=>d.entries.length)?<p className="rounded-lg border p-3 text-sm text-muted-foreground">Nenhum registro para esta seleção.</p>:<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{details.slice(pageIndex*7,pageIndex*7+7).map(({day,entries})=><CalendarDay key={dateKeyEscala(day)} day={day} entries={entries} compact={false} onEdit={row=>{setInspection(undefined);onEdit(row);}} onRemove={row=>{setInspection(undefined);onRemove(row);}}/>)}</div>}{detailPages>1&&<div className="flex items-center justify-between gap-2"><Button type="button" size="sm" variant="outline" disabled={pageIndex===0} onClick={()=>setInspectionPage(pageIndex-1)}><ChevronLeft className="h-4 w-4"/> Anterior</Button><span className="text-xs text-muted-foreground">{pageIndex+1} de {detailPages}</span><Button type="button" size="sm" variant="outline" disabled={pageIndex+1>=detailPages} onClick={()=>setInspectionPage(pageIndex+1)}>Próxima <ChevronRight className="h-4 w-4"/></Button></div>}</DialogContent></Dialog>
    <AlertDialog open={!!target} onOpenChange={open => { if (!open && !removing) setTarget(undefined); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{target?.remove?.recurring ? 'Encerrar a série semanal?' : 'Remover esta escala?'}</AlertDialogTitle>
          <AlertDialogDescription>
            {target?.person} · {target?.place} · {target?.hours}. {target?.remove?.recurring
              ? 'A repetição termina a partir da data escolhida. Datas anteriores e ocorrências alteradas separadamente serão mantidas. A Agenda não muda.'
              : 'Somente esta entrada manual será removida. A agenda de atendimentos não muda.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {target?.remove?.recurring&&<label className="space-y-1 text-sm font-medium">Primeiro dia sem repetição<Input type="date" min={today} value={endDate} onChange={event=>setEndDate(event.target.value)} disabled={removing}/></label>}
        {removeError && <p role="alert" className="text-sm text-destructive">{removeError}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={removing || (target?.remove?.recurring ? !canEnd||!endDate||endDate<today : !canDelete)} onClick={event => { event.preventDefault(); void confirmRemove(); }}>
            {removing ? 'Processando…' : target?.remove?.recurring ? 'Encerrar recorrência' : 'Remover escala'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
