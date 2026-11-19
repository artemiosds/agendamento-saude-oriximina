const arrival = new Set(['chegou', 'confirmado_chegada', 'chegada_confirmada', 'aguardando_triagem']);
const ready = new Set(['triagem_concluida', 'apto_atendimento', 'apto', 'aguardando_atendimento', 'aguardando_profissional']);
const finished = new Set(['concluido', 'finalizado', 'atendido', 'atendimento_encerrado', 'prontuario_finalizado']);

export function careStage(status: string) {
  if (arrival.has(status)) return 'reception';
  if (ready.has(status)) return 'ready';
  if (finished.has(status)) return 'done';
  if (status === 'aguardando_enfermagem' || status === 'aguardando_multiprofissional') return 'otherCare';
  if (status === 'chamado' || status === 'chamando') return 'calling';
  if (status === 'em_atendimento') return 'consultation';
  return 'outside';
}

export function elapsedMinutes(start: string | null, end: number) {
  if (!start) return null;
  const diff = end - Date.parse(start);
  return Number.isFinite(diff) && diff >= 0 ? Math.floor(diff / 60000) : null;
}
