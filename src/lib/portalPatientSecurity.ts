import { PORTAL_PERMISSOES_PADRAO, type PortalPermissoes } from '@/types';

export function parsePortalAccess(value: unknown): { allowed: boolean; message: string; permissoes: PortalPermissoes } {
  const denied = Object.fromEntries(Object.keys(PORTAL_PERMISSOES_PADRAO).map(k => [k, false])) as unknown as PortalPermissoes;
  const invalid = { allowed: false, message: 'Não foi possível verificar seu acesso ao portal. Procure a unidade de saúde.', permissoes: denied };
  if (!value || typeof value !== 'object') return invalid;
  const s = value as Record<string, unknown>;
  if (s.portal_ativo === false) return { ...invalid, message: 'O portal do paciente está temporariamente desativado. Procure a unidade de saúde.' };
  if (s.paciente_bloqueado === true) return { ...invalid, message: 'Seu acesso ao portal está temporariamente desativado. Procure a unidade de saúde.' };
  if (s.allowed !== true || s.portal_ativo !== true || s.paciente_bloqueado !== false || typeof s.paciente_id !== 'string' || !s.paciente_id) return invalid;
  if (!s.permissoes || typeof s.permissoes !== 'object') return invalid;
  const flags = s.permissoes as Record<string, unknown>;
  const keys = Object.keys(PORTAL_PERMISSOES_PADRAO) as (keyof PortalPermissoes)[];
  if (keys.some(k => typeof flags[k] !== 'boolean')) return invalid;
  return { allowed: true, message: '', permissoes: Object.fromEntries(keys.map(k => [k, flags[k]])) as unknown as PortalPermissoes };
}

export interface PortalQueueEntry {
  id: string;
  paciente_id: string;
  posicao: number;
  status: string;
  hora_chegada: string;
  setor: string;
  profissional_id: string;
}

export function mergePortalQueue(queue: PortalQueueEntry[], item: PortalQueueEntry, patientId: string) {
  if (!item?.id || item.paciente_id !== patientId) return { queue, called: false };
  const previous = queue.find(row => row.id === item.id);
  const remaining = queue.filter(row => row.id !== item.id);
  const visible = item.status === 'aguardando' || item.status === 'chamado';
  return {
    queue: visible ? [...remaining, item].sort((a, b) => a.posicao - b.posicao) : remaining,
    called: item.status === 'chamado' && previous?.status !== 'chamado',
  };
}
