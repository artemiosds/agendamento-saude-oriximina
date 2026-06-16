// ============================================================
// Shared WhatsApp provider abstraction (Evolution + UazapiGO).
// Interface genérica para Fase 2 do hardening. Inclui presence
// (typing/composing/paused) para suportar simulação humana.
// ============================================================

export type ProviderName = "evolution" | "uazapigo" | "cloud";
export type PresenceState = "composing" | "paused" | "available" | "recording";

export interface SendResult {
  ok: boolean;
  status: number;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  raw?: unknown;
}

export interface ConnectionStatus {
  connected: boolean;
  state: string;
  raw?: unknown;
}

export interface WhatsAppProvider {
  name: ProviderName;
  sendTextMessage(phone: string, text: string): Promise<SendResult>;
  sendTemplateMessage(phone: string, text: string, _templateMeta?: unknown): Promise<SendResult>;
  sendPresence(phone: string, state: PresenceState): Promise<void>;
  checkConnection(): Promise<ConnectionStatus>;
  getMessageStatus(providerMessageId: string): Promise<{ status: string; raw?: unknown }>;
}

// ----------------------------------------------------------------
// Utils
// ----------------------------------------------------------------
function normUrl(raw: string): string {
  return (raw || "").trim().replace(/\/+$/, "");
}

async function safeFetch(url: string, init: RequestInit, timeoutMs = 15000): Promise<{ ok: boolean; status: number; data: any; text: string; error?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await r.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    return { ok: r.ok, status: r.status, data, text };
  } catch (e: any) {
    return { ok: false, status: 0, data: null, text: "", error: e?.message || "fetch_error" };
  } finally {
    clearTimeout(t);
  }
}

// ----------------------------------------------------------------
// UazapiGO Provider
// ----------------------------------------------------------------
export interface UazapiConfig {
  server_url: string;
  admin_token: string;
  instance: string;
  instance_token?: string; // resolvido on-demand
}

export class UazapigoProvider implements WhatsAppProvider {
  name: ProviderName = "uazapigo";
  private base: string;
  private token: string | null = null;

  constructor(private cfg: UazapiConfig) {
    this.base = normUrl(cfg.server_url);
    if (cfg.instance_token) this.token = cfg.instance_token;
  }

  private async resolveToken(): Promise<string | null> {
    if (this.token) return this.token;
    // Se o "instance" já parece ser um token (UUID longo), usa direto.
    if (this.cfg.instance && this.cfg.instance.length > 20) {
      this.token = this.cfg.instance;
      return this.token;
    }
    const r = await safeFetch(`${this.base}/instance/all`, {
      headers: {
        admintoken: this.cfg.admin_token,
        "admin-token": this.cfg.admin_token,
        "Content-Type": "application/json",
      },
    });
    const list = r.data?.instances || r.data || [];
    if (Array.isArray(list)) {
      const found = list.find((i: any) =>
        String(i.name) === this.cfg.instance ||
        String(i.instanceName) === this.cfg.instance ||
        String(i.id) === this.cfg.instance,
      );
      this.token = found?.token || found?.instanceToken || null;
    }
    return this.token;
  }

  private async authHeaders() {
    const tk = await this.resolveToken();
    if (!tk) throw new Error("uazapigo_token_unresolved");
    return { token: tk, apikey: tk, "Content-Type": "application/json" };
  }

  async sendPresence(phone: string, state: PresenceState): Promise<void> {
    try {
      const headers = await this.authHeaders();
      // UazapiGO presence endpoint
      await safeFetch(`${this.base}/chat/presence`, {
        method: "POST",
        headers,
        body: JSON.stringify({ number: phone, presence: state }),
      }, 8000);
    } catch (_) {
      // presence é best-effort, nunca quebra envio
    }
  }

  async sendTextMessage(phone: string, text: string): Promise<SendResult> {
    try {
      const headers = await this.authHeaders();
      const body = JSON.stringify({ number: phone, text, instance: this.cfg.instance });
      for (const url of [`${this.base}/message/text`, `${this.base}/send/text`]) {
        const r = await safeFetch(url, { method: "POST", headers, body }, 20000);
        if (r.ok) {
          const id = r.data?.id || r.data?.messageId || r.data?.key?.id || "";
          return { ok: true, status: r.status, providerMessageId: String(id), raw: r.data };
        }
        if (r.status && r.status !== 404) {
          return { ok: false, status: r.status, errorCode: `http_${r.status}`, errorMessage: r.text?.slice(0, 500), raw: r.data };
        }
      }
      return { ok: false, status: 0, errorCode: "no_endpoint", errorMessage: "Nenhum endpoint válido respondeu" };
    } catch (e: any) {
      return { ok: false, status: 0, errorCode: "exception", errorMessage: e?.message || "erro" };
    }
  }

  sendTemplateMessage(phone: string, text: string): Promise<SendResult> {
    // UazapiGO não diferencia template/free no endpoint — manda como texto.
    return this.sendTextMessage(phone, text);
  }

