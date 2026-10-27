import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { resolveProntuarioProfessional } from '@/lib/prontuarioProfessional';
import { todayLocalStr } from '@/lib/utils';
import { procedureService } from "@/services/procedureService";

export function usePreviousProcedures({ patientId, date, editId, open, form, user, mergeProcedimentos }: {
  patientId: string; date: string; editId: string | null; open: boolean;
  form: { profissional_id: string; profissional_nome: string };
  user: { id?: string | null; nome?: string | null } | null | undefined;
  mergeProcedimentos: (items: any[]) => void;
}) {
  const [ultimoAtendProcs, setUltimoAtendProcs] = useState<{ data: string; itens: { id: string; nome: string; cids: string[]; quantidade: number }[] } | null>(null);
  const repeatProfessionalId = resolveProntuarioProfessional(Boolean(editId), form, user).id;
  const [repeatHistoryError, setRepeatHistoryError] = useState(false);
  useEffect(() => {
    setUltimoAtendProcs(null);
    setRepeatHistoryError(false);
    if (!patientId || !repeatProfessionalId || !open) return;
    let cancel = false;
    (async () => {
      try {
        for (let offset = 0; !cancel; offset += 20) {
        let q = (supabase as any)
          .from("prontuarios")
          .select("id, data_atendimento")
          .eq("paciente_id", patientId)
          .eq("profissional_id", repeatProfessionalId)
          .lte("data_atendimento", date || todayLocalStr())
          .order("data_atendimento", { ascending: false })
          .order("criado_em", { ascending: false })
          .order("id", { ascending: false })
          .range(offset, offset + 19);
        if (editId) q = q.neq("id", editId);
        const { data: prs, error: historyError } = await q;
        if (cancel) return;
        if (historyError) throw historyError;
        for (const pr of prs || []) {
          const { data: rows, error: procedureError } = await (supabase as any)
            .from("prontuario_procedimentos")
            .select("procedimento_id, cids_selecionados, quantidade")
            .eq("prontuario_id", pr.id);
          if (cancel) return;
          if (procedureError) throw procedureError;
          if (!rows || rows.length === 0) continue;
          const hydrated = await procedureService.getSpecific({ uuids: rows.map((r: any) => r.procedimento_id).filter(Boolean) });
          if (cancel) return;
          mergeProcedimentos(hydrated);
          const byUuid = new Map(hydrated.map((h) => [h.uuid, h]));
          const itens = rows
            .map((r: any) => {
              const p = byUuid.get(r.procedimento_id);
              return p ? { id: p.id, nome: p.nome, cids: Array.isArray(r.cids_selecionados) ? r.cids_selecionados : [], quantidade: r.quantidade || 1 } : null;
            })
            .filter(Boolean) as { id: string; nome: string; cids: string[]; quantidade: number }[];
          if (itens.length === 0) continue;
          const dt = pr.data_atendimento ? new Date(pr.data_atendimento + "T12:00:00").toLocaleDateString("pt-BR") : "";
          setUltimoAtendProcs({ data: dt, itens });
          return;
        }
        if (!prs || prs.length < 20) break;
        }
      } catch (e) {
        if (!cancel) setRepeatHistoryError(true);
        console.warn("[Prontuario] ultimo atendimento procs:", e);
      }
    })();
    return () => { cancel = true; };
  }, [patientId, repeatProfessionalId, date, editId, open, mergeProcedimentos]);

  return { ultimoAtendProcs, repeatHistoryError };
}
