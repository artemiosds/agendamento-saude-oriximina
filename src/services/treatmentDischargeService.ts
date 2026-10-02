import { supabase } from "@/integrations/supabase/client";

export type TreatmentDischargeType = "conclusao" | "outro";

export type TreatmentDischargeScope = "ciclo" | "geral";

export interface TreatmentDischargeResult {
  discharge_id: string;
  removed_sessions: number;
  removed_appointments: number;
  cancelled_other_appointments?: number;
  scope?: TreatmentDischargeScope;
  careness?: { created: boolean; reason?: string; profession?: string; release_date?: string; scope?: string };
}

/** The database function is the single transactional path for manual discharge. */
export async function registerTreatmentDischarge(input: {
  cycleId: string;
  type: TreatmentDischargeType;
  reason: string;
  finalNotes: string;
  scope?: TreatmentDischargeScope;
}): Promise<TreatmentDischargeResult> {
  const { data, error } = await (supabase as any).rpc("register_treatment_discharge", {
    p_cycle_id: input.cycleId,
    p_tipo_alta: input.type,
    p_reason: input.reason.trim(),
    p_final_notes: input.finalNotes.trim(),
    p_escopo: input.scope ?? "ciclo",
  });

  if (error) throw error;
  return data as TreatmentDischargeResult;
}
