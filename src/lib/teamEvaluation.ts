import type { User } from '@/types';

export type TeamMember = { id: string; name: string; specialty: string; reason: string };
export type TeamOpinion = { professional_id: string; name: string; specialty: string; evaluation: string; recommendations: string; created_at: string };
export type TeamRequest = {
  id: string; patient_id: string; patient_name: string; unit_id: string;
  source_id: string; requested_by: string; requested_name: string;
  reason: string; priority: 'rotina' | 'prioritaria';
  members: TeamMember[]; opinions: TeamOpinion[];
  status: 'aberta' | 'concluida'; version: number; created_at: string;
  source_snapshot: Record<string, string>; care_plan: string;
};

export function canUseTeamEvaluation(user: Pick<User, 'role' | 'ativo'> | null): boolean {
  return !!user?.ativo && ['master', 'profissional', 'enfermagem'].includes(user.role);
}

export function pendingTeamMembers(request: Pick<TeamRequest, 'members' | 'opinions'>): TeamMember[] {
  const completed = new Set(request.opinions.map(opinion => opinion.professional_id));
  return request.members.filter(member => !completed.has(member.id));
}

export function validateTeamRequest(reason: string, members: TeamMember[]): string | null {
  if (!reason.trim()) return 'Informe o motivo da solicitação.';
  if (reason.length > 6000) return 'O motivo excedeu o limite de 6.000 caracteres.';
  if (!members.length || members.length > 20) return 'Selecione de 1 a 20 profissionais.';
  if (new Set(members.map(member => member.id)).size !== members.length) return 'Há profissionais repetidos.';
  if (members.some(member => !member.reason.trim() || member.reason.length > 3000)) return 'Informe o motivo para cada profissional (até 3.000 caracteres).';
  return null;
}
