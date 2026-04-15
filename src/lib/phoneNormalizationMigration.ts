import { supabase } from "@/integrations/supabase/client";
import { normalizePhone } from "@/lib/phoneUtils";

const MIGRATION_KEY = "phone_normalization_v1_done";

/**
 * One-time idempotent migration to normalize all patient phone numbers.
 * Runs on app startup; skips if already completed.
 */
export async function runPhoneNormalizationMigration(): Promise<void> {
  if (localStorage.getItem(MIGRATION_KEY)) return;

  try {
    const { data: pacientes, error } = await supabase
      .from("pacientes")
      .select("id, telefone");

    if (error || !pacientes) {
      console.warn("[PhoneMigration] Failed to fetch patients:", error?.message);
      return;
    }

    let fixed = 0;
    let skipped = 0;

    const updates: { id: string; telefone: string }[] = [];

    for (const p of pacientes) {
      const raw = p.telefone;

      // Skip empty
      if (!raw || raw.trim() === "") {
        skipped++;
        continue;
      }

      // Already valid
      if (raw.length === 13 && raw.startsWith("55") && /^\d+$/.test(raw)) {
        continue;
      }

      const normalized = normalizePhone(raw);
      if (!normalized) {
        skipped++;
        console.warn(`[PhoneMigration] Could not normalize phone for patient ${p.id}: "${raw}"`);
        continue;
      }

      updates.push({ id: p.id, telefone: normalized });
    }

    // Batch update
    for (const u of updates) {
      const { error: updateErr } = await supabase
        .from("pacientes")
        .update({ telefone: u.telefone })
        .eq("id", u.id);

      if (updateErr) {
        console.warn(`[PhoneMigration] Failed to update ${u.id}:`, updateErr.message);
        skipped++;
      } else {
        fixed++;
      }
    }

    // Migration complete — silent in production
    localStorage.setItem(MIGRATION_KEY, new Date().toISOString());
  } catch (err) {
    console.error("[PhoneMigration] Unexpected error:", err);
  }
}
