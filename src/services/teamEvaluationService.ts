import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import type { TeamMember, TeamRequest } from '@/lib/teamEvaluation';

type TeamDatabase = { public: {
  Tables: { team_evaluation_requests: { Row: TeamRequest; Insert: never; Update: never; Relationships: [] } };
  Views: Record<string, never>;
  Functions: { team_evaluation_command: { Args: { p_action: string; p_payload: Json }; Returns: Json } };
  Enums: Record<string, never>; CompositeTypes: Record<string, never>;
} };
const client = supabase as unknown as SupabaseClient<TeamDatabase>;
export async function listTeamRequests(patientId?: string): Promise<TeamRequest[]> {
  let query = client.from('team_evaluation_requests').select('*').order('created_at', { ascending: false }).limit(100);
  if (patientId) query = query.eq('patient_id', patientId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function command(action: string, payload: Record<string, unknown>): Promise<TeamRequest> {
  const { data, error } = await client.rpc('team_evaluation_command', { p_action: action, p_payload: payload as Json });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data) || !data.id) throw new Error('O servidor não confirmou o registro. Atualize a lista antes de tentar novamente.');
  return data as unknown as TeamRequest;
}

export const createTeamRequest = (input: { id: string; source_id: string; reason: string; priority: string; members: TeamMember[] }) => command('create', input);
export const replyTeamRequest = (request: TeamRequest, evaluation: string, recommendations: string) => command('reply', {
  id: request.id, version: request.version, evaluation, recommendations,
});
export const finishTeamRequest = (request: TeamRequest, carePlan: string) => command('finish', {
  id: request.id, version: request.version, care_plan: carePlan,
});
