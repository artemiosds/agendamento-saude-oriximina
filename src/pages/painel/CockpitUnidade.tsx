import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Activity, Building2, CircleCheck, Clock3, DoorOpen, Hospital, Maximize, Minimize, RefreshCw, UsersRound, X } from 'lucide-react';
import { CockpitAlerts, type CockpitAlert } from './CockpitAlerts';
import { PlantaUnidade, roomStatuses } from './PlantaUnidade';
import type { MapRoom, Risk, RoomState } from './PlantaUnidade';
import { useUnidadeFilter } from '@/hooks/useUnidadeFilter';
import { useOperacional } from '@/contexts/OperacionalContext';
import { careStage, cockpitDay, cockpitLabel, elapsedMinutes, freshCockpitCall, infusionVisit, isBottleneck, procedureVisit, roomSector, waitingTone } from '@/lib/unitCockpit';
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

function Details({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
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
    <header><small>Detalhe do setor</small><h2 id="planta-detail-title">{title}</h2>
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
          <select value={unit?.id || ''} disabled={!units.length} onChange={e => select(e.target.value)}>
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
  const { rows, triage, arrivals, starts = {}, calledAt = {}, lastSyncedAt, online, error, reload } = useCockpitFeed(unit, day);
  const [calls, setCalls] = useState<Record<string, ChamadaPaciente>>({});
  useEffect(() => observarChamadas(unit, call => setCalls(previous => {
    const timestamp = Date.parse(call.criadoEm);
    if ((call.unidadeId && call.unidadeId !== unit) || !Number.isFinite(timestamp) || cockpitDay(timestamp) !== day) return previous;
    const key = cockpitLabel(call.local);
    if (previous[key] && Date.parse(previous[key].criadoEm) > Date.parse(call.criadoEm)) return previous;
    const recent = Object.fromEntries(Object.entries(previous).filter(([, a]) => freshCockpitCall(a.criadoEm, Date.now())));
    return { ...recent, [key]: call };
  })), [unit, day]);

  const rooms = salas.filter(s => s.unidadeId === unit && s.ativo);
  const consulting = rooms.filter(r => roomSector(r.nome) === 'consultation');
  const consultationIds = new Set(consulting.map(r => r.id));
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
  const occupied = consulting.filter(r => visitsByRoom.has(r.id)).length;
  const procedureActive = active.filter(a => a.stage === 'consultation' && (roomSector(roomById.get(a.sala_id)?.nome || '') === 'procedure' || procedureVisit(a.tipo)));
  const procedureIds = new Set(procedureActive.map(a => a.id));
  const waitingCare = active.filter(a => a.stage === 'otherCare');
  const unmapped = active.filter(a => a.stage === 'consultation' && !roomById.has(a.sala_id));
  const waitBySpecialty = new Map<string, Set<string>>();
  for (const a of waiting) {
    const specialty = cockpitLabel(staff.get(a.profissional_id)?.profissao);
    if (!specialty || a.stage !== 'ready' || (elapsedMinutes(a.arrival, now) ?? 0) <= 20) continue;
    const ids = waitBySpecialty.get(specialty) ?? new Set<string>();
    ids.add(a.paciente_id || a.id);
    waitBySpecialty.set(specialty, ids);
  }

  const roomViews = [...rooms].sort((a, b) => orderNames.compare(a.nome, b.nome)).map(room => {
    const visits = visitsByRoom.get(room.id) ?? [];
    const history = historyByRoom.get(room.id) ?? [];
    const team = (teamByRoom.get(room.id) ?? []).filter(f => f.role === 'profissional');
    const specialties = new Set(team.map(f => cockpitLabel(f.profissao)).filter(Boolean));
    const overdue = new Set([...specialties].flatMap(s => [...(waitBySpecialty.get(s) ?? [])])).size;
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
      patients: visits.map(a => ({ id: a.id })),
    };
    return { map, clinician, calling, visits, history, team, elapsed };
  });
  const currentRooms = roomViews.map(room => room.map);
  const triageQueue = classifying.map(a => ({ id: a.id, risk: asRisk(recordByAppointment.get(a.id)?.classificacao_risco) }));
  const riskRank = (risk?: Risk) => risk ? riskOrder.indexOf(risk) : riskOrder.length;
  triageQueue.sort((a, b) => riskRank(a.risk) - riskRank(b.risk));
  const waitingSorted = waiting.map(a => ({ a, minutes: elapsedMinutes(a.arrival, now) }))
    .sort((a, b) => (b.minutes ?? -1) - (a.minutes ?? -1));
  const longest = waitingSorted[0]?.minutes ?? null;
  const mapWaiting = waitingSorted.map(({ a, minutes }) => ({ id: a.id, tone: waitingTone(minutes) }));
  const mapProcedures = procedureActive.map(a => ({
    id: a.id, infusion: infusionVisit(a.tipo) || infusionVisit(roomById.get(a.sala_id)?.nome || ''),
  }));
  const metrics = [
    { icon: UsersRound, label: 'Pacientes na unidade', value: String(inside), hint: 'presentes' },
    { icon: Clock3, label: 'Espera média', value: average === null ? '—' : average + ' min', hint: waits.length + ' com horário' },
    { icon: DoorOpen, label: 'Consultórios ocupados', value: occupied + '/' + consulting.length, hint: 'salas' },
    { icon: CircleCheck, label: 'Concluídos hoje', value: String(done.length), hint: 'atendimentos' },
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
      summary: `${overdue.length} acima de ${VISIT_LIMIT} min · maior tempo ${Math.max(...overdue.map(a => visitMinutes(a) ?? 0))} min`,
      tone: 'danger', appointmentIds: overdue.map(a => a.id),
    });
  }
  if (unmapped.length) alerts.push({
    id: 'sem-sala', zones: [], title: 'Atendimento sem sala identificada',
    summary: `${unmapped.length} em andamento · confira o vínculo da sala`, tone: 'warning', appointmentIds: unmapped.map(a => a.id),
  });
  const waitingTriage = waitingSorted.filter(({ a, minutes }) => a.stage === 'reception' && (minutes ?? 0) > WAIT_LIMIT);
  if (waitingTriage.length) alerts.push({
    id: 'espera-triagem', zones: ['recepcao', 'triagem'], title: 'Espera pela triagem',
    summary: `${waitingTriage.length} acima de ${WAIT_LIMIT} min · maior espera ${waitingTriage[0].minutes} min`,
    tone: 'warning', appointmentIds: waitingTriage.map(({ a }) => a.id),
  });
  const waitingConsultation = waitingSorted.filter(({ a, minutes }) => a.stage === 'ready' && (minutes ?? 0) > WAIT_LIMIT);
  const specialties = new Map<string, typeof waitingConsultation>();
  for (const entry of waitingConsultation) {
    const name = staff.get(entry.a.profissional_id)?.profissao?.trim() || '';
    const label = cockpitLabel(name);
    const group = specialties.get(label) ?? [];
    group.push(entry);
    specialties.set(label, group);
  }
  for (const [specialty, entries] of specialties) {
    const matchingRooms = specialty ? roomViews.filter(room => room.map.state === 'bottleneck' &&
      room.team.some(person => cockpitLabel(person.profissao) === specialty)) : [];
    const name = staff.get(entries[0].a.profissional_id)?.profissao?.trim();
    alerts.push({
      id: `espera-consulta:${specialty}`, zones: ['recepcao', ...matchingRooms.map(room => room.map.id)],
      title: name ? `Espera · ${name}` : 'Espera pela consulta',
      summary: `${entries.length} acima de ${WAIT_LIMIT} min · maior espera ${entries[0].minutes} min`,
      tone: 'warning', appointmentIds: entries.map(({ a }) => a.id),
    });
  }
  const procedureOverdue = procedureActive.filter(a => !roomById.has(a.sala_id) && (visitMinutes(a) ?? 0) > VISIT_LIMIT);
  if (procedureOverdue.length) alerts.unshift({
    id: 'procedimentos-demora', zones: ['procedimentos'], title: 'Procedimentos prolongados',
    summary: `${procedureOverdue.length} acima de ${VISIT_LIMIT} min · maior tempo ${Math.max(...procedureOverdue.map(a => visitMinutes(a) ?? 0))} min`,
    tone: 'danger', appointmentIds: procedureOverdue.map(a => a.id),
  });
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
    if (zone.startsWith('alerta:')) {
      const alert = alerts.find(item => `alerta:${item.id}` === zone);
      const related = alert?.appointmentIds.map(id => itemById.get(id)).filter((item): item is Item => !!item) ?? [];
      const roomLinks = alert?.zones.flatMap(id => roomViews.filter(item => item.map.id === id)) ?? [];
      detail = { title: alert?.title ?? 'Alerta resolvido', body: <>
        {alert && <p>{alert.summary}</p>}
        {roomLinks.map(item => <button type="button" key={item.map.id} className="planta-action"
          onClick={() => setZone(item.map.id)}>Abrir {item.map.name}</button>)}
        <RecordList empty="A condição deste alerta deixou de ocorrer na leitura atual." records={related.map(a => {
          const minutes = a.stage === 'consultation' ? visitMinutes(a) : elapsedMinutes(a.arrival, now);
          return asRecord(a, [minutes === null ? '' : `${minutes} min ${a.stage === 'consultation' ? 'em atendimento' : 'de espera'}`,
            a.profissional_nome].filter(Boolean).join(' · ') || 'Horário não disponível', alert?.tone);
        })} />
      </> };
    } else if (room) {
      detail = { title: room.map.name, body: <>
        <span className="planta-badge" data-state={room.map.state}>{roomStatuses[room.map.state]}</span>
        <p>{room.map.specialty || 'Especialidade não informada'}{room.clinician && ' · ' + room.clinician}</p>
        {!room.visits.length && room.team.length > 0 && <p>Equipe cadastrada · {room.team.map(f => f.nome).join(', ')}</p>}
        {room.map.state === 'calling' && <p>Paciente chamado · <strong>{room.calling}</strong></p>}
        {room.map.state === 'bottleneck' && <p>{room.map.overdue} pacientes da especialidade aguardam há mais de 20 min.</p>}
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
    } else if (zone === 'triagem') {
      detail = { title: 'Triagem', body: <>
        <span className="planta-badge">{classifying.length ? classifying.length + ' em classificação' : 'Livre'}</span>
        <RecordList empty="Sem classificação em andamento." records={classifying.map(a => {
          const entry = recordByAppointment.get(a.id), risk = asRisk(entry?.classificacao_risco);
          const technician = staff.get(entry?.tecnico_id || '')?.nome;
          return asRecord(a, (risk ? 'Prioridade ' + risk : 'Risco ainda não informado') + (technician ? ' · ' + technician : ''), risk);
        })} />
      </> };
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

  const stale = !online || error;
  const lastReading = lastSyncedAt ? ` · Última leitura ${hourFormat.format(lastSyncedAt)}` : '';
  const syncLabel = error ? 'Dados desatualizados · falha de atualização' : !rows ? 'Carregando a unidade…'
    : online ? 'Ao vivo · Agenda' : 'Dados desatualizados · reconectando';
  return <div className="planta-page">
    {rows && <dl className="planta-metrics" aria-label="Indicadores da unidade">
      {metrics.map(({ icon: Icon, label, value, hint }) => <div key={label} className="planta-metric">
        <dt>{label}</dt><span className="planta-metric-icon" aria-hidden="true"><Icon size={19} /></span>
        <dd>{value}<small>{hint}</small></dd>
      </div>)}
    </dl>}
    {rows && <CockpitAlerts alerts={alerts} acknowledged={acknowledged} theater={theater} stale={stale}
      onOpen={(alert, button) => openZone(`alerta:${alert.id}`, button)}
      onAcknowledge={id => setAcknowledged(previous => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      })} />}
    <section className="planta-board" aria-label="Planta operacional">
      <header className="planta-board-head">
        <div className="planta-location"><Building2 size={20} aria-hidden="true" />
          <div><h2>{unitName}</h2><p>{rows ? `${rooms.length} salas ativas cadastradas · ` : ''}{dateLabel(day)}</p></div>
        </div>
        {rows && <div className="planta-legend" aria-label="Legenda dos consultórios">
          {(Object.entries(roomStatuses) as [RoomState, string][]).map(([state, text]) =>
            <span key={state}><i data-state={state} aria-hidden="true" />{text}</span>)}
        </div>}
      </header>
      {error && <p className="planta-error" role="alert">O painel não conseguiu atualizar todos os dados. Tente atualizar.</p>}
      {rows && <>
        {!theater && <nav className="planta-mobile-zones" aria-label="Atalhos da planta">
          <button type="button" className="planta-action" onClick={() => scrollToZone('recepcao')}>Recepção</button>
          <button type="button" className="planta-action" onClick={() => scrollToZone('triagem')}>Triagem</button>
          {!!currentRooms.length && <button type="button" className="planta-action" onClick={() => scrollToZone()}>Salas cadastradas</button>}
          <button type="button" className="planta-action" onClick={() => scrollToZone('procedimentos')}>Procedimentos</button>
        </nav>}
        <PlantaUnidade rooms={currentRooms} waiting={mapWaiting} longest={longest} triage={triageQueue}
          risk={triageQueue[0]?.risk} procedures={mapProcedures} waitingCare={waitingCare.length} viewport={viewport} alerts={alertZones} onOpen={theater ? undefined : openZone} />
      </>}
      <footer className="planta-footer">
        <div className="planta-statuses"><span className="planta-sync" role="status" data-online={!!rows && online && !error}><i aria-hidden="true" />{syncLabel}{lastReading}</span>
          {!theater && unmapped.length > 0 && <button type="button" className="planta-action" onClick={e => openZone('sem-sala', e.currentTarget)}>{unmapped.length} em atendimento sem sala</button>}
          {theater && unmapped.length > 0 && <span>{unmapped.length} em atendimento sem sala</span>}
        </div>
        <div className="planta-footer-tools">
          {(!theater || error) && <button type="button" className="planta-action" onClick={reload}><RefreshCw size={14} aria-hidden="true" /> Atualizar</button>}
        </div>
      </footer>
    </section>
    {rows && <div className="planta-caption">
      <span>{theater ? 'Modo telão · Sem nomes de pacientes' : 'Selecione um setor para abrir os detalhes.'}</span>
      <span>Salas do cadastro e ocupação pela Agenda · Disposição ilustrativa.</span>
    </div>}
    {detail && <Details key={zone} title={detail.title} onClose={closeZone}>{detail.body}</Details>}
  </div>;
}
