import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Activity, Building2, ChevronRight, CircleCheck, Clock3, DoorOpen, Hospital, Maximize, Minimize, RefreshCw, UsersRound, X } from 'lucide-react';
import { CockpitAlerts, type CockpitAlert } from './CockpitAlerts';
import { PlantaUnidade, roomStatuses } from './PlantaUnidade';
import type { MapRoom, Risk, RoomState } from './PlantaUnidade';
import { useUnidadeFilter } from '@/hooks/useUnidadeFilter';
import { useOperacional } from '@/contexts/OperacionalContext';
import { careStage, cockpitDay, cockpitLabel, elapsedMinutes, freshCockpitCall, infusionVisit, isBottleneck, linkedRoomWaits, procedureVisit, roomSector, waitingTone } from '@/lib/unitCockpit';
import { useCockpitFeed } from './useCockpitFeed';
import type { CockpitAppointment } from './useCockpitFeed';
import { observarChamadas, type ChamadaPaciente } from '@/lib/painelChamadas';
import './hospitalVirtual.css';

const hourFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const clock = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? hourFormat.format(Date.parse(value)) : '—';
const dateLabel = (day: string) => day.split('-').reverse().join('/');
const riskOrder: Risk[] = ['vermelho', 'laranja', 'amarelo', 'verde', 'azul'];
const asRisk = (label: string | null | undefined) => riskOrder.find(risk => risk === cockpitLabel(label));
type Item = CockpitAppointment & { stage: ReturnType<typeof careStage>; arrival: string | null };
type RecordLine = { id: string; title: string; detail: string; tone?: string; journey: [string, string | null][] };
const WAIT_LIMIT = 20;
const VISIT_LIMIT = 90;
const orderNames = new Intl.Collator('pt-BR', { numeric: true });
const completionHour = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' });

function ShiftSummary({ completed, day, delayed }: { completed: Item[]; day: string; delayed: number }) {
  const [open, setOpen] = useState(false);
  const totals = new Map<string, number>();
  let covered = 0;
  if (open) {
    for (const item of completed) {
      const time = Date.parse(item.concluido_em || '');
      if (!Number.isFinite(time) || cockpitDay(time) !== day) continue;
      const hour = completionHour.format(time);
      totals.set(hour, (totals.get(hour) ?? 0) + 1);
      covered++;
    }
  }
  const peak = Math.max(0, ...totals.values());
  const busiest = [...totals].filter(([, total]) => total === peak).map(([hour]) => hour).sort();
  return <details className="cockpit-shift" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Resumo operacional de hoje</summary>
    {open && <dl>
      <div><dt>Concluídos na agenda do dia</dt><dd>{completed.length}</dd></div>
      <div><dt>Em atendimento há mais de {VISIT_LIMIT} min</dt><dd>{delayed}</dd></div>
      <div><dt>Horários com mais conclusões</dt><dd>{peak ? busiest.map(hour => hour + 'h').join(', ') + ' · ' + peak + ' por hora' : 'Sem horários registrados'}</dd>
        <small>{covered} de {completed.length} conclusões com horário registrado hoje.</small></div>
    </dl>}
  </details>;
}


function PatientJourney({ steps }: { steps: RecordLine['journey'] }) {
  const [open, setOpen] = useState(false);
  return <details className="cockpit-journey" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Jornada do paciente</summary>
    {open && <ol>{steps.map(([label, value]) => <li key={label}>
      <span>{label}</span>
      {value && clock(value) !== '—' ? <time dateTime={value}>{clock(value)}</time> : <span>Sem horário disponível</span>}
    </li>)}</ol>}
  </details>;
}

function RecordList({ records, empty }: { records: RecordLine[]; empty: string }) {
  const [limit, setLimit] = useState(12);
  if (!records.length) return <p className="planta-empty">{empty}</p>;
  return <>
    <ul className="planta-records">{records.slice(0, limit).map(item =>
      <li key={item.id} data-tone={item.tone}><div className="min-w-0">
        <strong>{item.title}</strong><span>{item.detail}</span>
        <PatientJourney steps={item.journey} />
      </div></li>
    )}</ul>
    {records.length > limit && <button type="button" className="planta-action" onClick={() => setLimit(n => n + 12)}>
      Ver mais ({records.length - limit})
    </button>}
  </>;
}

function Details({ title, onClose, children, indicator = false }: { title: string; onClose: () => void; children: ReactNode; indicator?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (typeof element.showModal === 'function') { if (!element.open) element.showModal(); }
    else element.setAttribute('open', '');
    close.current?.focus();
  }, []);
  return <dialog ref={dialog} className="planta-drawer" aria-labelledby="planta-detail-title" onCancel={e => { e.preventDefault(); onClose(); }}
    onClick={e => { if (e.target === e.currentTarget && e.clientX < e.currentTarget.getBoundingClientRect().left) onClose(); }}>
    <header><small>{indicator ? 'Detalhe do indicador' : 'Detalhe do setor'}</small><h2 id="planta-detail-title">{title}</h2>
      <button className="planta-control" type="button" aria-label="Fechar detalhes" ref={close} onClick={onClose}><X size={18} /></button>
    </header>
    <div className="planta-drawer-body">{children}</div>
  </dialog>;
}

