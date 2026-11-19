import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Activity, Armchair, Building2, CircleCheck, Clock3, DoorOpen, Maximize, Minimize, RefreshCw, Stethoscope, UsersRound } from 'lucide-react';
import { Ocupante, SalaIlustrada } from './PlantaUnidade';
import { Button } from '@/components/ui/button';
import { useUnidadeFilter } from '@/hooks/useUnidadeFilter';
import { useOperacional } from '@/contexts/OperacionalContext';
import { careStage, cockpitDay, cockpitLabel, elapsedMinutes, freshCockpitCall, infusionVisit, isBottleneck, procedureVisit, roomSector, waitingTone } from '@/lib/unitCockpit';
import { useCockpitFeed } from './useCockpitFeed';
import type { CockpitAppointment } from './useCockpitFeed';
import { observarChamadas, type ChamadaPaciente } from '@/lib/painelChamadas';

const hourFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const clock = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? hourFormat.format(Date.parse(value)) : '—';
const riskTones = new Set(['vermelho', 'laranja', 'amarelo', 'verde', 'azul']);
const dateLabel = (day: string) => day.split('-').reverse().join('/');
type Item = CockpitAppointment & { stage: ReturnType<typeof careStage>; arrival: string | null };
type RoomState = 'free' | 'calling' | 'occupied' | 'bottleneck';
const roomStatuses: Record<RoomState, string> = { free: 'Livre', calling: 'Chamando', occupied: 'Em atendimento', bottleneck: 'Alerta de gargalo' };

function Plate({ state, children }: { state: RoomState; children: ReactNode }) {
  return <span className="hospital-placa" data-state={state}>{children}</span>;
}

function SeatList<T>({ entries, render }: { entries: T[]; render: (value: T) => ReactNode }) {
  const [expand, setExpand] = useState(false);
  const limit = 12;
  return <>{(expand ? entries : entries.slice(0, limit)).map(render)}
    {entries.length > limit && <Button type="button" variant="outline" size="sm" className="hospital-ver-mais"
      aria-expanded={expand} onClick={() => setExpand(!expand)}>{expand ? 'Mostrar menos' : 'Ver mais ' + (entries.length - limit)}</Button>}
  </>;
}

function History({ entries }: { entries: Item[] }) {
  const [open, setOpen] = useState(false);
  return <details className="hospital-history" onToggle={e => setOpen(e.currentTarget.open)}>
    <summary>Histórico de hoje · {entries.length}</summary>
    {open && (entries.length ? entries.map(a => <p key={a.id}>{clock(a.concluido_em)} · {a.paciente_nome} · {a.profissional_nome || 'Profissional não informado'}</p>)
      : <p>Nenhum atendimento concluído registrado nesta sala hoje.</p>)}
  </details>;
}

