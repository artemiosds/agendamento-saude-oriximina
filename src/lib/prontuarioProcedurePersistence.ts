import { supabase } from "@/integrations/supabase/client";

export interface ProntuarioProcedureLink {
  prontuario_id: string;
  procedimento_id: string;
  cids_selecionados: string[];
  quantidade: number;
  observacao: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Persiste cada vínculo antes de remover os antigos, sem apagar a lista inteira. */
export async function syncProntuarioProcedimentos(
  prontuarioId: string,
  desiredLinks: ProntuarioProcedureLink[],
): Promise<void> {
  if (desiredLinks.some((link) => !UUID.test(link.procedimento_id))) {
    throw new Error("Um procedimento selecionado não possui vínculo válido no catálogo. Confira a lista antes de finalizar.");
  }
  const uniqueLinks = Array.from(
    new Map(desiredLinks.map((link) => [link.procedimento_id, link])).values(),
  );

  const { data: current, error: readError } = await (supabase as any)
    .from("prontuario_procedimentos")
    .select("id, procedimento_id, cids_selecionados, quantidade, observacao")
    .eq("prontuario_id", prontuarioId);
  if (readError || !current) throw readError || new Error("Não foi possível conferir os procedimentos salvos.");

  const retainedIds = new Set<string>();
  for (const link of uniqueLinks) {
    const existing = current.find(
      (row: { id: string; procedimento_id: string }) =>
        row.procedimento_id === link.procedimento_id && !retainedIds.has(row.id),
    );
    if (existing) {
      retainedIds.add(existing.id);
      const changed = existing.quantidade !== link.quantidade ||
        existing.observacao !== link.observacao ||
        JSON.stringify(existing.cids_selecionados || []) !== JSON.stringify(link.cids_selecionados);
      if (!changed) continue;
      const { data, error } = await (supabase as any)
        .from("prontuario_procedimentos")
        .update({
          quantidade: link.quantidade,
          observacao: link.observacao,
          cids_selecionados: link.cids_selecionados,
        })
        .eq("id", existing.id)
        .select("id")
        .maybeSingle();
      if (error || !data) throw error || new Error("Não foi possível atualizar um procedimento.");
    } else {
      const { data, error } = await (supabase as any)
        .from("prontuario_procedimentos")
        .insert(link)
        .select("id")
        .single();
      if (error || !data) throw error || new Error("Não foi possível vincular um procedimento.");
    }
  }

  // Só remove vínculos dispensados depois que todos os novos foram confirmados.
  for (const row of current) {
    if (retainedIds.has(row.id)) continue;
    const { data, error } = await (supabase as any)
      .from("prontuario_procedimentos")
      .delete()
      .eq("id", row.id)
      .select("id")
      .maybeSingle();
    if (error || !data) throw error || new Error("Não foi possível remover um procedimento antigo.");
  }
}
