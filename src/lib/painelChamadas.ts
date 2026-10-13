import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Painel de Chamadas — mensageria leve via Realtime Broadcast.
 * Não cria tabelas (regra do projeto): a chamada é um evento efêmero por unidade.
 * Falhas são silenciosas para nunca travar Agenda/Triagem.
 * O canal de envio é reaproveitado por unidade (sem recriar a cada chamada).
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

const canais = new Map<string, Promise<RealtimeChannel>>();

function obterCanal(unidadeId: string): Promise<RealtimeChannel> {
  const nome = canalPainel(unidadeId);
  const existente = canais.get(nome);
  if (existente) return existente;
  const p = new Promise<RealtimeChannel>((resolve, reject) => {
    const channel = supabase.channel(`${nome}`, { config: { broadcast: { ack: true } } });
    const t = setTimeout(() => { descartar(nome, channel); reject(new Error("timeout")); }, 6000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") { clearTimeout(t); resolve(channel); }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        clearTimeout(t);
        descartar(nome, channel);
        reject(new Error(status));
      }
    });
  });
  canais.set(nome, p);
  return p;
}

function descartar(nome: string, channel: RealtimeChannel) {
  canais.delete(nome);
  try { supabase.removeChannel(channel); } catch { /* ignore */ }
}

async function enviar(unidadeId: string, payload: ChamadaPaciente) {
  const channel = await obterCanal(unidadeId);
  const r = await channel.send({ type: "broadcast", event: "chamada", payload });
  if (r !== "ok") { descartar(canalPainel(unidadeId), channel); throw new Error(String(r)); }
}

export async function chamarPaciente(unidadeId: string, dados: Omit<ChamadaPaciente, "id" | "criadoEm">): Promise<boolean> {
  const payload: ChamadaPaciente = {
    ...dados,
    pacienteNome: nomeParaPainel(dados.pacienteNome),
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    criadoEm: new Date().toISOString(),
  };
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      await enviar(unidadeId, payload);
      return true;
    } catch (e) {
      console.warn("[PainelChamadas] falha ao chamar", e);
    }
  }
  return false;
}