export default function CockpitUnidade() {
  const { isGlobalAdmin, userUnidadeId, unidadesVisiveis } = useUnidadeFilter();
  const [selected, select] = useState('');
  const [now, setNow] = useState(Date.now);
  const [theater, setTheater] = useState(false);
  const board = useRef<HTMLElement>(null);
  const hadFullscreen = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    const update = () => {
      if (document.fullscreenElement === board.current) hadFullscreen.current = true;
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

  const toggleTheater = () => {
    if (theater) {
      setTheater(false);
      if (document.fullscreenElement === board.current) void document.exitFullscreen?.().catch(() => {});
    } else {
      setTheater(true);
      void board.current?.requestFullscreen?.().catch(() => {});
    }
  };

  const units = unidadesVisiveis.filter(u => u.ativo !== false && (isGlobalAdmin || u.id === userUnidadeId));
  const unit = units.find(u => u.id === selected) || units[0];
  const day = cockpitDay(now);
  return <main ref={board} className="hospital-board" data-telao={theater}>
    <header className="hospital-header">
      <div>
        <span className="hospital-kicker"><Activity size={15} aria-hidden="true" /> MONITOR OPERACIONAL</span>
        <h1>Cockpit da Unidade ao Vivo</h1>
        <p className="hospital-unit"><Building2 size={16} aria-hidden="true" />{unit?.nome || 'Unidade não selecionada'} <span>·</span> {dateLabel(day)}</p>
      </div>
      <div className="hospital-toolbar">
        {isGlobalAdmin && <label className="hospital-unit-picker">Unidade
          <select value={unit?.id || ''} disabled={!units.length} onChange={e => select(e.target.value)}>
            {units.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </label>}
        <Button type="button" size="sm" variant="outline" onClick={toggleTheater} aria-pressed={theater}>
          {theater ? <Minimize size={16} aria-hidden="true" /> : <Maximize size={16} aria-hidden="true" />}
          {theater ? 'Sair do modo telão' : 'Modo telão / Tela cheia'}
        </Button>
      </div>
    </header>
    {unit ? <Monitor key={unit.id + ':' + day} unit={unit.id} day={day} now={now} /> : <p className="hospital-empty">Nenhuma unidade disponível para esta conta.</p>}
  </main>;
}

function Monitor({ unit, day, now }: { unit: string; day: string; now: number }) {
  const { salas, funcionarios } = useOperacional();
  const { rows, triage, arrivals, starts = {}, online, error, reload } = useCockpitFeed(unit, day);
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
  const procedureRooms = new Map(rooms.filter(r => roomSector(r.nome) === 'procedure').map(r => [r.id, r]));
  const roomById = new Map(rooms.map(r => [r.id, r]));
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
  const activeById = new Map(active.map(a => [a.id, a]));
  const recordByAppointment = new Map<string, typeof triage[number]>();
  for (const record of triage) {
    const patient = activeById.get(record.agendamento_id);
    if (!patient || !['reception', 'triage'].includes(patient.stage)) continue;
    const previous = recordByAppointment.get(record.agendamento_id);
    if (!previous || (record.iniciado_em || '') > (previous.iniciado_em || '')) recordByAppointment.set(record.agendamento_id, record);
  }
  const classifying = active.filter(a => {
    const tri = recordByAppointment.get(a.id);
    return a.stage === 'triage' || !!(tri?.iniciado_em && !tri?.confirmado_em);
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
  const procedureActive = active.filter(a => a.stage === 'consultation' && (procedureRooms.has(a.sala_id) || procedureVisit(a.tipo)));
  const procedureIds = new Set(procedureActive.map(a => a.id));
  const waitingCare = active.filter(a => a.stage === 'otherCare');
  const unmapped = active.filter(a => a.stage === 'consultation' && !roomById.has(a.sala_id) && !procedureVisit(a.tipo));
  const waitBySpecialty = new Map<string, Set<string>>();
  for (const a of waiting) {
    const specialty = cockpitLabel(staff.get(a.profissional_id)?.profissao);
    if (!specialty || a.stage !== 'ready' || (elapsedMinutes(a.arrival, now) ?? 0) <= 20) continue;
    const ids = waitBySpecialty.get(specialty) ?? new Set<string>();
    ids.add(a.paciente_id || a.id);
    waitBySpecialty.set(specialty, ids);
  }
  const waitingPatient = (a: Item) => {
    const minutes = elapsedMinutes(a.arrival, now);
    return <Ocupante key={a.id} papel="paciente" variante={a.id} nome={a.paciente_nome}
      detalhe={minutes === null ? 'Chegada sem horário disponível' : minutes + ' min de espera'} tom={waitingTone(minutes)} />;
  };

  const metrics = [
    { icon: UsersRound, label: 'Pacientes na unidade', value: String(inside), hint: 'Com presença registrada' },
    { icon: Clock3, label: 'Espera média agora', value: average === null ? '—' : average + ' min', hint: waits.length + ' de ' + waiting.length + ' com horário conhecido' },
    { icon: DoorOpen, label: 'Consultórios ocupados', value: consulting.length ? Math.round(100 * occupied / consulting.length) + '%' : '—', hint: occupied + ' de ' + consulting.length + ' consultórios' },
    { icon: CircleCheck, label: 'Concluídos hoje', value: String(done.length), hint: 'Atendimentos finalizados' },
  ];

  return <>
    <div className="hospital-sync">
      <span className="hospital-live" role="status" data-online={!!rows && online && !error}>
        {error ? 'Falha de atualização' : !rows ? 'Carregando a unidade…' : online ? 'Ao vivo · Agenda' : 'Reconectando · Última leitura'}
      </span>
      <Button size="sm" variant="ghost" type="button" onClick={reload}><RefreshCw size={15} aria-hidden="true" />Atualizar</Button>
    </div>
    {error && <p className="hospital-error" role="alert">O painel não conseguiu atualizar todos os dados. Tente atualizar.</p>}
    {rows && <>
      <section className="hospital-kpis" aria-label="Indicadores da unidade">
        {metrics.map(({ icon: Icon, label, value, hint }) => <div key={label} className="hospital-kpi">
          <span className="hospital-icon"><Icon size={18} aria-hidden="true" /></span>
          <div><p>{label}</p><strong>{value}</strong><small>{hint}</small></div>
        </div>)}
      </section>
      <div className="hospital-map-title">
        <div><h2>Planta ao vivo</h2><p>Veja a equipe e o fluxo de pacientes por setor.</p></div>
        <nav className="hospital-map-nav" aria-label="Setores da unidade">
          <a href="#cockpit-recepcao">Recepção</a><a href="#cockpit-triagem">Triagem</a>
          <a href="#cockpit-consultorios">Consultórios</a><a href="#cockpit-procedimentos">Procedimentos</a>
        </nav>
      </div>
      <div className="hospital-floor">
        <div className="hospital-front">
          <section id="cockpit-recepcao" className="hospital-zone">
            <div className="hospital-zone-head"><div><span className="hospital-kicker"><Armchair size={15} aria-hidden="true" /> ACOLHIMENTO</span>
              <h2>Recepção · {waiting.length} aguardando</h2></div></div>
            <SalaIlustrada ambiente="recepcao"><SeatList entries={waiting} render={waitingPatient} /></SalaIlustrada>
            {!waiting.length && <p className="hospital-empty">Ninguém aguardando na recepção.</p>}
            {!!waiting.length && <p className="hospital-zone-note"><span className="hospital-wait-key" data-tone="safe">Abaixo de 15 min</span>
              <span className="hospital-wait-key" data-tone="warning">15 a 30 min</span><span className="hospital-wait-key" data-tone="danger">Mais de 30 min</span></p>}
          </section>
          <section id="cockpit-triagem" className="hospital-zone">
            <div className="hospital-zone-head"><div><span className="hospital-kicker"><Activity size={15} aria-hidden="true" /> CLASSIFICAÇÃO DE RISCO</span>
              <h2>Triagem e acolhimento</h2></div><Plate state={classifying.length ? 'occupied' : 'free'}>{classifying.length ? 'Classificando' : 'Livre'}</Plate></div>
            <SalaIlustrada ambiente="triagem">
              {!classifying.length && <Ocupante papel="enfermagem" nome="Posto de triagem" detalhe="Sem classificação em andamento" />}
              <SeatList entries={classifying} render={a => {
                const tri = recordByAppointment.get(a.id);
                const risk = cockpitLabel(tri?.classificacao_risco);
                return <div key={a.id} className="hospital-pair">
                  <Ocupante papel="enfermagem" nome={staff.get(tri?.tecnico_id || '')?.nome || 'Equipe de triagem'} />
                  <Ocupante papel="paciente" variante={a.id} nome={a.paciente_nome}
                    detalhe={riskTones.has(risk) ? 'Prioridade ' + risk : 'Risco ainda não informado'} risk={riskTones.has(risk) ? risk : undefined} facing="left" />
                </div>;
              }} />
            </SalaIlustrada>
          </section>
        </div>

        <section id="cockpit-consultorios" className="hospital-zone">
          <div className="hospital-zone-head"><div><span className="hospital-kicker"><Stethoscope size={15} aria-hidden="true" /> ATENDIMENTO CLÍNICO</span>
            <h2>Consultórios e salas</h2></div><span className="hospital-count">{occupied} em atendimento</span></div>
          <div className="hospital-consultorios">{consulting.map(room => {
            const visits = visitsByRoom.get(room.id) ?? [];
            const history = historyByRoom.get(room.id) ?? [];
            const team = (teamByRoom.get(room.id) ?? []).filter(f => f.role === 'profissional');
            const specialties = new Set(team.map(f => cockpitLabel(f.profissao)).filter(Boolean));
            const overdue = new Set([...specialties].flatMap(s => [...(waitBySpecialty.get(s) ?? [])])).size;
            const call = calls[cockpitLabel(room.nome)];
            const agendaCall = callingByRoom.get(room.id)?.paciente_nome;
            const stillCalling = call && freshCockpitCall(call.criadoEm, now)
              && !history.some(a => cockpitLabel(a.paciente_nome) === cockpitLabel(call.pacienteNome) && Date.parse(a.concluido_em || '') >= Date.parse(call.criadoEm));
            const calling = agendaCall || (stillCalling ? call.pacienteNome : '');
            const state: RoomState = visits.length ? 'occupied' : calling ? 'calling' : isBottleneck(overdue) ? 'bottleneck' : 'free';
            const currentStaff = staff.get(visits[0]?.profissional_id || '');
            const specialty = currentStaff?.profissao || [...new Set(team.map(f => f.profissao).filter(Boolean))].join(' · ');
            const clinician = visits[0]?.profissional_nome || currentStaff?.nome || (team.length === 1 ? team[0].nome : '');
            const regularVisits = visits.filter(a => !procedureIds.has(a.id));
            return <article key={room.id} className="hospital-room" data-state={state}>
              <div className="hospital-room-head"><h3>{room.nome}</h3><Plate state={state}>{roomStatuses[state]}</Plate></div>
              {state === 'calling' && <p className="hospital-calling"><strong>Chamando</strong> {calling}</p>}
              {state === 'bottleneck' && <p className="hospital-bottleneck">{overdue} pacientes da área aguardam há mais de 20 min.</p>}
              <SalaIlustrada ambiente="consulta">
                <Ocupante papel="clinico" nome={clinician || 'Posto de atendimento'} detalhe={specialty || (!clinician ? 'Profissional não identificado' : undefined)} />
                <SeatList entries={regularVisits} render={a => {
                  const minutes = elapsedMinutes(a.iniciado_em || starts[a.id] || null, now);
                  return <Ocupante key={a.id} papel="paciente" variante={a.id} nome={a.paciente_nome} facing="left" timer
                    detalhe={minutes === null ? 'Início sem horário registrado' : minutes + ' min em atendimento'} />;
                }} />
              </SalaIlustrada>
              {regularVisits.length < visits.length && <p className="hospital-zone-note">Sessão ativa exibida em <a href="#cockpit-procedimentos">Procedimentos</a>.</p>}
              <History entries={history} />
            </article>;
          })}</div>
          {!consulting.length && <p className="hospital-empty">Nenhum consultório ativo cadastrado nesta unidade.</p>}
          {!!unmapped.length && <div className="hospital-unmapped"><h3>Em atendimento sem sala identificada</h3>
            {unmapped.map(a => <p key={a.id}>{a.paciente_nome} · {a.profissional_nome || 'Profissional não informado'}</p>)}</div>}
        </section>

        <section id="cockpit-procedimentos" className="hospital-zone">
          <div className="hospital-zone-head"><div><span className="hospital-kicker"><Activity size={15} aria-hidden="true" /> CUIDADO ESPECIALIZADO</span>
            <h2>Procedimentos, medicação e sessões</h2></div><span className="hospital-count">{procedureActive.length} em andamento</span></div>
          <SalaIlustrada ambiente="procedimentos">
            <SeatList entries={[...procedureActive, ...waitingCare]} render={a => {
              const room = roomById.get(a.sala_id);
              const label = a.nome_procedimento || a.tipo || 'Atendimento registrado';
              return <Ocupante key={a.id} variante={a.id} papel={a.stage === 'consultation' && (infusionVisit(a.tipo) || infusionVisit(room?.nome || '')) ? 'medicacao' : 'paciente'}
                nome={a.paciente_nome} detalhe={a.stage === 'otherCare' ? 'Aguardando equipe' : label + (room ? ' · ' + room.nome : '')} />;
            }} />
          </SalaIlustrada>
          {!procedureActive.length && <p className="hospital-empty">Sem procedimentos ou sessões em andamento registrados.</p>}
        </section>
      </div>
      <p className="hospital-caption">Mostra estados registrados, não a presença física da equipe. A espera só é calculada quando a chegada é observada neste painel.</p>
    </>}
  </>;
}
