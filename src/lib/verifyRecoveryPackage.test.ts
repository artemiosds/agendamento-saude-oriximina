// @vitest-environment node
import { webcrypto } from "node:crypto";
import JSZip from "jszip";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { verifyRecoveryPackage } from "./verifyRecoveryPackage";
import { compareStorageInventory, parseStorageInventory, inspectRecoveryZip, MAX_RECOVERY_BYTES } from "./recoverySafety";

beforeAll(() => vi.stubGlobal("crypto", webcrypto));

const digest = async (bytes: Uint8Array) => Array.from(new Uint8Array(await webcrypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer)), byte => byte.toString(16).padStart(2, "0")).join("");

async function makePackage(options: { tamper?: boolean; omit?: boolean; extra?: boolean; inventory?: "match"|"mismatch"; compressed?:boolean } = {}) {
  const zip = new JSZip();
  const files = [
    { path: "database/data.backup", bytes: new TextEncoder().encode("PGDMPdatabase") },
    { path: "source/code.zip", bytes: new Uint8Array([0x50, 0x4b, 3, 4]) },
    { path: "storage/root/bucket/document.pdf", bytes: new TextEncoder().encode("documento") },
  ];
  if(options.inventory){files.push({path:"inventory/storage.json",bytes:new TextEncoder().encode(JSON.stringify({format:"sms-storage-inventory-v1",files:[{path:"bucket/document.pdf",size:options.inventory==="match"?9:999}]}))});}
  const entries = await Promise.all(files.map(async ({ path, bytes }) => ({ path, size: bytes.length, sha256: await digest(bytes) })));
  for (const { path, bytes } of files) {
    if (options.omit && path.startsWith("storage/")) continue;
    zip.file(path, options.tamper && path.startsWith("storage/") ? "alterado" : Array.from(bytes, byte => String.fromCharCode(byte)).join(""));
  }
  if (options.extra) zip.file("storage/extra.txt", "desconhecido");
  zip.file("manifest.json", JSON.stringify({ format: options.inventory?"sms-saude-recovery-package-v2":"sms-saude-recovery-package-v1", inventory_reference:!!options.inventory, entries, storage_files_selected: 1 }));
  const bytes = await zip.generateAsync({ type: "uint8array", compression:options.compressed?"DEFLATE":"STORE" });
  return { size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } as File;
}

describe("verificação local do pacote de recuperação", () => {
  it("confere arquivos e hashes sem afirmar restauração", async () => {
    expect(await verifyRecoveryPackage(await makePackage())).toMatchObject({ valid: true, checkedFiles: 3, storageFiles: 1, buckets: 1 });
  });

  it("confere inventário independente e mantém compatibilidade com arquivos comprimidos",async()=>{
    expect(await verifyRecoveryPackage(await makePackage({inventory:"match",compressed:true}))).toMatchObject({valid:true,inventoryMatched:true,checkedFiles:4});
    expect(await verifyRecoveryPackage(await makePackage({inventory:"mismatch"}))).toMatchObject({valid:false,inventoryMatched:false});
  });
  it("rejeita tamanho descompactado forjado antes de inflar",async()=>{
    const file=await makePackage();const buffer=await file.arrayBuffer();const view=new DataView(buffer);
    let end=buffer.byteLength-22;const offset=view.getUint32(end+16,true);view.setUint32(offset+24,MAX_RECOVERY_BYTES+1,true);
    expect(()=>inspectRecoveryZip(buffer)).toThrow();
  });
  it("rejeita caminhos inválidos, duplicatas e divergências de inventário",()=>{
    expect(()=>parseStorageInventory(JSON.stringify({format:"sms-storage-inventory-v1",files:[{path:"bucket/../file",size:1}]}))).toThrow();
    expect(()=>parseStorageInventory(JSON.stringify({format:"sms-storage-inventory-v1",files:[{path:"bucket/file",size:1},{path:"bucket/file",size:1}]}))).toThrow();
    expect(compareStorageInventory([{path:"bucket/a",size:2},{path:"bucket/b",size:1}],[{path:"bucket/a",size:1},{path:"bucket/c",size:1}])).toEqual({missing:1,extra:1,different:1,matched:false});
  });
  it("rejeita arquivo alterado, ausente e não declarado", async () => {
    for (const variant of [{ tamper: true }, { omit: true }, { extra: true }]) {
      expect((await verifyRecoveryPackage(await makePackage(variant))).valid).toBe(false);
    }
  });
});
