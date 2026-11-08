import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';

const originalCrypto = globalThis.crypto;
beforeAll(() => Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto }));
afterAll(() => Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto }));
import {
  mapBackofficeModules,
  verifyBackofficeLicenseStatus,
} from '../../supabase/functions/_shared/backoffice-license';

const b64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const stable = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, child]) => JSON.stringify(key) + ':' + stable(child)).join(',') + '}';
};

async function fixture() {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const publicKey = await crypto.subtle.exportKey('raw', pair.publicKey);
  const publicKeyB64 = b64(publicKey);
  const keyId = 'oriximina-test-key';
  const payload = {
    format_version: 'painel-master.license/1',
    license_id: '00000000-0000-4000-8000-000000000001',
    license_code: 'LIC-0123456789ABCDEF0123456789ABCDEF',
    status: 'ativa',
    signature_algorithm: 'Ed25519',
    issued_at: '2026-11-08T12:00:00.000Z',
    valid_from: '2026-11-08',
    valid_until: '2027-11-08',
    contract_version: 1,
    client_id: '00000000-0000-4000-8000-000000000002',
    contract_id: '00000000-0000-4000-8000-000000000003',
    installation_id: '00000000-0000-4000-8000-000000000004',
    environment: 'producao',
    domain: 'saude.oriximina.pa.gov.br',
    modules: ['faturamento_sus', 'reabilitacao', 'triagem', 'regulacao'],
  };
  const signature = await crypto.subtle.sign(
    { name: 'Ed25519' },
    pair.privateKey,
    new TextEncoder().encode(stable(payload)),
  );
  return {
    keyId,
    publicKeyB64,
    payload,
    response: {
      status_active: true,
      license_code: payload.license_code,
      valid_from: payload.valid_from,
      valid_until: payload.valid_until,
      modules: payload.modules,
      payload,
      signature: b64(signature),
      signature_algorithm: 'Ed25519',
      key_id: keyId,
    },
  };
}

describe('integração da licença assinada do Painel Master', () => {
  it('mapeia apenas os quatro grupos legados', () => {
    expect(mapBackofficeModules(['agenda', 'triagem', 'relatorios'])).toEqual({
      faturamento_sus: false,
      reabilitacao: false,
      triagem: true,
      regulacao: false,
    });
  });

  it('aceita licença ativa somente após verificar Ed25519 e vigência', async () => {
    const f = await fixture();
    const result = await verifyBackofficeLicenseStatus(f.response, { [f.keyId]: f.publicKeyB64 }, '2026-11-08');
    expect(result.status).toBe('valid');
    expect(result.modules).toEqual({
      faturamento_sus: true,
      reabilitacao: true,
      triagem: true,
      regulacao: true,
    });
  });

  it('nega assinatura adulterada', async () => {
    const f = await fixture();
    const altered = { ...f.response, payload: { ...f.payload, modules: ['agenda'] } };
    const result = await verifyBackofficeLicenseStatus(altered, { [f.keyId]: f.publicKeyB64 }, '2026-11-08');
    expect(result.status).toBe('invalid');
    expect(result.modules.faturamento_sus).toBe(false);
  });

  it('nega chave pública desconhecida', async () => {
    const f = await fixture();
    const result = await verifyBackofficeLicenseStatus(f.response, {}, '2026-11-08');
    expect(result.status).toBe('invalid');
    expect(result.reason).toBe('chave_nao_confiavel');
  });

  it('nega licença expirada ou suspensa', async () => {
    const f = await fixture();
    const expired = await verifyBackofficeLicenseStatus(f.response, { [f.keyId]: f.publicKeyB64 }, '2027-11-09');
    expect(expired.status).toBe('invalid');
    const suspended = await verifyBackofficeLicenseStatus({ ...f.response, status_active: false, reason: 'suspensa' }, { [f.keyId]: f.publicKeyB64 }, '2026-11-08');
    expect(suspended.status).toBe('inactive');
    expect(Object.values(suspended.modules).every(value => !value)).toBe(true);
  });

  it('rejeita escopo externo diferente do payload assinado', async () => {
    const f = await fixture();
    const result = await verifyBackofficeLicenseStatus({ ...f.response, modules: ['agenda'] }, { [f.keyId]: f.publicKeyB64 }, '2026-11-08');
    expect(result.status).toBe('invalid');
    expect(result.reason).toBe('escopo_incompativel');
  });
});
