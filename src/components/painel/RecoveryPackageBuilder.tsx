import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

// A browser ZIP keeps its input and output in memory. Larger exports need an offline archiver.
const MAX_BROWSER_BYTES = 300 * 1024 * 1024;

const sha256 = async (file: File) => {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
};

export function RecoveryPackageBuilder() {
  const storageFolderInput = useRef<HTMLInputElement>(null);
  const [database, setDatabase] = useState<File | null>(null);
  const [storage, setStorage] = useState<File[]>([]);
  const [source, setSource] = useState<File | null>(null);
  const [storageConfirmed, setStorageConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    storageFolderInput.current?.setAttribute("webkitdirectory", "");
    storageFolderInput.current?.setAttribute("directory", "");
  }, []);

  const createPackage = async () => {
    if (!database || !source || !storage.length || !storageConfirmed) return;
    setBusy(true);
    try {
      const magic = new TextDecoder().decode(await database.slice(0, 5).arrayBuffer());
      if (magic !== "PGDMP") throw new Error("Selecione o arquivo .backup nativo do Lovable, extraído do ZIP de download.");
      if (!source.name.toLowerCase().endsWith(".zip")) throw new Error("Selecione um ZIP com o código-fonte do repositório.");

      const selected = [database, source, ...storage];
      if (selected.reduce((size, file) => size + file.size, 0) > MAX_BROWSER_BYTES) {
        throw new Error("Arquivos acima de 300 MB devem ser empacotados em um computador, sem passar pelo navegador.");
      }

      const zip = new JSZip();
      const entries = [];
      const paths = new Set<string>();
      for (const [index, file] of selected.entries()) {
        const folder = index === 0 ? "database" : index === 1 ? "source" : "storage";
        const relative = index < 2 ? file.name : file.webkitRelativePath || file.name;
        const parts = relative.split("/").filter(Boolean);
        if (parts.some(part => part === ".." || part === ".")) throw new Error("Caminho de arquivo inválido.");
        if (index >= 2 && parts.length < 3) throw new Error("Selecione uma pasta que contenha uma subpasta para cada bucket do Storage.");
        const path = `${folder}/${parts.join("/")}`;
        if (paths.has(path)) throw new Error(`Arquivo repetido no pacote: ${path}`);
        paths.add(path);
        const hash = await sha256(file);
        zip.file(path, file, { compression: "STORE" });
        entries.push({ path, size: file.size, sha256: hash });
      }

      zip.file("manifest.json", JSON.stringify({
        format: "sms-saude-recovery-package-v1",
        created_at: new Date().toISOString(),
        status: "arquivos selecionados; restauracao ainda nao testada",
        storage_files_selected: storage.length,
        entries,
      }, null, 2));
      zip.file("LEIA_ANTES_DE_RESTAURAR.txt", [
        "Banco: arquivo PostgreSQL nativo. Teste o pg_restore em ambiente isolado antes de migrar.",
        "Lovable Cloud: restaure backups diarios pelo painel More > Database > Manage > Backups.",
        "Storage: confira se todos os buckets e arquivos foram selecionados; este pacote nao consegue verificar a completude do Storage.",
        "O pacote nao inclui secrets, chaves, configuracoes de provedores de login nem sessoes ativas.",
        "O ZIP nao e criptografado. Guarde-o em armazenamento criptografado fora do projeto.",
        "Confira os hashes SHA-256 no manifest.json e valide uma restauracao antes de considera-lo recuperavel.",
      ].join("\n"));

      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sms-saude-recuperacao-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success("Pacote montado. Confira os arquivos e teste a restauração antes de considerá-lo validado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível montar o pacote.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h4 className="font-semibold">Montar pacote de recuperação no seu computador</h4>
      <p className="text-sm text-muted-foreground">Os arquivos selecionados são processados neste navegador e não são enviados ao sistema. O pacote só fica completo depois de conferir todos os arquivos do Storage e testar a restauração.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="recovery-database">Exportação nativa do banco (.backup)</Label><Input id="recovery-database" type="file" accept=".backup" onChange={event => setDatabase(event.target.files?.[0] ?? null)} /></div>
        <div className="space-y-2"><Label htmlFor="recovery-source">Código do repositório (.zip)</Label><Input id="recovery-source" type="file" accept=".zip" onChange={event => setSource(event.target.files?.[0] ?? null)} /></div>
        <div className="space-y-2 md:col-span-2"><Label htmlFor="recovery-storage">Pasta com os arquivos do Storage</Label><Input ref={storageFolderInput} id="recovery-storage" type="file" multiple onChange={event => setStorage(Array.from(event.target.files ?? []))} /><p className="text-xs text-muted-foreground">{storage.length} arquivo(s) selecionado(s). Organize a pasta com uma subpasta por bucket antes de selecioná-la; confira a lista e os caminhos no manifesto gerado. Seu navegador precisa permitir a seleção de pastas.</p></div>
      </div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={storageConfirmed} onChange={event => setStorageConfirmed(event.target.checked)} /> Conferi que a pasta selecionada contém os arquivos de todos os buckets usados pelo projeto.</label>
      <Button onClick={createPackage} disabled={busy || !database || !source || !storage.length || !storageConfirmed}>{busy ? "Verificando arquivos..." : "Baixar pacote ZIP com manifesto"}</Button>
      <p className="text-xs text-muted-foreground">Limite de 300 MB para evitar travamentos no navegador. O ZIP não é criptografado e não restaura automaticamente no Lovable.</p>
    </div>
  );
}
