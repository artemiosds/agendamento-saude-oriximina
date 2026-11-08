import {
  mapBackofficeModules,
  verifyBackofficeLicenseStatus,
  type BackofficeLicenseEnvelope,
} from "./backoffice-license.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message + ": expected " + JSON.stringify(expected) + ", received " + JSON.stringify(actual));
  }
}

function toBase64(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

const stable = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  return "{" + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, child]) => JSON.stringify(key) + ":" + stable(child)).join(",") + "}";
};

async function createFixture() {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const publicKey = await crypto.subtle.exportKey("raw", pair.publicKey);
  const keyId = "oriximina-test-key";
  const payload = {
    format_version: "painel-master.license/1",
    license_id: "00000000-0000-4000-8000-000000000001",
    license_code: "LIC-0123456789ABCDEF0123456789ABCDEF",
    status: "ativa",
    signature_algorithm: "Ed25519",
    issued_at: "2026-11-08T12:00:00.000Z",
    valid_from: "2026-11-08",
    valid_until: "2027-11-08",
    contract_version: 1,
    client_id: "00000000-0000-4000-8000-000000000002",
    contract_id: "00000000-0000-4000-8000-000000000003",
    installation_id: "00000000-0000-4000-8000-000000000004",
    environment: "producao",
    domain: "saude.oriximina.pa.gov.br",
    modules: ["faturamento_sus", "reabilitacao", "triagem", "regulacao"],
  };
  const signature = await crypto.subtle.sign(
    { name: "Ed25519" },
    pair.privateKey,
    new TextEncoder().encode(stable(payload)),
  );
  const response: BackofficeLicenseEnvelope = {
    status_active: true,
    license_code: payload.license_code,
    valid_from: payload.valid_from,
    valid_until: payload.valid_until,
    modules: payload.modules,
    payload,
    signature: toBase64(signature),
    signature_algorithm: "Ed25519",
    key_id: keyId,
  };
  return { keyId, publicKey: toBase64(publicKey), response, payload };
}

Deno.test("maps only the four legacy controlled module groups", () => {
  assertEqual(mapBackofficeModules(["agenda", "triagem", "relatorios"]), {
    faturamento_sus: false,
    reabilitacao: false,
    triagem: true,
    regulacao: false,
  }, "legacy group mapping mismatch");
});

Deno.test("accepts a valid active Ed25519 license", async () => {
  const fixture = await createFixture();
  const result = await verifyBackofficeLicenseStatus(
    fixture.response,
    { [fixture.keyId]: fixture.publicKey },
    "2026-11-08",
  );
  assert(result.status === "valid", "expected valid license, got " + (result.reason ?? result.status));
  assertEqual(result.modules, {
    faturamento_sus: true,
    reabilitacao: true,
    triagem: true,
    regulacao: true,
  }, "active license modules mismatch");
});

Deno.test("rejects tampered signed payload and unknown trusted key", async () => {
  const fixture = await createFixture();
  const tampered = {
    ...fixture.response,
    payload: { ...fixture.payload, modules: ["agenda"] },
  };
  const badSignature = await verifyBackofficeLicenseStatus(
    tampered,
    { [fixture.keyId]: fixture.publicKey },
    "2026-11-08",
  );
  assert(badSignature.status === "invalid", "tampered payload must be rejected");
  const unknownKey = await verifyBackofficeLicenseStatus(
    fixture.response,
    {},
    "2026-11-08",
  );
  assert(unknownKey.status === "invalid" && unknownKey.reason === "chave_nao_confiavel", "unknown key must be rejected");
});

Deno.test("rejects expired and suspended licenses", async () => {
  const fixture = await createFixture();
  const expired = await verifyBackofficeLicenseStatus(
    fixture.response,
    { [fixture.keyId]: fixture.publicKey },
    "2027-11-09",
  );
  assert(expired.status === "invalid" && expired.reason === "vigencia_invalida", "expired license must be rejected");
  const suspended = await verifyBackofficeLicenseStatus(
    { ...fixture.response, status_active: false, reason: "suspensa" },
    { [fixture.keyId]: fixture.publicKey },
    "2026-11-08",
  );
  assert(suspended.status === "inactive", "suspended license must be rejected");
  assert(Object.values(suspended.modules).every((enabled) => !enabled), "suspended license must deny every module");
});