export default function CockpitUnidade() {
  const { isGlobalAdmin, userUnidadeId, unidadesVisiveis } = useUnidadeFilter();
  const [selected, select] = useState('');
  const [now, setNow] = useState(Date.now);
  const [theater, setTheater] = useState(false);
  const board = useRef<HTMLElement>(null);
  const hadFullscreen = useRef(false);
  const restoreFocus = useRef<HTMLElement | SVGElement | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    const update = () => {
      if (document.fullscreenElement && document.fullscreenElement === board.current) hadFullscreen.current = true;
      else if (hadFullscreen.current) { hadFullscreen.current = false; setTheater(false); }
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.fullscreenElement) setTheater(false); };
    window.addEventListener('keydown', escape);
    document.addEventListener('fullscreenchange', update);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', escape);
      document.removeEventListener('fullscreenchange', update);
    };
  }, []);

  useEffect(() => {
    if (!theater && restoreFocus.current) {
      restoreFocus.current.focus({ preventScroll: true });
      restoreFocus.current = null;
    }
  }, [theater]);

  const toggleTheater = (button: HTMLButtonElement) => {
    if (theater) {
      setTheater(false);
      if (document.fullscreenElement && document.fullscreenElement === board.current) void document.exitFullscreen?.().catch(() => {});
    } else {
      restoreFocus.current = button;
      setTheater(true);
      void board.current?.requestFullscreen?.().catch(() => {});
    }
  };

  const units = unidadesVisiveis.filter(u => u.ativo !== false && (isGlobalAdmin || u.id === userUnidadeId));
  const unit = units.find(u => u.id === selected) || units[0];
  const day = cockpitDay(now);
  return <section ref={board} className="planta-cockpit" data-telao={theater} aria-label="Cockpit da Unidade">
    <header className="planta-header">
      <div className="planta-brand"><span className="planta-emblem"><Hospital size={23} aria-hidden="true" /></span>
        <div><span className="planta-kicker">Secretaria Municipal de Saúde</span><h1>Planta Viva <span>· Cockpit da Unidade</span></h1></div>
      </div>
      <div className="planta-tools">
        {isGlobalAdmin && !theater && <label className="planta-unit-select"><span>Unidade</span>
          <select title={unit?.nome} value={unit?.id || ''} disabled={!units.length} onChange={e => select(e.target.value)}>
            {units.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </label>}
        <button type="button" className="planta-control" onClick={e => toggleTheater(e.currentTarget)} aria-pressed={theater}>
          {theater ? <Minimize size={16} aria-hidden="true" /> : <Maximize size={16} aria-hidden="true" />}
          {theater ? 'Sair do modo telão' : 'Modo telão'}
        </button>
      </div>
    </header>
    {unit ? <Monitor key={unit.id + ':' + day} unit={unit.id} unitName={unit.nome} day={day} now={now} theater={theater} />
      : <p className="planta-empty planta-empty-unit">Nenhuma unidade disponível para esta conta.</p>}
  </section>;
}

