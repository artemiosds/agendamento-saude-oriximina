export interface ExternalQuotaWindow {
  unidade_id: string;
  periodo_inicio: string;
  periodo_fim: string;
  turno?: string | null;
  horario_inicio?: string | null;
  horario_fim?: string | null;
  dia_semana?: number | null;
  ativo: boolean;
  vagas_total: number;
  vagas_usadas: number;
}

export function isQuotaConfigurationUsable(q: ExternalQuotaWindow): boolean {
  return !!q.unidade_id?.trim() && !!q.turno &&
    ['manha', 'tarde', 'noite', 'integral', 'personalizado'].includes(q.turno) &&
    (q.turno === 'integral' ||
      (!!q.horario_inicio && !!q.horario_fim && q.horario_inicio < q.horario_fim));
}

export function quotaAllowsSlot(q: ExternalQuotaWindow, unidadeId: string, date: string, hour?: string): boolean {
  if (!q.ativo || !isQuotaConfigurationUsable(q) || q.unidade_id !== unidadeId ||
      date < q.periodo_inicio || date > q.periodo_fim || q.vagas_usadas >= q.vagas_total) return false;
  const dayOfWeek = new Date(`${date}T12:00:00`).getDay();
  if (q.dia_semana != null && q.dia_semana !== dayOfWeek) return false;
  return !hour || q.turno === 'integral' ||
    (hour >= q.horario_inicio!.slice(0, 5) && hour < q.horario_fim!.slice(0, 5));
}