  async checkConnection(): Promise<ConnectionStatus> {
    try {
      const headers = await this.authHeaders();
      const r = await safeFetch(`${this.base}/instance/status`, { headers }, 8000);
      const stateObj = r.data?.status || r.data?.state || r.data?.instance?.status || r.data?.instance?.state || r.data || {};
      let connected = false;
      let stateStr = "DISCONNECTED";
      if (typeof stateObj === "string") {
        stateStr = stateObj;
        connected = /CONNECTED|OPEN/i.test(stateStr);
      } else {
        connected = !!(stateObj.connected || stateObj.loggedIn || stateObj.open || stateObj.state === "open");
        stateStr = connected ? "CONNECTED" : (stateObj.status || stateObj.state || "DISCONNECTED");
      }
      return { connected, state: stateStr, raw: r.data };
    } catch (e: any) {
      return { connected: false, state: "ERROR", raw: { error: e?.message } };
    }
  }

  async getMessageStatus(providerMessageId: string): Promise<{ status: string; raw?: unknown }> {
    // UazapiGO geralmente não tem polling — status vem por webhook. Retornamos unknown.
    return { status: "unknown", raw: { providerMessageId } };
  }
}

// ----------------------------------------------------------------
// Evolution Provider
// ----------------------------------------------------------------
export interface EvolutionConfig {
  base_url: string;
  api_key: string;
  instance_name: string;
}

export class EvolutionProvider implements WhatsAppProvider {
  name: ProviderName = "evolution";
  private base: string;
  constructor(private cfg: EvolutionConfig) {
    this.base = normUrl(cfg.base_url);
  }

  private headers() {
    return { apikey: this.cfg.api_key, "Content-Type": "application/json" };
  }

  async sendPresence(phone: string, state: PresenceState): Promise<void> {
    try {
      const evoState = state === "composing" ? "composing" : state === "recording" ? "recording" : "paused";
      await safeFetch(`${this.base}/chat/sendPresence/${this.cfg.instance_name}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ number: phone, presence: evoState }),
      }, 8000);
    } catch (_) {
      // best-effort
    }
  }

  async sendTextMessage(phone: string, text: string): Promise<SendResult> {
    try {
      const r = await safeFetch(`${this.base}/message/sendText/${this.cfg.instance_name}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ number: phone, text, textMessage: { text } }),
      }, 20000);
      if (r.ok) {
        const id = r.data?.key?.id || r.data?.id || r.data?.messageId || "";
        return { ok: true, status: r.status, providerMessageId: String(id), raw: r.data };
      }
      return { ok: false, status: r.status, errorCode: `http_${r.status}`, errorMessage: r.text?.slice(0, 500), raw: r.data };
    } catch (e: any) {
      return { ok: false, status: 0, errorCode: "exception", errorMessage: e?.message || "erro" };
    }
  }

  sendTemplateMessage(phone: string, text: string): Promise<SendResult> {
    return this.sendTextMessage(phone, text);
  }

  async checkConnection(): Promise<ConnectionStatus> {
    try {
      const r = await safeFetch(`${this.base}/instance/connectionState/${this.cfg.instance_name}`, { headers: this.headers() }, 8000);
      const state = r.data?.instance?.state || r.data?.state || "DISCONNECTED";
      return { connected: String(state).toLowerCase() === "open", state: String(state), raw: r.data };
    } catch (e: any) {
      return { connected: false, state: "ERROR", raw: { error: e?.message } };
    }
  }

  async getMessageStatus(providerMessageId: string): Promise<{ status: string; raw?: unknown }> {
    return { status: "unknown", raw: { providerMessageId } };
  }
}

// ----------------------------------------------------------------
// Factory
// ----------------------------------------------------------------
export async function buildProviderFromConfig(supabase: any, providerName: ProviderName): Promise<WhatsAppProvider | null> {
  const { data: cfg } = await supabase.from("clinica_config").select("*").limit(1).maybeSingle();
  if (!cfg) return null;
  if (providerName === "uazapigo") {
    if (!cfg.uazapi_server_url || !cfg.uazapi_admin_token || !cfg.uazapi_instance) return null;
    return new UazapigoProvider({
      server_url: cfg.uazapi_server_url,
      admin_token: cfg.uazapi_admin_token,
      instance: cfg.uazapi_instance,
    });
  }
  if (providerName === "evolution") {
    if (!cfg.evolution_base_url || !cfg.evolution_api_key || !cfg.evolution_instance_name) return null;
    return new EvolutionProvider({
      base_url: cfg.evolution_base_url,
      api_key: cfg.evolution_api_key,
      instance_name: cfg.evolution_instance_name,
    });
  }
  return null;
}

// ----------------------------------------------------------------
// Human typing simulation (anti-bloqueio determinístico)
// ----------------------------------------------------------------
export function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return h;
}

export function entryDelayMs(patientId: string, dateKey: string): number {
  return 3000 + (Math.abs(hashCode(patientId + dateKey)) % 9000);
}

export function typingDelayMs(message: string): number {
  return Math.max(2000, Math.min(8000, message.length * 35));
}

export function postSendDelayMs(patientId: string, dateKey: string): number {
  return 5000 + (Math.abs(hashCode(patientId + dateKey) + 1) % 25000);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
