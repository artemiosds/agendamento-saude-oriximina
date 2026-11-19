import { memo, useId } from 'react';
import type { ReactNode, Ref } from 'react';
import { AvatarPersonagem } from './AvatarPersonagem';

export type RoomState = 'free' | 'calling' | 'occupied' | 'bottleneck';
export const roomStatuses: Record<RoomState, string> = {
  free: 'Livre', calling: 'Chamando', occupied: 'Em atendimento', bottleneck: 'Gargalo',
};
export const riskColors = {
  vermelho: ['#fbe0e4', '#8a2434', '#b83243'],
  laranja: ['#ffead8', '#873d17', '#cb6426'],
  amarelo: ['#fcf0cb', '#694a0a', '#a26e10'],
  verde: ['#e1f0e5', '#165d44', '#1d8b61'],
  azul: ['#dcecff', '#164d83', '#2875bc'],
};
export type Risk = keyof typeof riskColors;
export type MapPatient = { id: string; tone?: 'safe' | 'warning' | 'danger' | 'neutral'; infusion?: boolean };
export type MapRoom = {
  id: string; name: string; specialty: string; staff: boolean; state: RoomState;
  elapsed: number | null; overdue: number; patients: MapPatient[]; completed: number;
};
export const ROOMS_PER_MAP = 5;
const colors: Record<RoomState, [string, string, string]> = {
  free: ['#e1f0e5', '#165d44', '#1d8b61'],
  calling: ['#ffebc7', '#744204', '#c27a11'],
  occupied: ['#dcecff', '#164d83', '#2875bc'],
  bottleneck: ['#fae0e1', '#8a2434', '#c14451'],
};
const waitingColors = { safe: '#1d8b61', warning: '#b56a0c', danger: '#b83243', neutral: '#607d78' };
const short = (value: string, length: number) => value.length > length ? value.slice(0, length - 1) + '…' : value;

