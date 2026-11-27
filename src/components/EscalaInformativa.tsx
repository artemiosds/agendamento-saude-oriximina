import { useId, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { eachDayOfInterval, endOfMonth, format, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, ChevronDown, Clock3, MapPin, Plus, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useOperacional } from '@/contexts/OperacionalContext';
import { useUnidadeFilter } from '@/hooks/useUnidadeFilter';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { dateKeyEscala, durationEscala, localKeyEscala, MAX_DATAS_ESCALA, minutesEscala, buildEscalaSelection, previewEscalaConflicts, weekdayEscala } from '@/lib/escalaInformativa';
import type { RegistroEscala } from '@/lib/escalaInformativa';

type Mode = 'avulsa' | 'semanal' | 'excecao';
const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const toDate = (value: string) => new Date(value + 'T12:00:00');
const hourLabel = (value: string) => value.slice(0, 2) + 'h' + (value.slice(3) === '00' ? '' : value.slice(3));
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
  const { disponibilidades }=useOperacional();
  const { can, loading:permissionsLoading }=usePermissions();
  const canCreate=!permissionsLoading&&can('disponibilidade','can_view')&&can('disponibilidade','can_create');
  const canEdit=!permissionsLoading&&can('disponibilidade','can_view')&&can('disponibilidade','can_edit');
  const { isGlobalAdmin, userUnidadeId, profissionaisVisiveis, unidadesVisiveis } = useUnidadeFilter();
  const formId = useId();
  const staffId = useId();
  const placesId = useId();
  const placeHintId = useId();
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
  const [rangeStart,setRangeStart]=useState('');
  const [rangeEnd,setRangeEnd]=useState('');
  const [month, setMonth] = useState(() => toDate(date));
  const [shift, setShift] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const staff = useMemo(() => {
    const people = profissionaisVisiveis.filter(p => isGlobalAdmin || (!!userUnidadeId && p.unidadeId === userUnidadeId));
    const counts = new Map<string, number>();
    for (const p of people) counts.set(p.nome, (counts.get(p.nome) ?? 0) + 1);
    return people.map(p => ({ id: p.id, profession:p.profissao||'Profissional', unit:p.unidadeId, label: (counts.get(p.nome) ?? 0) > 1 ? p.nome + ' · ' + (p.profissao || 'Profissional') + ' · ' + p.id.slice(0, 8) : p.nome }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [profissionaisVisiveis, isGlobalAdmin, userUnidadeId]);
  const selectedPerson=staff.find(p=>p.label===personName);
  const person=selectedPerson?.id;
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
  const duration = durationEscala(startTime, endTime, shift === 'plantao24');
  const selection=useMemo(()=>buildEscalaSelection(sortedDates,mode==='semanal',duration),[sortedDates,mode,duration]);
  const weeklyDays=selection.count;
  const matchingUnits=units.filter(u=>localKeyEscala(u.nome)===localKeyEscala(placeName));
  const official=matchingUnits.length===1?matchingUnits[0]:undefined;
  const conflicts=useMemo(()=>previewEscalaConflicts({personId:person||'',unitId:official?.id??null,dates:selection.effective,start:minutesEscala(startTime),duration,origin:mode==='excecao'?source:null,manual:entries,grades:disponibilidades}),[person,official?.id,selection.effective,startTime,duration,mode,source,entries,disponibilidades]);
  const hasPermission=mode==='excecao'?canEdit:canCreate;
  const canSubmit=hasPermission&&!!person&&!!placeName.trim()&&matchingUnits.length<2&&Number.isFinite(duration)&&duration>0&&selection.count>0&&(mode!=='excecao'||!!chosenSource);
  const nextDay = duration > 0 && minutesEscala(startTime) + duration >= 1440;
  const selectionLabel = mode === 'semanal'
    ? weeklyDays + (weeklyDays === 1 ? ' dia por semana' : ' dias por semana')
    : dates.length + (dates.length === 1 ? ' data' : ' datas');
  if (!user || !['master', 'gestao', 'coordenador'].includes(user.role) || (!isGlobalAdmin && !userUnidadeId) || (!canCreate&&!canEdit)) return null;

  const isDisabled = (d: Date) => mode === 'excecao' && (!chosenSource || dateKeyEscala(d) < chosenSource.data || (!!chosenSource.fim_recorrencia&&dateKeyEscala(d)>chosenSource.fim_recorrencia) || d.getDay() !== weekdayEscala(chosenSource.data));
  const applyRange=()=>{
    const start=toDate(rangeStart),end=toDate(rangeEnd);
    if(!rangeStart||!rangeEnd||!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<start||Math.round((end.getTime()-start.getTime())/86400000)>=MAX_DATAS_ESCALA){setStatus({error:true,text:'Informe um intervalo válido de até 90 dias.'});return;}
    const selected=new Map(dates.map(day=>[dateKeyEscala(day),day]));
    const allowed=eachDayOfInterval({start,end}).filter(d=>!isDisabled(d));
    if(!allowed.length){setStatus({error:true,text:'Não há ocorrências válidas nesse intervalo.'});return;}
    for(const day of allowed)selected.set(dateKeyEscala(day),day);
    if(selected.size>MAX_DATAS_ESCALA){setStatus({error:true,text:'Você pode marcar até 90 dias por salvamento.'});return;}
    setDates([...selected.values()]);setMonth(start);setStatus(undefined);
  };
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
    setDates([...selected.values()]);setStatus(undefined);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving.current) return;
    if(mode==='excecao'?!canEdit:!canCreate){setStatus({error:true,text:'Seu perfil não possui permissão para esta ação.'});return;}
    if(mode==='excecao'&&dates.some(isDisabled)){setStatus({error:true,text:'Selecione apenas ocorrências dentro da série original.'});return;}
    if (!person || !placeName.trim() || !duration || !dates.length || (mode === 'excecao' && !chosenSource)) {
      setStatus({ error: true, text: 'Selecione um profissional da lista, informe local e horário e marque os dias no calendário.' });
      return;
    }
    if(!canSubmit){setStatus({error:true,text:'Confira profissional, local, horário e datas antes de salvar.'});return;}
    if(conflicts.length&&!window.confirm('Há possíveis conflitos nos registros carregados. Deseja enviar para a validação definitiva do banco? Nenhuma alteração será feita se o banco identificar conflito.'))return;
    saving.current = true;
    setBusy(true);
    setStatus(undefined);
    try {
      const { data, error } = await supabase.rpc('salvar_escalas_personalizadas' as never, {
        p_profissional: person, p_unidade: official?.id ?? null,
        p_local: placeName.trim(), p_setor: sector.trim() || null,
        p_datas: selection.effective, p_inicio: startTime, p_duracao: duration,
        p_semanal: mode === 'semanal', p_origem: mode === 'excecao' ? source : null,
      } as never);
      if (error) throw error;
      const count = Number(data);
      if (!Number.isInteger(count) || count !== selection.count) throw new Error('O banco não confirmou a quantidade esperada. Atualize a escala antes de repetir o salvamento.');
      setStatus({ text: mode === 'semanal'
        ? 'Escala semanal salva em ' + count + (count === 1 ? ' dia da semana.' : ' dias da semana.')
        : count + (count === 1 ? ' data salva na escala.' : ' datas salvas na escala.') });
      setDates([]);setRangeStart('');setRangeEnd('');
      onSavedDate(selection.effective[0]);
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
        if(!open&&!canCreate&&canEdit)setMode('excecao');
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
              {selectedPerson&&<span className="block text-xs text-muted-foreground">{selectedPerson.profession} · {unidadesVisiveis.find(u=>u.id===selectedPerson.unit)?.nome||'Lotação não identificada'}</span>}
              {personName&&!person&&<span className="block text-xs text-destructive">Selecione um profissional da lista.</span>}
            </label>
            <div className="space-y-2">
              <label className="block space-y-1.5 text-sm font-medium">
                <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-primary" aria-hidden="true" /> Local de trabalho</span>
                <Input required list={placesId} maxLength={100} value={placeName} onChange={e => setPlaceName(e.target.value)}
                  aria-describedby={placeHintId} placeholder="Escolha ou digite um local" />
              </label>
              <datalist id={placesId}>{suggestions.map(p => <option key={p} value={p} />)}</datalist>
              <p id={placeHintId} className="text-xs text-muted-foreground">
                {matchingUnits.length>1?'Há unidades com o mesmo nome. Confira o cadastro antes de salvar.':official?'Unidade oficial: '+official.nome:placeName.trim()?'Local avulso (informativo).':'Escolha uma unidade ou digite outro local.'} Isso não abre vagas na Agenda.
              </p>
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
            {duration>0&&Number.isFinite(duration)&&<p className="text-xs font-medium text-primary">Duração: {Math.floor(duration/60)}h {duration%60}min{nextDay?' · termina no dia seguinte':''}.</p>}
            {startTime&&endTime&&!duration&&<p className="text-xs text-destructive">Informe horários diferentes ou selecione Plantão de 24h.</p>}
            <fieldset className="space-y-2"><legend className="text-sm font-medium">Como cadastrar</legend>
              <div className="flex flex-wrap gap-2">{([
                ['avulsa', 'Datas avulsas'], ['semanal', 'Repetir toda semana'], ['excecao', 'Alterar ocorrências'],
              ] as const).filter(([m]) => m === 'excecao' ? canEdit&&(sources.length||mode==='excecao') : canCreate).map(([m, label]) =>
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
                  {format(toDate(r.data), 'EEEE', { locale: ptBR })} · {r.inicio}–{r.fim} · {r.local} · início {format(toDate(r.data),'dd/MM/yy')}{r.fim_recorrencia?' · fim '+format(toDate(r.fim_recorrencia),'dd/MM/yy'):''}
                </option>)}</select>
              </label>}
              {mode==='excecao'&&chosenSource&&<div className="rounded-md border p-2 text-xs"><p className="font-medium">Alterações já cadastradas no período</p>{entries.filter(r=>r.profissional===person&&r.origem===source).length===0?<p className="text-muted-foreground">Nenhuma ocorrência alterada nos dados carregados.</p>:<div className="flex flex-wrap gap-1 mt-1">{entries.filter(r=>r.profissional===person&&r.origem===source).sort((a,b)=>a.data.localeCompare(b.data)).map(r=><Button key={r.id} type="button" size="sm" variant="outline" className="h-auto py-1 text-xs" disabled={isDisabled(toDate(r.data))} onClick={()=>{setDates([toDate(r.data)]);setMonth(toDate(r.data));setPlaceName(r.local||'');setSector(r.setor||'');setStartTime(r.inicio);setEndTime(r.fim);setShift(r.duracao===1440?'plantao24':'');setStatus(undefined);}}>{format(toDate(r.data),'dd/MM/yy')} · {r.inicio}–{r.fim}</Button>)}</div>}</div>}
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
              {[[1,'Seg'],[2,'Ter'],[3,'Qua'],[4,'Qui'],[5,'Sex'],[6,'Sáb'],[0,'Dom']].map(([day,label])=><Button key={day} type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={()=>toggleDays([Number(day)])}>{label}</Button>)}
              <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={()=>toggleDays([1,2,3,4,5])}>Seg a sex</Button>
              <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={()=>toggleDays([6,0])}>Finais de semana</Button>
              <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={()=>toggleDays([0,1,2,3,4,5,6])}>Mês inteiro</Button>
            </div>
            <div className="border-t mt-2 pt-2 space-y-1"><p className="text-xs font-medium">Selecionar por intervalo</p><div className="grid grid-cols-2 gap-1"><label className="text-xs">De<Input type="date" value={rangeStart} onChange={e=>setRangeStart(e.target.value)}/></label><label className="text-xs">Até<Input type="date" value={rangeEnd} onChange={e=>setRangeEnd(e.target.value)}/></label></div><Button type="button" variant="outline" size="sm" className="w-full" onClick={applyRange} disabled={!rangeStart||!rangeEnd}>Adicionar datas do intervalo</Button></div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span aria-live="polite" className="text-xs font-semibold">{dates.length ? sortedDates.length + (sortedDates.length === 1 ? ' data marcada' : ' datas marcadas') : 'Nenhuma data marcada'}</span>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2" disabled={!dates.length} onClick={() => setDates([])}>Limpar seleção</Button>
            </div>
            {mode === 'semanal' && dates.length > 0 && <div className="mt-2 rounded border p-2 text-xs"><p className="font-medium">{weeklyDays} {weeklyDays === 1 ? 'dia da semana será repetido' : 'dias da semana serão repetidos'}</p>{selection.effective.map(d=><p key={d}>{format(toDate(d),'EEEE',{locale:ptBR})} a partir de {format(toDate(d),'dd/MM/yyyy')}</p>)}<p className="text-muted-foreground">Repetição semanal sem data final até ser encerrada.</p></div>}
            {!!dates.length && <ul aria-label="Datas selecionadas" className="mt-2 flex max-h-24 flex-wrap gap-1 overflow-auto">
              {sortedDates.map(d => <li key={d}><button type="button" aria-label={'Remover ' + format(toDate(d), 'dd/MM/yyyy')}
                onClick={() => setDates(previous => previous.filter(x => dateKeyEscala(x) !== d))}
                className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-xs text-primary hover:bg-primary/10">
                {format(toDate(d), 'dd/MM/yy')}<X className="h-3 w-3" aria-hidden="true" />
              </button></li>)}
            </ul>}
          </div>
        </div>
        <div className="space-y-2 border-t pt-4">
          {canSubmit&&<div className="rounded-md border p-3 text-xs space-y-1"><p className="font-semibold">Conferência prévia de horários</p>{conflicts.length>0?<><p className="text-destructive font-medium">{conflicts.length} possível(is) conflito(s) nos dados carregados.</p><ul className="max-h-32 overflow-auto space-y-1">{conflicts.map((v,i)=><li key={i}>{format(toDate(v.date),'dd/MM/yyyy')} · {v.label}</li>)}</ul></>:<p className="text-muted-foreground">Nenhum conflito identificado nas datas e registros carregados.</p>}<p className="text-muted-foreground">A prévia não cobre todas as ocorrências futuras nem outros dados não carregados. O banco faz a validação definitiva antes de gravar.</p></div>}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {dates.length > 0 && <div className="min-w-0 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
              <p className="text-xs font-semibold text-primary">Confira antes de salvar</p>
              <p className="break-words text-sm">
                {[
                  selectedPerson?.label||'Profissional não selecionado',
                  placeName.trim() || 'Local não informado',
                  sector.trim(),
                  duration ? hourLabel(startTime) + ' às ' + hourLabel(endTime) + (nextDay ? ' do dia seguinte' : '') : 'Horário não informado',
                  selectionLabel,
                  duration>0?Math.floor(selection.minutes/60)+'h '+selection.minutes%60+'min '+(mode==='semanal'?'por semana (nominal)':'previstos no lote'):'',
                ].filter(Boolean).join(' · ')}
              </p>
            </div>}
            <Button type="submit" className="shrink-0 self-start sm:self-center" disabled={busy || !canSubmit}>
              {busy ? 'Salvando…' : dates.length ? 'Salvar ' + selectionLabel : 'Salvar escala'}
            </Button>
          </div>
          {status && <span role={status.error ? 'alert' : 'status'} className={status.error ? 'text-sm text-destructive' : 'text-sm text-primary'}>{status.text}</span>}
        </div>
      </fieldset>
    </form>}
  </section>;
}
