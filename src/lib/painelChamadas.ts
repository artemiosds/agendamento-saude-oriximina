import { supabase } from "@/integrations/supabase/client";

/**
 * Painel de Chamadas — mensageria leve via Realtime Broadcast.
 * Não cria tabelas (regra do projeto): a chamada é um evento efêmero por unidade.
 * Falhas são silenciosas para nunca travar Agenda/Triagem.
 */
export interface ChamadaPaciente {
  id: string;
  pacienteNome: string;
  local: string;
  profissionalNome?: string;
  criadoEm: string;
}

export const canalPainel = (unidadeId: string) => `painel-chamadas-${unidadeId || "geral"}`;

const SALA_KEY = "painel_chamadas_local";
export const getLocalSalvo = () => {
  try { return localStorage.getItem(SALA_KEY) || ""; } catch { return ""; }
};
export const setLocalSalvo = (v: string) => {
  try { localStorage.setItem(SALA_KEY, v); } catch { /* ignore */ }
};

/** Sigilo: exibe apenas primeiro e último nome. */
export const nomeParaPainel = (nome: string) => {
  const p = (nome || "").trim().split(/\s+/).filter(Boolean);
  if (p.length <= 2) return p.join(" ").toUpperCase();
  return `${p[0]} ${p[p.length - 1]}`.toUpperCase();
};

export async function chamarPaciente(unidadeId: string, dados: Omit<ChamadaPaciente, "id" | "criadoEm">): Promise<boolean> {
  const payload: ChamadaPaciente = {
    ...dados,
    pacienteNome: nomeParaPainel(dados.pacienteNome),
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    criadoEm: new Date().toISOString(),
  };
  const channel = supabase.channel(canalPainel(unidadeId), { config: { broadcast: { ack: true } } });
  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), 6000);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") { clearTimeout(t); resolve(); }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { clearTimeout(t); reject(new Error(status)); }
      });
    });
    const r = await channel.send({ type: "broadcast", event: "chamada", payload });
    return r === "ok";
  } catch (e) {
    console.warn("[PainelChamadas] falha ao chamar", e);
    return false;
  } finally {
    supabase.removeChannel(channel);
  }
}