function Chair({ x, y, rotate = 0, color = '#c6dfd8' }: { x: number; y: number; rotate?: number; color?: string }) {
  return <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
    <rect x="-9" y="-6" width="18" height="17" rx="4" fill="#688f8b" opacity=".22" />
    <rect x="-9" y="-8" width="18" height="15" rx="3.5" fill={color} stroke="#779f97" strokeWidth=".85" />
    <rect x="-8" y="2" width="16" height="6" rx="2.5" fill="#9ac0b6" stroke="#779f97" strokeWidth=".65" />
    <path d="M-6-5H6" stroke="#f0faf4" strokeLinecap="round" />
  </g>;
}
function Desk({ x, y, w, h = 23 }: { x: number; y: number; w: number; h?: number }) {
  return <g transform={`translate(${x} ${y})`}>
    <rect x="2" y="3" width={w} height={h} rx="4" fill="#54786f" opacity=".17" />
    <rect width={w} height={h} rx="4" fill="#ebddc2" stroke="#ad987b" />
    <path d={`M5 4H${w - 5}`} stroke="#fff9e8" strokeLinecap="round" />
  </g>;
}
function Screen({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x} ${y})`}>
    <path d="M2 12h17M11 7v5" stroke="#5d7777" strokeWidth="2" strokeLinecap="round" />
    <rect width="22" height="9" rx="1.8" fill="#365954" /><rect x="2" y="1.5" width="18" height="5.5" rx="1" fill="#8bd0c5" />
    <path d="M4 4h8" stroke="#e1faf2" opacity=".8" />
  </g>;
}
function Cabinet({ x, y, w = 33 }: { x: number; y: number; w?: number }) {
  return <g transform={`translate(${x} ${y})`}><rect width={w} height="16" rx="2" fill="#ecf6ed" stroke="#89a69c" />
    <path d={`M1 6h${w - 2}m-7 4h4`} stroke="#91aa9e" /></g>;
}
function Plant({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x} ${y})`}><circle r="8.5" fill="#b9d1b7" stroke="#769b7d" />
    <path d="M-4 3c-3-9 4-7 4-2 2-8 7-5 5 0-1 2-5 4-6 4z" fill="#649975" /><circle r="2.3" cy="2" fill="#49795a" /></g>;
}
function Stretcher({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x} ${y})`}><rect x="2" y="3" width="52" height="21" rx="5" fill="#365e60" opacity=".2" />
    <rect width="52" height="20" rx="4" fill="#f6fcfa" stroke="#799993" />
    <rect x="2" y="2" width="13" height="16" rx="3" fill="#d7e8e4" /><rect x="17" y="2" width="33" height="16" rx="3" fill="#a6c8bd" />
    <path d="M19 17h29" stroke="#628e80" opacity=".35" /></g>;
}
function ProcedureChair({ x, y, patient }: { x: number; y: number; patient?: MapPatient }) {
  return <g transform={`translate(${x} ${y})`}>
    <rect x="-18" y="-14" width="36" height="31" rx="7" fill="#70a195" opacity=".22" />
    <rect x="-19" y="-17" width="36" height="31" rx="6" fill="#96c9b7" stroke="#608e84" />
    <rect x="-14" y="-15" width="26" height="12" rx="5" fill="#d2e9df" stroke="#80ae9e" />
    <path d="M-20 3h5m26 0h6m-10 8h-23" stroke="#659688" strokeWidth="2" strokeLinecap="round" />
    {(!patient || patient.infusion) && <><path d="M25-12v24m-4 1h8m-6-26h5" stroke="#5c857c" strokeLinecap="round" />
      <rect x="26" y="-10" width="6" height="9" rx="1.5" fill="#e0f6f0" stroke="#5d9f94" strokeWidth=".8" /></>}
    {patient && <AvatarPersonagem papel={patient.infusion ? 'medicacao' : 'paciente'} x={-1} y={-4} variante={patient.id} />}
  </g>;
}
function Plate({ x, y, state, label, risk }: { x: number; y: number; state: RoomState; label: string; risk?: Risk }) {
  const [fill, text, dot] = risk ? riskColors[risk] : colors[state];
  const width = Math.max(49, 22 + label.length * 6.05);
  return <g transform={`translate(${x} ${y})`}>
    <rect y="-12" width={width} height="21" rx="6" fill={fill} stroke={dot} strokeWidth=".55" strokeOpacity=".45" />
    <circle className={state === 'calling' || state === 'bottleneck' ? 'planta-pulso' : undefined} cx="10" cy="-1.5" r="3.1" fill={dot} />
    <text x="18" y="2.2" className="planta-status-text" fill={text}>{label}</text>
  </g>;
}
function Door({ x, y, down, width = 31 }: { x: number; y: number; down: boolean; width?: number }) {
  return <g transform={`translate(${x} ${y}) scale(1 ${down ? -1 : 1})`}>
    <path d={`M0 0h${width}`} stroke="#d4e4dc" strokeWidth="9" />
    <path d={`M0 0v-${width}A${width} ${width} 0 0 1 ${width} 0`} fill="#fff" fillOpacity=".42" stroke="#92ada5" strokeWidth=".85" />
    <path d={`M0 0v-${width}`} stroke="#75938e" strokeWidth="1.5" />
  </g>;
}
type OpenZone = (zone: string) => void;
function Zone({ id, title, summary, x, y, w, h, color, children, lower = false, state, onOpen }: {
  id: string; title: string; summary: string; x: number; y: number; w: number; h: number; color: string;
  children: ReactNode; lower?: boolean; state?: RoomState; onOpen?: OpenZone;
}) {
  const doorX = x + (id === 'recepcao' ? w - 129 : id === 'triagem' ? 82 : Math.round(w * .54));
  const label = title + '. ' + summary;
  return <g className="planta-zone" id={id} data-map-zone={id} data-state={state} role={onOpen ? 'button' : 'group'}
    tabIndex={onOpen ? 0 : undefined} aria-label={label} aria-haspopup={onOpen ? 'dialog' : undefined}
    onClick={onOpen ? () => onOpen(id) : undefined} onKeyDown={onOpen ? e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(id); }
    } : undefined}>
    <title>{label}</title>
    <rect x={x} y={y + 3} width={w} height={h} rx="5" fill="#b3cbc1" />
    <rect className="planta-room-floor" x={x} y={y} width={w} height={h} rx="5" fill={color} stroke="#9eb9b1" strokeWidth="2" />
    <path d={`M${x + 2} ${y + 29}h${w - 4}`} stroke="#c5d9ce" />
    <path d={`M${x + 5} ${y + 2}h${w - 10}`} stroke="#fff" opacity=".86" strokeWidth="1.3" />
    <Door x={doorX} y={lower ? y : y + h} down={lower} width={id === 'recepcao' ? 39 : 31} />
    {children}
    <rect className="planta-focus" x={x + 2} y={y + 2} width={w - 4} height={h - 4} rx="5" />
  </g>;
}
function Consultation({ room, x, w, onOpen }: { room: MapRoom; x: number; w: number; onOpen?: OpenZone }) {
  const y = 65, h = 142;
  const status = roomStatuses[room.state] + (room.elapsed === null ? '' : ' · ' + room.elapsed + ' min');
  const singleLine = room.name.length < 19 && room.specialty.length < 14;
  return <Zone id={room.id} title={room.name} summary={status} x={x} y={y} w={w} h={h} state={room.state} color="#f4f8f4" onOpen={onOpen}>
    <text className="planta-room-title" x={x + 10} y={y + 20}>{short(room.name, singleLine ? 18 : Math.floor((w - 26) / 7.8))}</text>
    {singleLine && <text className="planta-tile-label" textAnchor="end" x={x + w - 11} y={y + 19}>{room.specialty}</text>}
    <Plate x={x + 10} y={y + 47} state={room.state} label={status} />
    <Cabinet x={x + w - 41} y={y + 37} w={31} /><Stretcher x={x + w - 64} y={y + 64} />
    <Chair x={x + w - 33} y={y + 109} rotate={90} color="#e3dfcf" /><Plant x={x + 19} y={y + 122} />
    <Chair x={x + 58} y={y + 72} />{room.staff && <AvatarPersonagem papel="clinico" x={x + 58} y={y + 65} variante={room.id} />}
    <Desk x={x + 42} y={y + 80} w={69} h={20} /><Screen x={x + 49} y={y + 83} />
    <Chair x={x + 84} y={y + 112} rotate={180} color="#d0dfef" />
    {room.patients[0] && <AvatarPersonagem key={room.patients[0].id} papel="paciente" x={x + 84} y={y + 108} variante={room.patients[0].id} />}
    {room.patients.length > 1 && <text className="planta-mini" x={x + 110} y={y + 117}>+{room.patients.length - 1}</text>}
    {room.state === 'bottleneck' && <>
      <rect x={x + w - 132} y={y + 100} width="126" height="21" rx="5" fill="#fbe7e6" />
      <text className="planta-mini" x={x + w - 126} y={y + 114} style={{ fill: '#832c36', fontWeight: 750 }}>{room.overdue} aguardando 20+ min</text>
    </>}
    {room.state !== 'bottleneck' && <text className="planta-tile-label" x={x + w - 11} y={y + 133} textAnchor="end">{room.completed} concluídos</text>}
  </Zone>;
}
function Reception({ patients, longest, onOpen }: { patients: MapPatient[]; longest: number | null; onOpen?: OpenZone }) {
  const total = patients.length, label = total + ' aguardando', maxText = longest === null ? 'Espera sem horário' : 'Maior espera · ' + longest + ' min';
  return <Zone id="recepcao" title="Recepção e sala de espera" summary={label} x={23} y={288} w={366} h={148} color="#f3f7f2" lower onOpen={onOpen}>
    <text className="planta-room-title" x="36" y="309">Recepção e sala de espera</text>
    <text className="planta-tile-label" x="377" y="308" textAnchor="end">ACOLHIMENTO</text>
    {Array.from({ length: 16 }, (_, i) => {
      const x = 64 + (i % 8) * 29, y = 355 + Math.floor(i / 8) * 29, patient = patients[i];
      return <g key={i}><Chair x={x} y={y} />{patient && <g key={patient.id}>
        <circle cx={x} cy={y + 1} r="12" fill="none" stroke={waitingColors[patient.tone || 'neutral']} strokeWidth="1.7" />
        <AvatarPersonagem papel="paciente" x={x} y={y - 5} variante={patient.id} />
      </g>}</g>;
    })}
    <Desk x={310} y={345} w={64} h={28} /><Screen x={319} y={357} /><Chair x={345} y={335} /><Plant x={365} y={400} />
    <rect x="36" y="406" width="132" height="21" rx="5" fill="#e3efe8" />
    <text className="planta-mini" x="44" y="420" fill="#155a46">{label}{total > 16 && ' · +' + (total - 16)}</text>
    {total > 0 && <>
      <rect x="174" y="406" width="149" height="21" rx="5" fill={longest !== null && longest > 30 ? '#f9e6e6' : '#e7eeeb'} />
      <circle cx="184" cy="416.5" r="3" fill={waitingColors[longest === null ? 'neutral' : longest > 30 ? 'danger' : longest >= 15 ? 'warning' : 'safe']} />
      <text className="planta-mini" x="193" y="420">{maxText}</text>
    </>}
  </Zone>;
}
function Triage({ patients, risk, onOpen }: { patients: MapPatient[]; risk?: Risk; onOpen?: OpenZone }) {
  const active = patients.length > 0;
  const label = active ? (risk ? 'Prioridade ' + risk : 'Classificando') : 'Livre';
  return <Zone id="triagem" title="Triagem" summary={label} x={400} y={288} w={253} h={148} color="#f4f7ef" lower onOpen={onOpen}>
    <text className="planta-room-title" x="412" y="309">Triagem</text>
    <text className="planta-tile-label" x="641" y="308" textAnchor="end">CLASSIFICAÇÃO DE RISCO</text>
    <Plate x={411} y={337} state={active ? 'occupied' : 'free'} label={label} risk={risk} />
    <Chair x={504} y={350} /><AvatarPersonagem papel="enfermagem" x={504} y={346} variante="triagem" />
    <Desk x={461} y={362} w={77} h={24} /><Screen x={470} y={367} />
    <Chair x={493} y={399} rotate={180} color="#dfdfd0" />
    {patients[0] && <AvatarPersonagem key={patients[0].id} papel="paciente" x={493} y={394} variante={patients[0].id} />}
    <Cabinet x={607} y={335} w={34} /><Plant x={625} y={416} />
    <path d="M582 365h16v20h-16z" fill="#d6e6df" stroke="#84a097" /><path d="M585 369h10m-5 0v4" stroke="#577e70" />
    <rect x="582" y="378" width="16" height="9" rx="2" fill="#b6d2c5" /><text className="planta-tile-label" x="609" y="382">Balança</text>
    <text className="planta-mini" x="412" y="420">{active ? patients.length + ' em classificação' : 'Sem classificação em curso'}</text>
  </Zone>;
}
function Procedures({ patients, waiting, onOpen }: { patients: MapPatient[]; waiting: number; onOpen?: OpenZone }) {
  const title = 'Medicação e sessões', label = patients.length + ' em andamento';
  return <Zone id="procedimentos" title={title} summary={label} x={664} y={288} w={545} h={148} color="#edf6f0" lower onOpen={onOpen}>
    <text className="planta-room-title" x="676" y="309">{title}</text>
    <text className="planta-tile-label" x="1197" y="308" textAnchor="end">PROCEDIMENTOS</text>
    <Plate x={676} y={338} state={patients.length ? 'occupied' : 'free'} label={label} />
    <Cabinet x={1053} y={328} w={122} /><Desk x={1059} y={358} w={69} /><Screen x={1064} y={362} /><Chair x={1082} y={390} rotate={180} /><Plant x={1181} y={402} />
    {Array.from({ length: 4 }, (_, i) => <ProcedureChair key={patients[i]?.id ?? i} x={717 + i * 79} y={382} patient={patients[i]} />)}
    <text className="planta-mini" x="676" y="419">{patients.length > 4 ? '+' + (patients.length - 4) + ' em andamento além dos exibidos' : waiting ? waiting + ' aguardando equipe' : ''}</text>
  </Zone>;
}

const Background = memo(function Background({ grid, arrow, empty }: { grid: string; arrow: string; empty: boolean }) {
  return <>
    <defs>
      <pattern id={grid} width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0v16" fill="none" stroke="#b8d0c7" strokeOpacity=".55" strokeWidth=".7" /></pattern>
      <marker id={arrow} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="m0 0 10 5-10 5z" fill="#569387" /></marker>
    </defs>
    <rect width="1232" height="466" fill="#deebe7" /><rect width="1232" height="466" fill={`url(#${grid})`} />
    <rect x="11" y="51" width="1210" height="396" rx="10" fill="#72998a" opacity=".19" />
    <rect x="11" y="48" width="1210" height="396" rx="10" fill="#d2e4db" stroke="#8eaaa1" strokeWidth="2.7" />
    <rect x="16" y="53" width="1200" height="386" rx="7" fill="#d9e8e0" stroke="#edf5ed" strokeWidth="3" />
    <path d="M22 238H1210m-1188 35h1188" stroke="#c3d9d0" />
    <path d="M66 255H252m147 0h800" stroke="#579286" strokeWidth="1.4" strokeDasharray="5 6" markerEnd={`url(#${arrow})`} opacity=".55" />
    <text className="planta-annotation" x="326" y="259" textAnchor="middle">CORREDOR CENTRAL</text>
    <text className="planta-wing" x="23" y="32">CONSULTÓRIOS · ALA CLÍNICA</text>
    <path d="M242 28h966M23 451h44m131 0h1010" stroke="#a6c1b7" opacity=".75" />
    <text className="planta-annotation" x="121" y="459" textAnchor="middle">ENTRADA</text>
    {empty && <text className="planta-room-title" textAnchor="middle" x="616" y="138">Nenhum consultório ativo cadastrado nesta unidade.</text>}
  </>;
});

