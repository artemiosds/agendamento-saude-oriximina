import JSZip from "jszip";

const MAX_PACKAGE_SIZE = 300 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;

type Entry = { path: string; size: number; sha256: string };
type Manifest = { format: string; entries: Entry[]; storage_files_selected: number };

export type RecoveryVerification = {
  valid: boolean;
  checkedFiles: number;
  storageFiles: number;
  buckets: number;
  problems: string[];
};

const hexDigest = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
};

export async function verifyRecoveryPackage(file: File): Promise<RecoveryVerification> {
  if (file.size > MAX_PACKAGE_SIZE) throw new Error("Este navegador verifica pacotes de até 300 MB. Use uma ferramenta local para arquivos maiores.");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const problems: string[] = [];
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) throw new Error("O pacote não contém manifest.json.");
  let manifest: Manifest;
  try {
    manifest = JSON.parse(await manifestFile.async("string")) as Manifest;
  } catch {
    throw new Error("O manifesto não é um JSON válido.");
  }
  if (manifest.format !== "sms-saude-recovery-package-v1" || !Array.isArray(manifest.entries)) {
    throw new Error("Formato de manifesto não reconhecido.");
  }

  const expected = new Set<string>();
  const buckets = new Set<string>();
  let storageFiles = 0;
  let totalBytes = 0;
  let databases = 0;
  let sources = 0;

  for (const entry of manifest.entries) {
    if (!entry || typeof entry.path !== "string" || !Number.isSafeInteger(entry.size) || entry.size < 0 || !HASH.test(entry.sha256)) {
      problems.push("O manifesto contém um arquivo com caminho, tamanho ou hash inválido.");
      continue;
    }
    const parts = entry.path.split("/");
    if (parts.some(part => !part || part === "." || part === ".." || part.includes("\\")) || expected.has(entry.path)) {
      problems.push("O manifesto contém caminho repetido ou inválido.");
      continue;
    }
    expected.add(entry.path);
    if (entry.path.startsWith("database/") && parts.length === 2 && entry.path.endsWith(".backup")) databases++;
    else if (entry.path.startsWith("source/") && parts.length === 2 && entry.path.endsWith(".zip")) sources++;
    else if (entry.path.startsWith("storage/") && parts.length >= 4) {
      storageFiles++;
      buckets.add(parts[2]);
    } else problems.push(`Local não reconhecido: ${entry.path}`);

    const archived = zip.file(entry.path);
    if (!archived) { problems.push(`Arquivo ausente: ${entry.path}`); continue; }
    totalBytes += entry.size;
    if (totalBytes > MAX_PACKAGE_SIZE) throw new Error("O conteúdo declarado ultrapassa o limite seguro de 300 MB.");
    const bytes = await archived.async("uint8array");
    if (bytes.byteLength !== entry.size) problems.push(`Tamanho diferente: ${entry.path}`);
    else if (await hexDigest(bytes) !== entry.sha256) problems.push(`Integridade diferente: ${entry.path}`);
    if (entry.path.startsWith("database/") && new TextDecoder().decode(bytes.slice(0, 5)) !== "PGDMP") problems.push("O banco não tem formato PostgreSQL .backup.");
    if (entry.path.startsWith("source/") && (bytes[0] !== 0x50 || bytes[1] !== 0x4b)) problems.push("O código-fonte não tem a assinatura de um ZIP.");
  }

  if (databases !== 1) problems.push("O pacote precisa conter exatamente um .backup nativo.");
  if (sources !== 1) problems.push("O pacote precisa conter exatamente um ZIP do código-fonte.");
  if (!storageFiles || !buckets.size) problems.push("Não há arquivos do Storage com caminhos de buckets.");
  if (manifest.storage_files_selected !== storageFiles) problems.push("A contagem do Storage não confere com o manifesto.");
  for (const path of Object.keys(zip.files)) {
    if (!zip.files[path].dir && path !== "manifest.json" && path !== "LEIA_ANTES_DE_RESTAURAR.txt" && !expected.has(path)) {
      problems.push(`Arquivo não declarado no manifesto: ${path}`);
    }
  }
  return { valid: problems.length === 0, checkedFiles: expected.size, storageFiles, buckets: buckets.size, problems };
}
