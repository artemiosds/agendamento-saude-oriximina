import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Painel de Chamadas — mensageria leve via Realtime Broadcast.
 * Não cria tabelas (regra do projeto): a chamada é um evento efêmero por unidade.
 * Falhas são retornadas ao chamador, sem bloquear os fluxos clínicos.
 * O canal de envio é reaproveitado por unidade (sem recriar a cada chamada).
 */
export interface ChamadaPaciente {
  id: string;
  pacienteNome: string;
  local: string;
  profissionalNome?: string;
  criadoEm: string;
  unidadeId?: string;
}

export const canalPainel = (unidadeId: string) => `painel-chamadas-${unidadeId || "geral"}`;

const SALA_KEY = "painel_chamadas_local";
const salaKey = (unidade: string, contexto: string) => `${SALA_KEY}:${unidade}:${contexto}`;
export const getLocalSalvo = (unidade = '', contexto = '') => {
  if (!unidade) return '';
  try { return localStorage.getItem(salaKey(unidade, contexto)) || ""; } catch { return ""; }
};
export const setLocalSalvo = (v: string, unidade = '', contexto = '') => {
  if (!unidade) return;
  try { localStorage.setItem(salaKey(unidade, contexto), v); } catch { /* ignore */ }
};

/** Nome completo do paciente (falado e exibido), apenas com espaços normalizados. */
export const nomeParaPainel = (nome: string) =>
  (nome || "").trim().split(/\s+/).filter(Boolean).join(" ").toUpperCase();

export type ConfirmacaoPainel = 'recebida' | 'recebida_sem_audio' | 'ocupado';
export type ResultadoChamada = ConfirmacaoPainel | 'nao_confirmada' | 'erro';
export function chamadaValida(value: unknown, unidade: string, validarPrazo = true): value is ChamadaPaciente {
  if (!value || typeof value !== 'object') return false;
  const c = value as ChamadaPaciente;
  if (typeof c.id !== 'string' || !c.id || c.id.length > 100 ||
    typeof c.pacienteNome !== 'string' || !c.pacienteNome.trim() || c.pacienteNome.length > 250 ||
    typeof c.local !== 'string' || !c.local.trim() || c.local.length > 150 ||
    (c.profissionalNome !== undefined && (typeof c.profissionalNome !== 'string' || c.profissionalNome.length > 250)) ||
    (c.unidadeId !== undefined && c.unidadeId !== unidade)) return false;
  if (typeof c.criadoEm !== 'string') return false;
  const time = Date.parse(c.criadoEm);
  return Number.isFinite(time) && (!validarPrazo || (time <= Date.now() + 60000 && time >= Date.now() - 15 * 60000));
}

interface ChannelEntry { channel: RealtimeChannel; ready: Promise<RealtimeChannel> }
const canais = new Map<string, ChannelEntry>();
const pending = new Map<string, { unidade: string; resolve: (status: ConfirmacaoPainel) => void }>();

function obterCanal(unidadeId: string): Promise<RealtimeChannel> {
  const nome = canalPainel(unidadeId);
  const existente = canais.get(nome);
  if (existente) return existente.ready;
  const channel = supabase.channel(nome, { config: { broadcast: { ack: true } } });
  const p = new Promise<RealtimeChannel>((resolve, reject) => {
    const t = setTimeout(() => { descartar(nome, channel); reject(new Error("timeout")); }, 4000);
    channel.on('broadcast', { event: 'chamada_status' }, ({ payload }) => {
      const item = pending.get(payload?.id);
      if (!item || item.unidade !== unidadeId || payload?.unidadeId !== unidadeId ||
        !['recebida', 'recebida_sem_audio', 'ocupado'].includes(payload?.status)) return;
      item.resolve(payload.status as ConfirmacaoPainel);
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") { clearTimeout(t); resolve(channel); }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        clearTimeout(t);
        descartar(nome, channel);
        reject(new Error(status));
      }
    });
  });
  canais.set(nome, { channel, ready: p });
  return p;
}

function descartar(nome: string, channel: RealtimeChannel) {
  if (canais.get(nome)?.channel === channel) canais.delete(nome);
  try { void supabase.removeChannel(channel).catch(() => {}); } catch { /* ignore */ }
}

export async function solicitarChamada(unidadeId: string, dados: Omit<ChamadaPaciente, "id" | "criadoEm">): Promise<ResultadoChamada> {
  if (!unidadeId?.trim()) return 'erro';
  const payload: ChamadaPaciente = {
    ...dados,
    pacienteNome: nomeParaPainel(dados.pacienteNome),
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    criadoEm: new Date().toISOString(),
    unidadeId,
  };
  if (!chamadaValida(payload, unidadeId)) return 'erro';
  let serverAccepted = false;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const channel = await obterCanal(unidadeId);
      const confirmation = new Promise<ConfirmacaoPainel | null>(resolve => {
        pending.set(payload.id, { unidade: unidadeId, resolve });
        timer = setTimeout(() => resolve(null), 3000);
      });
      const sent = await channel.send({ type: 'broadcast', event: 'chamada', payload }, { timeout: 2000 });
      // An acknowledgement from a TV is stronger than a transport timeout.
      const confirmed = await confirmation;
      if (confirmed) return confirmed;
      if (sent === 'ok') serverAccepted = true;
      else descartar(canalPainel(unidadeId), channel);
    } catch (e) {
      console.warn("[PainelChamadas] falha ao chamar", e);
    } finally {
      if (timer) clearTimeout(timer);
      pending.delete(payload.id);
    }
  }
  return serverAccepted ? 'nao_confirmada' : 'erro';
}

/** Compatibility for existing consumers: true only after a TV confirms reception. */
export async function chamarPaciente(unidadeId: string, dados: Omit<ChamadaPaciente, 'id' | 'criadoEm'>): Promise<boolean> {
  const result = await solicitarChamada(unidadeId, dados);
  return result === 'recebida' || result === 'recebida_sem_audio';
}
