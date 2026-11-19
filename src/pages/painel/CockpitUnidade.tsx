import { useEffect, useState } from 'react';
import { PlantaUnidade } from './PlantaUnidade';
import { Button } from '@/components/ui/button';
import { useUnidadeFilter } from '@/hooks/useUnidadeFilter';
import { useOperacional } from '@/contexts/OperacionalContext';
import { localDateStr } from '@/lib/utils';
import { careStage, elapsedMinutes } from '@/lib/unitCockpit';
import { useCockpitFeed } from './useCockpitFeed';
import { observarChamadas, type ChamadaPaciente } from '@/lib/painelChamadas';

const card = 'rounded-xl border bg-card p-4 space-y-2';
const heading = 'font-semibold text-lg';
function clock(value: string | null) {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }) : '—';
}

export default function CockpitUnidade() {
  const { isGlobalAdmin, userUnidadeId, unidadesVisiveis } = useUnidadeFilter();
  const [selected, select] = useState('');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const units = unidadesVisiveis.filter(u => isGlobalAdmin || u.id === userUnidadeId);
  const unit = units.find(u => u.id === selected) || units[0];
  const day = localDateStr(new Date(now));
  return <main className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold">Cockpit da Unidade ao Vivo</h1>
      <p className="text-muted-foreground">{unit?.nome} · {day.split('-').reverse().join('/')}</p></div>
      {isGlobalAdmin && <label>Unidade <select className="rounded border bg-background p-2" value={unit?.id || ''} onChange={e => select(e.target.value)}>
        {units.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></label>}</header>
    {unit ? <Monitor key={unit.id + day} unit={unit.id} day={day} now={now}/> : <p>Nenhuma unidade disponível para esta conta.</p>}
  </main>;
}

function Monitor({ unit, day, now }: { unit: string; day: string; now: number }) {
  const { salas, funcionarios } = useOperacional();
  const { rows, triage, arrivals, online, error, reload } = useCockpitFeed(unit, day);
  const [calls, setCalls] = useState<Record<string, ChamadaPaciente>>({});
  useEffect(() => observarChamadas(unit, call => setCalls(previous => ({ ...previous, [call.local]: call }))), [unit]);
  const rooms = salas.filter(s => s.unidadeId === unit && s.ativo);
  const staff = new Map(funcionarios.map(f => [f.id, f]));
  const items = (rows || []).map(a => ({ ...a, stage: careStage(a.status), arrival: arrivals[a.id] || null }));
  type Item = typeof items[number];
  const active = items.filter(a => a.stage !== 'outside' && a.stage !== 'done');
  const inside = new Set(active.map(a => a.paciente_id || a.id)).size;
  const done = items.filter(a => a.stage === 'done');
  const occupied = rooms.filter(s => active.some(a => a.sala_id === s.id && a.stage === 'consultation')).length;
  const waits = items.filter(a => a.stage === 'consultation' || a.stage === 'done')
    .map(a => elapsedMinutes(a.arrival, Date.parse(a.iniciado_em || ''))).filter((v): v is number => v !== null);
  const avg = waits.length ? Math.round(waits.reduce((a,b) => a+b,0)/waits.length) : null;
  const drafts = triage.filter(t => t.iniciado_em && !t.confirmado_em && active.some(a => a.id === t.agendamento_id && a.stage === 'reception'));
  const last = triage.filter(t => t.confirmado_em && t.classificacao_risco).sort((a,b) => (b.confirmado_em || '').localeCompare(a.confirmado_em || ''))[0];
  const waiting = active.filter(a => ['ready','reception'].includes(a.stage) && !drafts.some(t => t.agendamento_id === a.id));
  const procedures = active.filter(a => a.stage === 'otherCare' || (a.stage === 'consultation' && /procedimento|medicação|curativo|inalação|sessão de tratamento/i.test(a.tipo)));
  const patientList = (list: Item[]) => list.length ? <ul className="divide-y">{list.map(a => {
    const minutes = elapsedMinutes(a.arrival, now);
    return <li className="flex flex-wrap justify-between gap-2 py-2" key={a.id}><span>{a.paciente_nome}</span>
      <span className={minutes !== null && minutes > 30 ? 'text-red-700' : minutes !== null && minutes >= 15 ? 'text-amber-700' : 'text-muted-foreground'}>
        {minutes === null ? 'Chegada sem horário registrado' : clock(a.arrival) + ' · ' + minutes + ' min'}</span></li>;
  })}</ul> : <p className="text-sm text-muted-foreground">Nenhum paciente nesta etapa.</p>;
  return <div className="space-y-5">
    <div className="flex items-center gap-3"><span role="status">{error ? 'Falha de atualização' : online && rows ? '● Ao vivo · Agenda' : 'Aguardando sincronização'}</span>
      <Button size="sm" variant="outline" onClick={reload}>Atualizar</Button>
      <Button size="sm" variant="outline" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.().catch(() => {}); }}>Tela cheia</Button></div>
    {error && <p role="alert">Consulta incompleta. Confira a conexão e atualize o painel.</p>}
    {rows && <><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      ['Pacientes com presença registrada', inside], ['Espera média observada até a consulta', avg === null ? 'Sem horários registrados' : avg + ' min'],
      ['Salas em atendimento', occupied + ' de ' + rooms.length + (rooms.length ? ' (' + Math.round(100*occupied/rooms.length) + '%)' : '')],
      ['Atendimentos finalizados hoje', done.length]
    ].map(([label,value]) => <div key={label} className={card}><p className="text-sm">{label}</p><strong className={label === 'Espera média observada até a consulta' && (avg || 0)>30 ? 'text-amber-700' : 'text-xl'}>{value}</strong></div>)}</section>
    <PlantaUnidade contagens={{ recepcao: waiting.length, triagem: drafts.length, consultorios: occupied, procedimentos: procedures.length }} />
    <section id="cockpit-recepcao" className={card}><h2 className={heading}>Recepção · {waiting.length} aguardando</h2>
      <div className="grid gap-4 md:grid-cols-2">{(['reception','ready'] as const).map(stage => <div key={stage}><h3 className="font-medium">{stage === 'ready' ? 'Aguardando consulta' : 'Aguardando triagem'}</h3>{patientList(waiting.filter(a => a.stage === stage))}</div>)}</div></section>
    <section id="cockpit-triagem" className={card}><h2 className={heading}>Triagem e acolhimento</h2>
      {drafts.length ? drafts.map(t => <p key={t.agendamento_id}>Em classificação · {active.find(a => a.id === t.agendamento_id)?.paciente_nome} · {staff.get(t.tecnico_id)?.nome || 'Responsável sem identificação'}</p>) : <p>Sem triagem em andamento registrada.</p>}
      {last && <p>Última classificação · {last.classificacao_risco} · {clock(last.confirmado_em)}</p>}</section>
    <section id="cockpit-consultorios"><h2 className={heading}>Consultórios e salas</h2><div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rooms.map(room => {
      const visits = active.filter(a => a.sala_id === room.id && a.stage === 'consultation');
      const history = done.filter(a => a.sala_id === room.id);
      const team = funcionarios.filter(f => f.ativo && f.unidadeId === unit && f.salaId === room.id);
      const specialties = new Set(team.map(f => f.profissao).filter(Boolean));
      const bottleneck = waiting.filter(a => a.stage === 'ready' && specialties.has(staff.get(a.profissional_id)?.profissao) && (elapsedMinutes(a.arrival, now) || 0)>20).length > 3;
      const call = calls[room.nome];
      const calling = active.find(a => a.sala_id === room.id && a.stage === 'calling')?.paciente_nome ||
        (call && now-Date.parse(call.criadoEm)<60000 && !history.some(a => a.paciente_nome.toUpperCase() === call.pacienteNome && Date.parse(a.concluido_em || '')>=Date.parse(call.criadoEm)) ? call.pacienteNome : '');
      const status = visits.length ? 'Em atendimento' : calling ? 'Chamando' : bottleneck ? 'Alerta de gargalo' : 'Livre';
      return <article key={room.id} className={card}><h3 className="font-semibold">{room.nome}</h3>
        <strong className={visits.length ? 'text-[#2A6F97]' : calling ? 'text-amber-700' : bottleneck ? 'text-red-700' : 'text-emerald-700'}>{status}</strong>
        {visits.map(a => <p key={a.id}>{a.paciente_nome} · {a.profissional_nome} · {staff.get(a.profissional_id)?.profissao} · {elapsedMinutes(a.iniciado_em,now) ?? '—'} min</p>)}
        {!visits.length && (calling ? <p>{calling}</p> : <p>{team.map(f => f.nome).join(', ') || 'Sem profissional vinculado à sala'}</p>)}
        {!visits.length && !calling && waiting.some(a => a.stage === 'ready' && a.sala_id === room.id) && <p>Aguardando chamar próximo da fila</p>}
        <details><summary className="cursor-pointer">Histórico de hoje · {history.length}</summary>{history.map(a => <p key={a.id}>{clock(a.concluido_em)} · {a.paciente_nome} · {a.profissional_nome}</p>)}</details>
      </article>;
    })}</div>{!rooms.length && <p>Nenhuma sala ativa cadastrada.</p>}</section>
    {active.some(a => a.stage === 'consultation' && !rooms.some(s => s.id === a.sala_id)) && <section className={card}><h2 className={heading}>Em atendimento sem sala identificada</h2>{active.filter(a => a.stage === 'consultation' && !rooms.some(s => s.id === a.sala_id)).map(a => <p key={a.id}>{a.paciente_nome} · {a.profissional_nome}</p>)}</section>}
    <section id="cockpit-procedimentos" className={card}><h2 className={heading}>Procedimentos e sessões especializadas</h2>
      {procedures.map(a => <p key={a.id}>{a.paciente_nome} · {a.stage === 'otherCare' ? 'Aguardando equipe' : a.tipo}</p>)}
      <p className="text-sm text-muted-foreground">A administração de medicamentos exige registro de execução. Uma prescrição isolada não confirma atendimento.</p></section></>}
  </div>;
}
