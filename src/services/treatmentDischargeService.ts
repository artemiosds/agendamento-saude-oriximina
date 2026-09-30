import { supabase } from "@/integrations/supabase/client";

export type TreatmentDischargeType = "conclusao" | "falta" | "outro";

export interface TreatmentDischargeResult {
  discharge_id: string;
  removed_sessions: number;
  removed_appointments: number;
}

/** The database function is the single transactional path for manual discharge. */
export async function registerTreatmentDischarge(input: {
  cycleId: string;
  type: TreatmentDischargeType;
  reason: string;
  finalNotes: string;
}): Promise<TreatmentDischargeResult> {
  const { data, error } = await (supabase as any).rpc("register_treatment_discharge", {
    p_cycle_id: input.cycleId,
    p_tipo_alta: input.type,
    p_reason: input.reason.trim(),
    p_final_notes: input.finalNotes.trim(),
  });

  if (error) throw error;
  return data as TreatmentDischargeResult;
}
