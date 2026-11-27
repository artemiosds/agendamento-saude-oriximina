import JSZip from "jszip";
import {MAX_RECOVERY_BYTES,MAX_RECOVERY_ENTRIES,MAX_INVENTORY_BYTES,safeRecoveryPath,inspectRecoveryZip,parseStorageInventory,compareStorageInventory,type InventoryEntry} from "./recoverySafety";

const MAX_PACKAGE_SIZE = MAX_RECOVERY_BYTES;
const HASH = /^[a-f0-9]{64}$/;

type Entry = { path: string; size: number; sha256: string };
type Manifest = { format: string; entries: Entry[]; storage_files_selected: number; inventory_reference?:boolean };

export type RecoveryVerification = {
  valid: boolean;
  checkedFiles: number;
  storageFiles: number;
  buckets: number;
  problems: string[];
  inventoryMatched?:boolean;
};

const hexDigest = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
};

// Stream inflation so forged central-directory sizes cannot trigger unbounded allocation.
async function boundedBytes(entry:JSZip.JSZipObject,limit:number):Promise<Uint8Array>{
 return new Promise((resolve,reject)=>{
  const chunks:Uint8Array[]=[];let total=0,failed=false;
  const stream=(entry as JSZip.JSZipObject & {internalStream(type:"uint8array"):JSZip.JSZipStreamHelper<Uint8Array>}).internalStream("uint8array");
  stream.on("data",chunk=>{
    if(failed)return;
    total+=chunk.byteLength;
    if(total>limit){failed=true;stream.pause();reject(Error("Conteúdo descompactado excede o limite declarado."));return;}
    chunks.push(chunk);
  }).on("error",error=>{if(!failed){failed=true;reject(error);}}).on("end",()=>{
    if(failed)return;
    const output=new Uint8Array(total);let offset=0;
    for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}
    resolve(output);
  });
  stream.resume();
 });
}
export async function verifyRecoveryPackage(file: File): Promise<RecoveryVerification> {
  if (file.size > MAX_PACKAGE_SIZE+8*1024*1024) throw new Error("Este navegador verifica conteúdo de até 300 MB. Use uma ferramenta local para arquivos maiores.");
  const buffer=await file.arrayBuffer();const archive=inspectRecoveryZip(buffer);
  const zip = await JSZip.loadAsync(buffer);
  if(Object.keys(zip.files).some(path=>!archive.has(path))||Object.keys(zip.files).length!==archive.size)throw Error("Caminhos do ZIP não correspondem ao diretório original.");
  const problems: string[] = [];
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) throw new Error("O pacote não contém manifest.json.");
  let manifest: Manifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(await boundedBytes(manifestFile,2*1024*1024))) as Manifest;
  } catch {
    throw new Error("O manifesto não é um JSON válido.");
  }
  if (!manifest||!["sms-saude-recovery-package-v1","sms-saude-recovery-package-v2"].includes(manifest.format) || !Array.isArray(manifest.entries)||manifest.entries.length>MAX_RECOVERY_ENTRIES) {
    throw new Error("Formato de manifesto não reconhecido.");
  }

  const expected = new Set<string>();
  const buckets = new Set<string>();
  let storageFiles = 0;
  let totalBytes = 0;
  let databases = 0;
  let sources = 0;
  let checkedFiles=0;
  const storagePaths=new Set<string>();
  let inventory:InventoryEntry[]|null=null;let inventoryMatched:boolean|undefined;
  const storageEntries:InventoryEntry[]=[];

  for (const entry of manifest.entries) {
    if (!entry || typeof entry.path !== "string" || !Number.isSafeInteger(entry.size) || entry.size < 0 || typeof entry.sha256!=="string" || !HASH.test(entry.sha256)) {
      problems.push("O manifesto contém um arquivo com caminho, tamanho ou hash inválido.");
      continue;
    }
    const parts = entry.path.split("/");
    if (!safeRecoveryPath(entry.path) || expected.has(entry.path)) {
      problems.push("O manifesto contém caminho repetido ou inválido.");
      continue;
    }
    expected.add(entry.path);
    if (entry.path.startsWith("database/") && parts.length === 2 && entry.path.toLowerCase().endsWith(".backup")) databases++;
    else if (entry.path.startsWith("source/") && parts.length === 2 && entry.path.toLowerCase().endsWith(".zip")) sources++;
    else if (entry.path.startsWith("storage/") && parts.length >= 4) {
      storageFiles++;
      buckets.add(parts[2]);
      const objectPath=parts.slice(2).join("/");if(storagePaths.has(objectPath))problems.push("Caminho de Storage repetido.");storagePaths.add(objectPath);
      storageEntries.push({path:objectPath,size:entry.size});
    } else if(!(manifest.format==="sms-saude-recovery-package-v2"&&entry.path==="inventory/storage.json"))problems.push(`Local não reconhecido: ${entry.path}`);

    const archived = zip.file(entry.path);
    if (!archived) { problems.push(`Arquivo ausente: ${entry.path}`); continue; }
    totalBytes += entry.size;
    if (totalBytes > MAX_PACKAGE_SIZE) throw new Error("O conteúdo declarado ultrapassa o limite seguro de 300 MB.");
    if(archive.get(entry.path)!==entry.size){problems.push(`Tamanho declarado divergente: ${entry.path}`);continue;}
    if(entry.path==="inventory/storage.json"&&entry.size>MAX_INVENTORY_BYTES)throw Error("Inventário excede limite.");
    const bytes = await boundedBytes(archived,entry.size);
    if(entry.path==="inventory/storage.json")inventory=parseStorageInventory(new TextDecoder().decode(bytes));
    if (bytes.byteLength !== entry.size) problems.push(`Tamanho diferente: ${entry.path}`);
    else if (await hexDigest(bytes) !== entry.sha256) problems.push(`Integridade diferente: ${entry.path}`);
    else checkedFiles++;
    if (entry.path.startsWith("database/") && new TextDecoder().decode(bytes.slice(0, 5)) !== "PGDMP") problems.push("O banco não tem formato PostgreSQL .backup.");
    if (entry.path.startsWith("source/") && (bytes[0] !== 0x50 || bytes[1] !== 0x4b)) problems.push("O código-fonte não tem a assinatura de um ZIP.");
  }

  if (databases !== 1) problems.push("O pacote precisa conter exatamente um .backup nativo.");
  if (sources !== 1) problems.push("O pacote precisa conter exatamente um ZIP do código-fonte.");
  if ((!storageFiles || !buckets.size)&&!(manifest.format==="sms-saude-recovery-package-v2"&&inventory?.length===0&&manifest.inventory_reference===true)) problems.push("Não há arquivos do Storage com caminhos de buckets.");
  if(manifest.format==="sms-saude-recovery-package-v2"){if(typeof manifest.inventory_reference!=="boolean"||manifest.inventory_reference!==(inventory!==null))problems.push("Referência de inventário inconsistente.");if(inventory!==null){inventoryMatched=compareStorageInventory(storageEntries,inventory).matched;if(!inventoryMatched)problems.push("Inventário de Storage divergente.");}}
  if (manifest.storage_files_selected !== storageFiles) problems.push("A contagem do Storage não confere com o manifesto.");
  for (const path of Object.keys(zip.files)) {
    if (!zip.files[path].dir && path !== "manifest.json" && path !== "LEIA_ANTES_DE_RESTAURAR.txt" && !expected.has(path)) {
      problems.push(`Arquivo não declarado no manifesto: ${path}`);
    }
  }
  return { valid: problems.length === 0, checkedFiles, storageFiles, buckets: buckets.size, problems, inventoryMatched };
}
