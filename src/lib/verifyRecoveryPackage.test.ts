import { webcrypto } from "node:crypto";
import JSZip from "jszip";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { verifyRecoveryPackage } from "./verifyRecoveryPackage";

beforeAll(() => vi.stubGlobal("crypto", webcrypto));

const digest = async (bytes: Uint8Array) => Array.from(new Uint8Array(await webcrypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer)), byte => byte.toString(16).padStart(2, "0")).join("");

async function makePackage(options: { tamper?: boolean; omit?: boolean; extra?: boolean } = {}) {
  const zip = new JSZip();
  const files = [
    { path: "database/data.backup", bytes: new TextEncoder().encode("PGDMPdatabase") },
    { path: "source/code.zip", bytes: new Uint8Array([0x50, 0x4b, 3, 4]) },
    { path: "storage/root/bucket/document.pdf", bytes: new TextEncoder().encode("documento") },
  ];
  const entries = await Promise.all(files.map(async ({ path, bytes }) => ({ path, size: bytes.length, sha256: await digest(bytes) })));
  for (const { path, bytes } of files) {
    if (options.omit && path.startsWith("storage/")) continue;
    zip.file(path, options.tamper && path.startsWith("storage/") ? "alterado" : Array.from(bytes, byte => String.fromCharCode(byte)).join(""));
  }
  if (options.extra) zip.file("storage/extra.txt", "desconhecido");
  zip.file("manifest.json", JSON.stringify({ format: "sms-saude-recovery-package-v1", entries, storage_files_selected: 1 }));
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return { size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } as File;
}

describe("verificação local do pacote de recuperação", () => {
  it("confere arquivos e hashes sem afirmar restauração", async () => {
    expect(await verifyRecoveryPackage(await makePackage())).toMatchObject({ valid: true, checkedFiles: 3, storageFiles: 1, buckets: 1 });
  });

  it("rejeita arquivo alterado, ausente e não declarado", async () => {
    for (const variant of [{ tamper: true }, { omit: true }, { extra: true }]) {
      expect((await verifyRecoveryPackage(await makePackage(variant))).valid).toBe(false);
    }
  });
});