function Monitor({ unit, unitName, day, now, theater }: { unit: string; unitName: string; day: string; now: number; theater: boolean }) {
  const [zone, setZone] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(() => new Set());
  const viewport = useRef<HTMLDivElement>(null);
  const lastTrigger = useRef<HTMLElement | SVGElement | null>(null);

  useEffect(() => { if (theater) setZone(null); }, [theater]);
  const closeZone = () => {
    setZone(null);
    requestAnimationFrame(() => lastTrigger.current?.isConnected && lastTrigger.current.focus({ preventScroll: true }));
  };
  const zoneElement = (id: string) => Array.from(viewport.current?.querySelectorAll<SVGElement>('[data-map-zone]') ?? []).find(el => el.dataset.mapZone === id);
  const openZone = (id: string, trigger?: HTMLElement) => { lastTrigger.current = trigger ?? zoneElement(id) ?? null; setZone(id); };
  const scrollToZone = (id?: string) => {
    const wrap = viewport.current;
    const target = id ? zoneElement(id) : wrap?.querySelector<SVGElement>('[data-state]');
    if (!target || !wrap) return;
    target.scrollIntoView({ block: 'nearest', inline: 'nearest',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    target.focus({ preventScroll: true });
  };
  const { salas, funcionarios } = useOperacional();
  const { rows, triage, arrivals, starts = {}, calledAt = {}, lastSyncedAt, online, connections, error, reload } = useCockpitFeed(unit, day);
  const [callsOnline, setCallsOnline] = useState(false);
  const [calls, setCalls] = useState<Record<string, ChamadaPaciente>>({});
  useEffect(() => observarChamadas(unit, call => setCalls(previous => {
    const timestamp = Date.parse(call.criadoEm);
    if ((call.unidadeId && call.unidadeId !== unit) || !Number.isFinite(timestamp) || cockpitDay(timestamp) !== day) return previous;
    const key = cockpitLabel(call.local);
    if (previous[key] && Date.parse(previous[key].criadoEm) > Date.parse(call.criadoEm)) return previous;
    const recent = Object.fromEntries(Object.entries(previous).filter(([, a]) => freshCockpitCall(a.criadoEm, Date.now())));
    return { ...recent, [key]: call };
  }), setCallsOnline), [unit, day]);

  const rooms = salas.filter(s => s.unidadeId === unit && s.ativo);
  const consultationIds = new Set(rooms.filter(r => roomSector(r.nome) === 'consultation').map(r => r.id));
  const roomById = new Map(rooms.map(r => [r.id, r]));
  const roomNameCounts = new Map<string, number>();
  for (const room of rooms) {
    const label = cockpitLabel(room.nome);
    roomNameCounts.set(label, (roomNameCounts.get(label) ?? 0) + 1);
  }
  const staff = new Map(funcionarios.filter(f => f.unidadeId === unit).map(f => [f.id, f]));
  const teamByRoom = new Map<string, typeof funcionarios>();
  for (const person of staff.values()) {
    if (!person.ativo || !person.salaId) continue;
    const sameRoom = teamByRoom.get(person.salaId) ?? [];
    sameRoom.push(person);
    teamByRoom.set(person.salaId, sameRoom);
  }
  const items = (rows || []).map<Item>(a => ({ ...a, stage: careStage(a.status), arrival: arrivals[a.id] || null }));
  const active = items.filter(a => a.stage !== 'outside' && a.stage !== 'done');
  const done = items.filter(a => a.stage === 'done');
  const itemById = new Map(items.map(a => [a.id, a]));
  const recordByAppointment = new Map<string, typeof triage[number]>();
  for (const record of triage) {
    if (!itemById.has(record.agendamento_id)) continue;
    const previous = recordByAppointment.get(record.agendamento_id);
    if (!previous || (record.iniciado_em || '') > (previous.iniciado_em || '')) recordByAppointment.set(record.agendamento_id, record);
  }
  const classifying = active.filter(a => {
    const tri = recordByAppointment.get(a.id);
    return a.stage === 'triage' || (a.stage === 'reception' && !!(tri?.iniciado_em && !tri?.confirmado_em));
  });
  const classifyingIds = new Set(classifying.map(a => a.id));
  const waiting = active.filter(a => ['reception', 'ready'].includes(a.stage) && !classifyingIds.has(a.id));
  const inside = new Set(active.map(a => a.paciente_id || a.id)).size;
  const waits = waiting.map(a => elapsedMinutes(a.arrival, now)).filter((v): v is number => v !== null);
  const average = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null;
  const visitsByRoom = new Map<string, Item[]>();
  const callingByRoom = new Map<string, Item>();
  const historyByRoom = new Map<string, Item[]>();
  for (const a of active) {
    if (a.stage === 'calling' && a.sala_id) callingByRoom.set(a.sala_id, a);
    if (a.stage !== 'consultation' || !a.sala_id) continue;
    const visits = visitsByRoom.get(a.sala_id) ?? [];
    visits.push(a);
    visitsByRoom.set(a.sala_id, visits);
  }
  for (const a of done) {
    if (!a.sala_id) continue;
    const history = historyByRoom.get(a.sala_id) ?? [];
    history.push(a);
    historyByRoom.set(a.sala_id, history);
  }
  const occupied = rooms.filter(r => visitsByRoom.has(r.id)).length;
  const procedureActive = active.filter(a => a.stage === 'consultation' && (roomSector(roomById.get(a.sala_id)?.nome || '') === 'procedure' || procedureVisit(a.tipo)));
  const procedureIds = new Set(procedureActive.map(a => a.id));
  const waitingCare = active.filter(a => a.stage === 'otherCare');
  const unmapped = active.filter(a => a.stage === 'consultation' && !roomById.has(a.sala_id));
  const waitsByRoom = linkedRoomWaits(waiting, consultationIds, now, WAIT_LIMIT);

  const roomViews = [...rooms].sort((a, b) => orderNames.compare(a.nome, b.nome)).map(room => {
    const visits = visitsByRoom.get(room.id) ?? [];
    const history = historyByRoom.get(room.id) ?? [];
    const team = (teamByRoom.get(room.id) ?? []).filter(f => f.role === 'profissional');
    const linkedWaits = [...(waitsByRoom.get(room.id)?.values() ?? [])];
    const overdue = linkedWaits.length;
    const roomLabel = cockpitLabel(room.nome);
    const call = roomNameCounts.get(roomLabel) === 1 ? calls[roomLabel] : undefined;
    const agendaCall = callingByRoom.get(room.id)?.paciente_nome;
    const stillCalling = call && freshCockpitCall(call.criadoEm, now)
      && !history.some(a => cockpitLabel(a.paciente_nome) === cockpitLabel(call.pacienteNome) && Date.parse(a.concluido_em || '') >= Date.parse(call.criadoEm));
    const calling = agendaCall || (stillCalling ? call.pacienteNome : '');
    const state: RoomState = visits.length ? 'occupied' : calling ? 'calling' : consultationIds.has(room.id) && isBottleneck(overdue) ? 'bottleneck' : 'free';
    const currentStaff = staff.get(visits[0]?.profissional_id || '');
    const specialty = currentStaff?.profissao || [...new Set(team.map(f => f.profissao).filter(Boolean))].join(' · ');
    const clinician = visits[0]?.profissional_nome || currentStaff?.nome || '';
    const elapsed = (a: Item) => elapsedMinutes(a.iniciado_em || starts[a.id] || null, now);
    const timedVisits = visits.map(elapsed).filter((min): min is number => min !== null);
    const map: MapRoom = {
      id: room.id, name: room.nome, state, specialty, staff: visits.length > 0 || !!calling, overdue,
      elapsed: timedVisits.length ? Math.max(...timedVisits) : null, completed: history.length,
      historyLabel: roomSector(room.nome) === 'triage' ? 'Triagem · ver detalhes' : undefined,
      patients: visits.map(a => ({ id: a.id })),
    };
    return { map, clinician, calling, visits, history, team, elapsed, linkedWaits };
  });
  const currentRooms = roomViews.map(room => room.map);
  const triageRisks = new Set(classifying.map(a => asRisk(recordByAppointment.get(a.id)?.classificacao_risco)));
  const highestRisk = riskOrder.find(risk => triageRisks.has(risk));
  const waitingSorted = waiting.map(a => ({ a, minutes: elapsedMinutes(a.arrival, now) }))
    .sort((a, b) => (b.minutes ?? -1) - (a.minutes ?? -1));
  const longest = waitingSorted[0]?.minutes ?? null;
  const receptionQueue = waitingSorted.filter(({ a }) => a.stage === 'reception');
  const readyQueue = waitingSorted.filter(({ a }) => a.stage === 'ready');
  // Only a recorded triage completion can anchor time since clearance.
  const clearedWait = (a: Item) => elapsedMinutes(recordByAppointment.get(a.id)?.confirmado_em ?? null, now);
  const longestReadyWait = readyQueue.reduce<number | null>((longestWait, { a }) => {
    const minutes = clearedWait(a);
    return minutes === null ? longestWait : Math.max(longestWait ?? 0, minutes);
  }, null);
  const waitHint = (count: number, minutes: number | null, origin: string) =>
    !count ? 'Sem espera' : minutes === null ? 'Sem horário registrado' : `Até ${minutes} min ${origin}`;
  const stages = [
    { id: 'aguardando-triagem', label: 'Aguardando triagem', count: receptionQueue.length,
      hint: waitHint(receptionQueue.length, receptionQueue[0]?.minutes ?? null, 'desde a chegada') },
    { id: 'triagem', label: 'Em classificação', count: classifying.length,
      hint: highestRisk ? 'Prioridade ' + highestRisk : classifying.length ? 'Classificação em curso' : 'Sem classificação em curso' },
    { id: 'aguardando-consulta', label: 'Aptos para consulta', count: readyQueue.length,
      hint: waitHint(readyQueue.length, longestReadyWait, 'desde a classificação') },
  ];
  const mapWaiting = waitingSorted.map(({ a, minutes }) => ({ id: a.id, tone: waitingTone(minutes) }));
  const mapProcedures = procedureActive.map(a => ({
    id: a.id, infusion: infusionVisit(a.tipo) || infusionVisit(roomById.get(a.sala_id)?.nome || ''),
  }));
  const metrics = [
    { id: 'indicador:presentes', icon: UsersRound, label: 'Pacientes na unidade', value: String(inside), hint: 'presentes' },
    { id: 'indicador:espera', icon: Clock3, label: 'Espera média · chegada', value: average === null ? '—' : average + ' min', hint: waits.length + ' com horário' },
    { id: 'indicador:salas', icon: DoorOpen, label: 'Salas em atendimento', value: occupied + '/' + rooms.length, hint: 'salas' },
    { id: 'indicador:concluidos', icon: CircleCheck, label: 'Concluídos hoje', value: String(done.length), hint: 'atendimentos' },
  ];

  const visitMinutes = (a: Item) => elapsedMinutes(a.iniciado_em || starts[a.id] || null, now);
  const sameNameInRoom = new Map<string, number>();
  if (zone && !theater) {
    for (const item of items) {
      const key = JSON.stringify([item.sala_id, cockpitLabel(item.paciente_nome)]);
      sameNameInRoom.set(key, (sameNameInRoom.get(key) ?? 0) + 1);
    }
  }
  const asRecord = (a: Item, text: string, tone?: string): RecordLine => {
    const record = recordByAppointment.get(a.id);
    const room = roomById.get(a.sala_id);
    const label = cockpitLabel(room?.nome);
    const call = room && roomNameCounts.get(label) === 1 ? calls[label] : undefined;
    const key = JSON.stringify([a.sala_id, cockpitLabel(a.paciente_nome)]);
    const broadcastCall = call && cockpitLabel(call.pacienteNome) === cockpitLabel(a.paciente_nome) &&
      sameNameInRoom.get(key) === 1 && (!a.concluido_em || Date.parse(call.criadoEm) <= Date.parse(a.concluido_em))
      ? call.criadoEm : null;
    return { id: a.id, title: a.paciente_nome, detail: text, tone, journey: [
      ['Chegada', a.arrival],
      ['Triagem iniciada', record?.iniciado_em ?? null],
      ['Triagem concluída', record?.confirmado_em ?? null],
      ['Chamada', calledAt[a.id] ?? broadcastCall],
      ['Atendimento iniciado', a.iniciado_em || starts[a.id] || null],
      ['Conclusão', a.concluido_em ?? null],
    ] };
  };

  const alerts: CockpitAlert[] = [];
  for (const room of roomViews) {
    const overdue = room.visits.filter(visit => (visitMinutes(visit) ?? 0) > VISIT_LIMIT);
    if (overdue.length) alerts.push({
      id: `tempo:${room.map.id}`, zones: [room.map.id], title: room.map.name,
      summary: `${overdue.length} acima de ${VISIT_LIMIT} min · maior tempo ${Math.max(...overdue.map(a => visitMinutes(a) ?? 0))} min · conferir duração`,
      tone: roomSector(room.map.name) === 'procedure' || overdue.every(a => procedureVisit(a.tipo)) ? 'warning' : 'danger', appointmentIds: overdue.map(a => a.id),
    });
  }
  if (unmapped.length) alerts.push({
    id: 'sem-sala', zones: [], title: 'Atendimento sem sala identificada',
    summary: `${unmapped.length} em andamento · confira o vínculo da sala`, tone: 'warning', appointmentIds: unmapped.map(a => a.id),
  });
  const waitingTriage = receptionQueue.filter(({ minutes }) => (minutes ?? 0) > WAIT_LIMIT);
  if (waitingTriage.length) alerts.push({
    id: 'espera-triagem', zones: ['recepcao', 'aguardando-triagem'], title: 'Espera pela triagem',
    summary: `${waitingTriage.length} acima de ${WAIT_LIMIT} min · maior espera ${waitingTriage[0].minutes} min`,
    tone: 'warning', appointmentIds: waitingTriage.map(({ a }) => a.id),
  });
  const waitingConsultation = readyQueue.filter(({ minutes }) => (minutes ?? 0) > WAIT_LIMIT);
  const specialties = new Map<string, typeof waitingConsultation>();
  for (const entry of waitingConsultation) {
    const name = staff.get(entry.a.profissional_id)?.profissao?.trim() || '';
    const label = cockpitLabel(name);
    const group = specialties.get(label) ?? [];
    group.push(entry);
    specialties.set(label, group);
  }
  for (const [specialty, entries] of specialties) {
    const linkedRoomIds = new Set(entries.map(({ a }) => a.sala_id));
    const matchingRooms = roomViews.filter(room => room.map.overdue > 0 && linkedRoomIds.has(room.map.id));
    const name = staff.get(entries[0].a.profissional_id)?.profissao?.trim();
    alerts.push({
      id: `espera-consulta:${specialty}`, zones: ['recepcao', 'aguardando-consulta', ...matchingRooms.map(room => room.map.id)],
      title: name ? `Espera · ${name}` : 'Espera pela consulta',
      summary: `${entries.length} acima de ${WAIT_LIMIT} min · maior espera ${entries[0].minutes} min desde a chegada`,
      tone: 'warning', appointmentIds: entries.map(({ a }) => a.id),
    });
  }
  const procedureOverdue = procedureActive.filter(a => !roomById.has(a.sala_id) && (visitMinutes(a) ?? 0) > VISIT_LIMIT);
  if (procedureOverdue.length) alerts.unshift({
    id: 'procedimentos-demora', zones: ['procedimentos'], title: 'Procedimentos prolongados',
    summary: `${procedureOverdue.length} acima de ${VISIT_LIMIT} min · maior tempo ${Math.max(...procedureOverdue.map(a => visitMinutes(a) ?? 0))} min`,
    tone: 'warning', appointmentIds: procedureOverdue.map(a => a.id),
  });
  alerts.sort((a, b) => Number(b.tone === 'danger') - Number(a.tone === 'danger'));
  const alertZones = new Map<string, CockpitAlert['tone']>();
  for (const alert of alerts) {
    for (const id of alert.zones) {
      if (alertZones.get(id) !== 'danger') alertZones.set(id, alert.tone);
    }
  }
  const activeAlertKeys = JSON.stringify(alerts.map(alert => alert.id));
  useEffect(() => {
    const active = new Set(JSON.parse(activeAlertKeys) as string[]);
    setAcknowledged(previous => {
      const next = new Set([...previous].filter(id => active.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [activeAlertKeys]);

  let detail: { title: string; body: ReactNode } | undefined;
  if (zone && !theater) {
    const room = roomViews.find(r => r.map.id === zone);
    const triageDetail = () => {
      const completedTriage = [...recordByAppointment.values()].filter(record =>
        record.confirmado_em && Number.isFinite(Date.parse(record.confirmado_em)) && cockpitDay(Date.parse(record.confirmado_em)) === day
      ).sort((a, b) => Date.parse(b.confirmado_em!) - Date.parse(a.confirmado_em!));
      const describeTriage = (a: Item, entry: typeof triage[number] | undefined) => {
        const risk = asRisk(entry?.classificacao_risco);
        const technician = staff.get(entry?.tecnico_id || '')?.nome;
        return asRecord(a, [entry?.confirmado_em ? clock(entry.confirmado_em) : '',
          risk ? 'Prioridade ' + risk : 'Risco ainda não informado', technician].filter(Boolean).join(' · '), risk);
      };
      return <>
        <p>Resumo da triagem da unidade em {dateLabel(day)}. O registro de triagem não identifica a sala física; a sala da consulta não determina onde a triagem ocorreu.</p>
        <span className="planta-badge">{classifying.length ? classifying.length + ' em classificação' : 'Sem classificação em curso'}</span>
        <RecordList empty="Sem classificação em andamento." records={classifying.map(a => describeTriage(a, recordByAppointment.get(a.id)))} />
        <h3>Triagens concluídas hoje · {completedTriage.length}</h3>
        <RecordList empty="Nenhuma triagem confirmada registrada nesta unidade hoje." records={completedTriage.map(entry =>
          describeTriage(itemById.get(entry.agendamento_id)!, entry))} />
      </>;
    };
    if (zone === 'indicador:presentes') {
      const stageLabels: Record<Item['stage'], string> = {
        outside: 'Fora do fluxo', done: 'Concluído', reception: 'Aguardando triagem',
        triage: 'Em classificação', ready: 'Apto para consulta', calling: 'Chamado',
        consultation: 'Em atendimento', otherCare: 'Aguardando equipe',
      };
      detail = { title: 'Pacientes na unidade', body: <>
        <span className="planta-badge">{inside} pacientes distintos</span>
        <p>São {active.length} registros ativos da agenda do dia nesta unidade. Um paciente pode possuir mais de um atendimento; o indicador conta pessoas distintas pelo vínculo cadastrado, quando disponível.</p>
        <RecordList empty="Nenhum paciente no fluxo ativo." records={active.map(a => asRecord(a, [
          classifyingIds.has(a.id) ? 'Em classificação' : stageLabels[a.stage],
          a.profissional_nome, roomById.get(a.sala_id)?.nome,
        ].filter(Boolean).join(' · ')))} />
      </> };
    } else if (zone === 'indicador:espera') {
      detail = { title: 'Espera média desde a chegada', body: <>
        <span className="planta-badge">{average === null ? 'Média indisponível' : average + ' min de média'}</span>
        <dl className="planta-indicator-summary">
          <div><dt>Aguardando</dt><dd>{waiting.length}</dd></div>
          <div><dt>Com horário válido</dt><dd>{waits.length}</dd></div>
          <div><dt>Sem horário válido</dt><dd>{waiting.length - waits.length}</dd></div>
          <div><dt>Maior espera</dt><dd>{longest === null ? '—' : longest + ' min'}</dd></div>
        </dl>
        <p>A média usa apenas horários válidos de chegada dos atendimentos aguardando triagem ou consulta. Não é uma previsão nem o tempo desde a classificação.</p>
        <RecordList empty="Nenhum atendimento aguardando." records={waitingSorted.map(({a, minutes}) =>
          asRecord(a, [minutes === null ? 'Chegada sem horário válido' : minutes + ' min desde a chegada',
            a.stage === 'ready' ? 'Apto para consulta' : 'Aguardando triagem'].join(' · '), waitingTone(minutes)))} />
      </> };
    } else if (zone === 'indicador:salas') {
      detail = { title: 'Salas em atendimento', body: <>
        <span className="planta-badge">{occupied}/{rooms.length} salas em atendimento</span>
        <p>A ocupação considera os atendimentos em andamento vinculados a salas ativas desta unidade. Sem atendimento não significa disponibilidade de agenda ou de profissionais.</p>
        {unmapped.length > 0 && <button type="button" className="planta-action" onClick={() => setZone('sem-sala')}>{unmapped.length} em atendimento sem sala · conferir</button>}
        <div className="planta-indicator-rooms">{roomViews.map(({map, visits}) =>
          <button key={map.id} type="button" className="planta-indicator-room" onClick={() => setZone(map.id)}>
            <span><strong>{map.name}</strong><small>{roomStatuses[map.state]}{visits.length > 0 ? ' · ' + visits.length + ' em atendimento' : ''}</small></span>
            <ChevronRight size={16} aria-hidden="true"/>
          </button>)}</div>
        {!rooms.length && <p>Nenhuma sala ativa cadastrada.</p>}
      </> };
    } else if (zone === 'indicador:concluidos') {
      const completedSorted = [...done].sort((a, b) =>
        (Number.isFinite(Date.parse(b.concluido_em || '')) ? Date.parse(b.concluido_em!) : -Infinity) -
        (Number.isFinite(Date.parse(a.concluido_em || '')) ? Date.parse(a.concluido_em!) : -Infinity));
      detail = { title: 'Concluídos hoje', body: <>
        <span className="planta-badge">{done.length} atendimentos concluídos</span>
        <p>Registros concluídos da agenda de {dateLabel(day)} nesta unidade. O horário só é exibido quando registrado e pertencente ao dia operacional.</p>
        <RecordList empty="Nenhum atendimento concluído na agenda do dia." records={completedSorted.map(a => {
          const time = Date.parse(a.concluido_em || '');
          const completion = Number.isFinite(time) && cockpitDay(time) === day ? clock(a.concluido_em) : 'Conclusão sem horário registrado hoje';
          return asRecord(a, [completion, a.profissional_nome, roomById.get(a.sala_id)?.nome].filter(Boolean).join(' · '));
        })} />
      </> };
    } else if (zone.startsWith('alerta:')) {
      const alert = alerts.find(item => `alerta:${item.id}` === zone);
      const related = alert?.appointmentIds.map(id => itemById.get(id)).filter((item): item is Item => !!item) ?? [];
      const roomLinks = alert?.zones.flatMap(id => roomViews.filter(item => item.map.id === id)) ?? [];
      const stageLink = stages.find(stage => alert?.zones.includes(stage.id));
      detail = { title: alert?.title ?? 'Alerta resolvido', body: <>
        {alert && <p>{alert.summary}</p>}
        {stageLink && <button type="button" className="planta-action" onClick={() => setZone(stageLink.id)}>
          Abrir {stageLink.label.toLowerCase()}
        </button>}
        {roomLinks.map(item => <button type="button" key={item.map.id} className="planta-action"
          onClick={() => setZone(item.map.id)}>Abrir {item.map.name}</button>)}
        <RecordList empty="A condição deste alerta deixou de ocorrer na leitura atual." records={related.map(a => {
          const minutes = a.stage === 'consultation' ? visitMinutes(a) : elapsedMinutes(a.arrival, now);
          return asRecord(a, [minutes === null ? '' : `${minutes} min ${a.stage === 'consultation' ? 'em atendimento' : 'de espera'}`,
            a.profissional_nome].filter(Boolean).join(' · ') || 'Horário não disponível', alert?.tone);
        })} />
      </> };
    } else if (zone === 'triagem' || (room && roomSector(room.map.name) === 'triage')) {
      detail = { title: room?.map.name || 'Triagem', body: triageDetail() };
    } else if (room) {
      detail = { title: room.map.name, body: <>
        <span className="planta-badge" data-state={room.map.state}>{roomStatuses[room.map.state]}</span>
        <p>{room.map.specialty || 'Especialidade não informada'}{room.clinician && ' · ' + room.clinician}</p>
        {!room.visits.length && room.team.length > 0 && <p>Equipe cadastrada · {room.team.map(f => f.nome).join(', ')}</p>}
        {room.map.state === 'calling' && <p>Paciente chamado · <strong>{room.calling}</strong></p>}
        {room.linkedWaits.length > 0 && <>
          <h3>Espera vinculada à sala · {room.linkedWaits.length}</h3>
          <p>Pacientes com vínculo registrado nesta sala e mais de {WAIT_LIMIT} min desde a chegada. A fila da especialidade sem vínculo não é atribuída a este ambiente.</p>
          <RecordList empty="" records={[...room.linkedWaits].sort((a, b) => (elapsedMinutes(b.arrival, now) ?? -1) - (elapsedMinutes(a.arrival, now) ?? -1)).map(a =>
            asRecord(a, `${elapsedMinutes(a.arrival, now)} min desde a chegada`, 'warning'))} />
        </>}
        {!!room.visits.length && <RecordList empty="" records={room.visits.map(a => {
          const min = room.elapsed(a);
          return asRecord(a, (min === null ? 'Início sem horário registrado' : min + ' min em atendimento') +
            (procedureIds.has(a.id) ? ' · Sessão exibida em Procedimentos' : ''));
        })} />}
        <h3>Histórico de hoje · {room.history.length}</h3>
        <RecordList empty="Nenhum atendimento concluído registrado nesta sala hoje." records={room.history.map(a =>
          asRecord(a, clock(a.concluido_em) + ' · ' + (a.profissional_nome || 'Profissional não informado')))} />
      </> };
    } else if (zone === 'recepcao') {
      detail = { title: 'Recepção e sala de espera', body: <>
        <span className="planta-badge">{waiting.length} aguardando</span>
        <p>O tempo de espera aparece quando o horário de chegada está disponível.</p>
        <RecordList empty="Ninguém aguardando na recepção." records={waitingSorted.map(({ a, minutes }) =>
          asRecord(a, minutes === null ? 'Chegada sem horário disponível' : minutes + ' min de espera', waitingTone(minutes)))} />
      </> };
    } else if (zone === 'aguardando-triagem' || zone === 'aguardando-consulta') {
      const beforeTriage = zone === 'aguardando-triagem';
      const queue = beforeTriage ? receptionQueue : readyQueue;
      detail = { title: beforeTriage ? 'Aguardando triagem' : 'Aptos para consulta', body: <RecordList
        empty="Nenhum atendimento aguardando nesta etapa." records={queue.map(({ a, minutes }) => {
          const wait = beforeTriage ? minutes : clearedWait(a);
          const origin = beforeTriage ? 'desde a chegada' : 'desde a classificação';
          return asRecord(a, wait === null ? 'Horário da etapa não registrado' : `${wait} min ${origin}`, waitingTone(wait));
        })} /> };
    } else if (zone === 'procedimentos') {
      detail = { title: 'Medicação e sessões', body: <>
        <span className="planta-badge">{procedureActive.length} em andamento</span>
        <RecordList empty="Sem procedimentos ou sessões em andamento registrados." records={[...procedureActive, ...waitingCare].map(a =>
          asRecord(a, a.stage === 'otherCare' ? 'Aguardando equipe' :
            (a.nome_procedimento || a.tipo || 'Atendimento registrado') + (roomById.get(a.sala_id) ? ' · ' + roomById.get(a.sala_id)?.nome : '')))} />
      </> };
    } else if (zone === 'sem-sala') {
      detail = { title: 'Em atendimento sem sala identificada', body: <RecordList empty="Nenhum atendimento sem sala identificada."
        records={unmapped.map(a => asRecord(a, (a.profissional_nome || 'Profissional não informado') +
          (a.sala_id ? ' · Sala vinculada indisponível no cadastro ativo desta unidade' : ' · Sem sala vinculada na Agenda')))} /> };
    }
  }

  const stale = !online || !callsOnline || error;
  const lastReading = lastSyncedAt ? ` · Última leitura ${hourFormat.format(lastSyncedAt)}` : '';
  const missingSources = [!callsOnline ? 'Chamadas' : '', ...(connections ? Object.entries(connections).filter(([, connected]) => !connected).map(([source]) => ({ agenda: 'Agenda', fila: 'Fila', atendimentos: 'Atendimentos', triagem: 'Triagem' })[source]) : [])].filter(Boolean);
  const syncLabel = error ? 'Dados desatualizados · falha de atualização' : !rows ? 'Carregando a unidade…'
    : online && callsOnline ? 'Ao vivo · Fluxo da unidade' : 'Sincronização parcial · reconectando' + (missingSources.length ? ' · ' + missingSources.join(', ') : '');
  return <div className="planta-page">
    {rows && <section className="planta-metrics" aria-label="Indicadores da unidade">
      {metrics.map(({ id, icon: Icon, label, value, hint }) => {
        const content = <><span className="planta-metric-label">{label}</span><span className="planta-metric-icon" aria-hidden="true"><Icon size={19} /></span>
          <span className="planta-metric-value"><span>{value}</span><small>{hint}</small></span>{!theater && <ChevronRight className="planta-metric-chevron" size={15} aria-hidden="true"/>}</>;
        return theater ? <div key={id} className="planta-metric">{content}</div> :
          <button key={id} type="button" className="planta-metric" aria-haspopup="dialog" onClick={event => openZone(id, event.currentTarget)}>{content}</button>;
      })}
    </section>}
    {rows && <CockpitAlerts alerts={alerts} acknowledged={acknowledged} theater={theater} stale={stale}
      onOpen={(alert, button) => openZone(`alerta:${alert.id}`, button)}
      onAcknowledge={id => setAcknowledged(previous => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      })} />}
    {rows && <section className="cockpit-stages" aria-label="Etapas do atendimento">
      {stages.map(({ id, label, count, hint }) => {
        const content = <><strong>{count}</strong><span>{label}<small>{hint}</small></span>
          {!theater && <ChevronRight size={15} aria-hidden="true" />}</>;
        const tone = alertZones.get(id);
        return theater ? <div className="cockpit-stage" key={id} data-tone={tone}>{content}</div> :
          <button className="cockpit-stage" key={id} data-tone={tone} type="button" aria-haspopup="dialog"
            onClick={event => openZone(id, event.currentTarget)}>{content}</button>;
      })}
    </section>}
    <section className="planta-board" aria-label="Planta operacional">
      <header className="planta-board-head">
        <div className="planta-location"><Building2 size={20} aria-hidden="true" />
          <div><h2>{unitName}</h2><p>{rows ? `${rooms.length} salas ativas cadastradas · ` : ''}{dateLabel(day)}</p></div>
        </div>
        {rows && <div className="planta-legend" aria-label="Legenda das salas">
          {(Object.entries(roomStatuses) as [RoomState, string][]).map(([state, text]) =>
            <span key={state}><i data-state={state} aria-hidden="true" />{text}</span>)}
        </div>}
      </header>
      {error && <p className="planta-error" role="alert">O painel não conseguiu atualizar todos os dados. Tente atualizar.</p>}
      {rows && <>
        {!theater && <nav className="planta-mobile-zones" aria-label="Atalhos da planta">
          <button type="button" className="planta-action" onClick={() => scrollToZone('recepcao')}>Recepção</button>
          {!!currentRooms.length && <button type="button" className="planta-action" onClick={() => scrollToZone()}>Salas cadastradas</button>}
          <button type="button" className="planta-action" onClick={() => scrollToZone('procedimentos')}>Procedimentos</button>
        </nav>}
        <PlantaUnidade rooms={currentRooms} waiting={mapWaiting} longest={longest}
          procedures={mapProcedures} waitingCare={waitingCare.length} viewport={viewport} alerts={alertZones} onOpen={theater ? undefined : openZone} />
      </>}
      <footer className="planta-footer">
        <div className="planta-statuses"><span className="planta-sync" role="status" data-online={!!rows && !stale}><i aria-hidden="true" />{syncLabel}{lastReading}</span>
          {!theater && unmapped.length > 0 && <button type="button" className="planta-action" onClick={e => openZone('sem-sala', e.currentTarget)}>{unmapped.length} em atendimento sem sala</button>}
          {theater && unmapped.length > 0 && <span>{unmapped.length} em atendimento sem sala</span>}
        </div>
        <div className="planta-footer-tools">
          {(!theater || error) && <button type="button" className="planta-action" onClick={reload}><RefreshCw size={14} aria-hidden="true" /> Atualizar</button>}
        </div>
      </footer>
    </section>
    {rows && !theater && <ShiftSummary completed={done} day={day}
      delayed={active.filter(item => item.stage === 'consultation' && (visitMinutes(item) ?? 0) > VISIT_LIMIT).length} />}
    {rows && <div className="planta-caption">
      <span>{theater ? 'Modo telão · Sem nomes de pacientes' : 'Selecione um setor para abrir os detalhes.'}</span>
      <span>Salas do cadastro e ocupação pela Agenda · Disposição e mobiliário ilustrativos.</span>
    </div>}
    {detail && <Details key={zone} title={detail.title} onClose={closeZone} indicator={zone?.startsWith('indicador:')}>
      {zone?.startsWith('indicador:') && stale && <p className="planta-indicator-stale">Dados da última leitura · atualização parcial ou indisponível.</p>}{detail.body}
    </Details>}
  </div>;
}
