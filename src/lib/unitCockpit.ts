const arrival = new Set(['chegou', 'confirmado_chegada', 'chegada_confirmada', 'aguardando_triagem']);
const ready = new Set(['triagem_concluida', 'apto_atendimento', 'apto', 'aguardando_atendimento', 'aguardando_profissional']);
const finished = new Set(['concluido', 'finalizado', 'atendido', 'realizado', 'atendimento_encerrado', 'prontuario_finalizado']);
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function careStage(status: string) {
  if (arrival.has(status)) return 'reception';
  if (ready.has(status)) return 'ready';
  if (finished.has(status)) return 'done';
  if (status === 'em_triagem' || status === 'classificando') return 'triage';
  if (status === 'aguardando_enfermagem' || status === 'aguardando_multiprofissional') return 'otherCare';
  if (status === 'chamado' || status === 'chamando') return 'calling';
  if (status === 'em_atendimento') return 'consultation';
  return 'outside';
}

export function cockpitDay(now: number) {
  const parts = formatter.formatToParts(now);
  const part = (name: string) => parts.find(p => p.type === name)?.value;
  return [part('year'), part('month'), part('day')].join('-');
}

export const cockpitLabel = (value?: string | null) => (value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

export function roomSector(name: string) {
  const key = cockpitLabel(name);
  if (/\b(triagem|classificacao de risco)\b/.test(key)) return 'triage';
  if (/\b(recepcao|sala de espera)\b/.test(key)) return 'reception';
  if (/\b(procedimentos?|medicacao|infusao|curativos?|inalacao|nebulizacao|reabilitacao|fisioterapia)\b/.test(key)) return 'procedure';
  return 'consultation';
}

export const procedureVisit = (type: string) =>
  /\b(procedimentos?|medicacao|infusao|curativos?|inalacao|nebulizacao|sessao|fisioterapia|reabilitacao|terapia)\b/.test(cockpitLabel(type));

export const infusionVisit = (description: string) =>
  /\b(medicacao|infusao|soroterapia)\b/.test(cockpitLabel(description));

export function elapsedMinutes(start: string | null, end: number) {
  if (!start) return null;
  const diff = end - Date.parse(start);
  return Number.isFinite(diff) && diff >= 0 ? Math.floor(diff / 60000) : null;
}

export const waitingTone = (minutes: number | null) => minutes === null ? 'neutral' : minutes > 30 ? 'danger' : minutes >= 15 ? 'warning' : 'safe';

export const isBottleneck = (waitingPatientsOver20: number) => waitingPatientsOver20 > 3;

export function freshCockpitCall(createdAt: string, now: number) {
  const age = now - Date.parse(createdAt);
  return Number.isFinite(age) && age >= -10000 && age < 60000;
}
