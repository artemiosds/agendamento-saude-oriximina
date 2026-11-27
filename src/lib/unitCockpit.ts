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

export const waitingTone = (minutes: number | null): 'neutral' | 'danger' | 'warning' | 'safe' => minutes === null ? 'neutral' : minutes > 30 ? 'danger' : minutes >= 15 ? 'warning' : 'safe';

export const isBottleneck = (waitingPatientsOver20: number) => waitingPatientsOver20 > 3;

export function freshCockpitCall(createdAt: string, now: number) {
  const age = now - Date.parse(createdAt);
  return Number.isFinite(age) && age >= -10000 && age < 60000;
}

/** Operational waiting queue: only a registered room in this unit can receive demand.
 * Group by patient per room; never distribute a specialty's queue to its entire team.
 */
export function linkedRoomWaits<T extends { id: string; paciente_id: string; sala_id: string; stage: ReturnType<typeof careStage>; arrival: string | null }>(
  items: readonly T[], validRooms: ReadonlySet<string>, now: number, limit = 20,
) {
  const byRoom = new Map<string, Map<string, T>>();
  for (const item of items) {
    const minutes = elapsedMinutes(item.arrival, now);
    if (item.stage !== 'ready' || !validRooms.has(item.sala_id) || minutes === null || minutes <= limit) continue;
    const patients = byRoom.get(item.sala_id) ?? new Map<string, T>();
    const key = item.paciente_id || item.id;
    const previous = patients.get(key);
    if (!previous || (elapsedMinutes(previous.arrival, now) ?? -1) < minutes) patients.set(key, item);
    byRoom.set(item.sala_id, patients);
  }
  return byRoom;
}

export type RoomIllustration = 'consultation' | 'physio' | 'speech' | 'dental' | 'nursing' | 'psychology' | 'nutrition' | 'occupational' | 'reception' | 'procedure';

/** Visual classification only. Never use these hints to route patients or infer equipment inventory. */
export function roomIllustration(name: string, specialty = ''): RoomIllustration {
  const classify = (text: string): RoomIllustration | undefined => {
    const key = cockpitLabel(text);
    if (/\b(fisioterapia|fisioterapeut[ae]|ginasio|reabilitacao fisica)\b/.test(key)) return 'physio';
    if (/\b(fonoaudiologia|fonoaudiolog[ao]|fono)\b/.test(key)) return 'speech';
    if (/\b(odontologia|odontolog[ao]|dentista|odontologico|odontologica)\b/.test(key)) return 'dental';
    if (/\b(enfermagem|enfermeir[ao]|triagem|classificacao de risco|vacinacao|vacina|imunizacao|curativos?)\b/.test(key)) return 'nursing';
    if (/\b(psicologia|psicolog[ao]|psicoterapia)\b/.test(key)) return 'psychology';
    if (/\b(nutricao|nutricionista)\b/.test(key)) return 'nutrition';
    if (/\b(terapia ocupacional|terapeuta ocupacional)\b/.test(key)) return 'occupational';
    if (/\b(recepcao|sala de espera|acolhimento)\b/.test(key)) return 'reception';
    if (/\b(medicacao|infusao|procedimentos?|nebulizacao|inalacao)\b/.test(key)) return 'procedure';
    return undefined;
  };
  const explicit = classify(name);
  if (explicit) return explicit;
  // Shared rooms keep their neutral layout unless every registered specialty matches.
  const kinds = specialty.split('·').map(part => classify(part.trim()) ?? 'consultation');
  return kinds.length > 0 && kinds.every(kind => kind === kinds[0]) ? kinds[0] : 'consultation';
}
