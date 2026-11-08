export type ExpectedInstallation = {
  license_code: string;
  client_id: string;
  installation_id: string;
  environment: string;
  domain: string;
};

export type LegacyLicenseModule = 'faturamento_sus' | 'reabilitacao' | 'triagem' | 'regulacao';
export type LegacyLicenseState = Record<LegacyLicenseModule, boolean>;

export interface BackofficeLicenseEnvelope {
  status_active?: boolean;
  reason?: string;
  license_code?: string;
  valid_from?: string;
  valid_until?: string;
  modules?: unknown;
  payload?: unknown;
  signature?: string;
  signature_algorithm?: string;
  key_id?: string;
}

export type BackofficeLicenseCheck = {
  status: 'valid' | 'inactive' | 'invalid';
  reason?: string;
  validUntil: string;
  modules: LegacyLicenseState;
};

const DENIED: LegacyLicenseState = {
  faturamento_sus: false,
  reabilitacao: false,
  triagem: false,
  regulacao: false,
};

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function decodeBase64(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  try {
    return Uint8Array.from(atob(value), character => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function sameStringArray(left: string[], right: string[]) {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function canonicalLicenseJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(item => canonicalLicenseJson(item)).join(',') + ']';
  return '{' + Object.entries(value).filter(([, child]) => child !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, child]) => JSON.stringify(key) + ':' + canonicalLicenseJson(child)).join(',') + '}';
}

export function mapBackofficeModules(modules: string[]): LegacyLicenseState {
  const enabled = new Set(modules);
  return {
    faturamento_sus: enabled.has('faturamento_sus'),
    reabilitacao: enabled.has('reabilitacao'),
    triagem: enabled.has('triagem'),
    regulacao: enabled.has('regulacao'),
  };
}

export async function verifyBackofficeLicenseStatus(
  response: BackofficeLicenseEnvelope,
  trustedPublicKeys: Readonly<Record<string, string>>,
  today: string = new Date().toISOString().slice(0, 10),
  expected?: ExpectedInstallation,
): Promise<BackofficeLicenseCheck> {
  const validUntil = isIsoDate(response.valid_until) ? response.valid_until : today;
  if (response.status_active !== true) {
    return { status: 'inactive', reason: response.reason || 'licenca_inativa', validUntil, modules: DENIED };
  }

  if (!isIsoDate(today) || !isIsoDate(response.valid_from) || !isIsoDate(response.valid_until) ||
      response.valid_until < response.valid_from || today < response.valid_from || today > response.valid_until) {
    return { status: 'invalid', reason: 'vigencia_invalida', validUntil, modules: DENIED };
  }
  if (!response.payload || typeof response.payload !== 'object' || Array.isArray(response.payload)) {
    return { status: 'invalid', reason: 'payload_ausente', validUntil, modules: DENIED };
  }

  const payload = response.payload as Record<string, unknown>;
  if (response.signature_algorithm !== 'Ed25519' || payload.signature_algorithm !== 'Ed25519' ||
      payload.format_version !== 'painel-master.license/1' || payload.status !== 'ativa' ||
      payload.license_code !== response.license_code || payload.valid_from !== response.valid_from ||
      payload.valid_until !== response.valid_until) {
    return { status: 'invalid', reason: 'envelope_incompativel', validUntil, modules: DENIED };
  }

  if (expected && Object.entries(expected).some(([key, value]) => !value || payload[key] !== value)) {
    return { status: 'invalid', reason: 'instalacao_incompativel', validUntil, modules: DENIED };
  }

  const keyId = response.key_id;
  if (!keyId || !Object.prototype.hasOwnProperty.call(trustedPublicKeys, keyId)) {
    return { status: 'invalid', reason: 'chave_nao_confiavel', validUntil, modules: DENIED };
  }
  const publicBytes = decodeBase64(trustedPublicKeys[keyId] ?? '');
  const signatureBytes = decodeBase64(response.signature ?? '');
  if (!publicBytes || publicBytes.byteLength !== 32 || !signatureBytes || signatureBytes.byteLength !== 64) {
    return { status: 'invalid', reason: 'formato_criptografico_invalido', validUntil, modules: DENIED };
  }

  const payloadModules = Array.isArray(payload.modules) && payload.modules.every(value => typeof value === 'string')
    ? payload.modules as string[]
    : null;
  const envelopeModules = Array.isArray(response.modules) && response.modules.every(value => typeof value === 'string')
    ? response.modules as string[]
    : null;
  if (!payloadModules || !envelopeModules || !sameStringArray(payloadModules, envelopeModules)) {
    return { status: 'invalid', reason: 'escopo_incompativel', validUntil, modules: DENIED };
  }

  try {
    const publicKey = await crypto.subtle.importKey(
      'raw',
      publicBytes.buffer.slice(publicBytes.byteOffset, publicBytes.byteOffset + publicBytes.byteLength) as ArrayBuffer,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    const canonical = new TextEncoder().encode(canonicalLicenseJson(payload));
    const valid = await crypto.subtle.verify(
      { name: 'Ed25519' },
      publicKey,
      signatureBytes.buffer.slice(signatureBytes.byteOffset, signatureBytes.byteOffset + signatureBytes.byteLength) as ArrayBuffer,
      canonical.buffer.slice(canonical.byteOffset, canonical.byteOffset + canonical.byteLength) as ArrayBuffer,
    );
    if (!valid) return { status: 'invalid', reason: 'assinatura_invalida', validUntil, modules: DENIED };
    return { status: 'valid', validUntil, modules: mapBackofficeModules(payloadModules) };
  } catch {
    return { status: 'invalid', reason: 'chave_publica_invalida', validUntil, modules: DENIED };
  }
}