export function PlantaUnidade({ rooms, waiting, longest, triage, risk, procedures, waitingCare, viewport, onOpen }: {
  rooms: MapRoom[]; waiting: MapPatient[]; longest: number | null; triage: MapPatient[]; risk?: Risk;
  procedures: MapPatient[]; waitingCare: number; viewport: Ref<HTMLDivElement>; onOpen?: OpenZone;
}) {
  const uid = useId().replace(/:/g, '');
  const arrow = 'planta-arrow-' + uid;
  const width = Math.min(354, Math.floor((1186 - 9 * (rooms.length - 1)) / Math.max(rooms.length, 1)));
  const start = Math.round((1232 - (rooms.length * width + 9 * (rooms.length - 1))) / 2);
  return <div className="planta-map-wrap" ref={viewport}>
    <svg className="planta-map" viewBox="0 0 1232 466" role="group" aria-label="Planta da unidade">
      <Background grid={'planta-grid-' + uid} arrow={arrow} empty={!rooms.length} />
      {rooms.map((room, index) => <Consultation key={room.id} room={room} x={start + index * (width + 9)} w={width} onOpen={onOpen} />)}
      <Reception patients={waiting} longest={longest} onOpen={onOpen} />
      <Triage patients={triage} risk={risk} onOpen={onOpen} />
      <Procedures patients={procedures} waiting={waitingCare} onOpen={onOpen} />
      <g pointerEvents="none"><path d="M80 439v8m83-8v8" stroke="#96b2a8" /><path d="M81 436h81" stroke="#e4efe8" strokeWidth="5" />
        <path d="M122 447V431" stroke="#519185" strokeWidth="1.2" markerEnd={`url(#${arrow})`} /></g>
    </svg>
  </div>;
}
