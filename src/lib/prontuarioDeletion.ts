import { supabase } from "@/integrations/supabase/client";

export async function deleteProntuario(prontuarioId: string): Promise<void> {
  // A chave estrangeira faz a exclusão em cascata na mesma operação.
  const { error, count } = await supabase
    .from("prontuarios")
    .delete({ count: "exact" })
    .eq("id", prontuarioId);

  if (error) throw error;
  if (count !== 1) throw new Error("O banco não confirmou a exclusão do prontuário.");
}
