import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { verifyRecoveryPackage, type RecoveryVerification } from "@/lib/verifyRecoveryPackage";
import { MAX_RECOVERY_BYTES, MAX_RECOVERY_ENTRIES, MAX_INVENTORY_BYTES, safeRecoveryPath, parseStorageInventory, compareStorageInventory } from "@/lib/recoverySafety";

// A browser ZIP keeps its input and output in memory. Larger exports need an offline archiver.
const MAX_BROWSER_BYTES = MAX_RECOVERY_BYTES;

const sha256 = async (file: File) => {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
};

export function RecoveryPackageBuilder({ mode = "both" }: { mode?: "build" | "verify" | "both" }) {
  const storageFolderInput = useRef<HTMLInputElement>(null);
  const [database, setDatabase] = useState<File | null>(null);
  const [storage, setStorage] = useState<File[]>([]);
  const [source, setSource] = useState<File | null>(null);
  const [storageConfirmed, setStorageConfirmed] = useState(false);
  const [inventory,setInventory]=useState<File|null>(null);
  const [progress,setProgress]=useState("");
  const running=useRef(false);
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return ()=>{alive.current=false;};},[]);
  const [busy, setBusy] = useState(false);
  const [packageFile, setPackageFile] = useState<File | null>(null);
  const [verification, setVerification] = useState<RecoveryVerification | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    storageFolderInput.current?.setAttribute("webkitdirectory", "");
    storageFolderInput.current?.setAttribute("directory", "");
  }, []);

  const createPackage = async () => {
    if (running.current || !database || !source || !storageConfirmed || (!storage.length&&!inventory)) return;
    running.current=true;setBusy(true);setProgress("Conferindo arquivos selecionados…");
    try {
      const magic = new TextDecoder().decode(await database.slice(0, 5).arrayBuffer());
      if (magic !== "PGDMP") throw new Error("Selecione o arquivo .backup nativo do Lovable, extraído do ZIP de download.");
      if (!source.name.toLowerCase().endsWith(".zip")) throw new Error("Selecione um ZIP com o código-fonte do repositório.");

      if(!database.name.toLowerCase().endsWith(".backup")||database.size<5)throw Error("Arquivo de banco inválido.");
      const signature=new Uint8Array(await source.slice(0,4).arrayBuffer());
      if(signature[0]!==0x50||signature[1]!==0x4b||!((signature[2]===3&&signature[3]===4)||(signature[2]===5&&signature[3]===6)))throw Error("Código-fonte sem assinatura ZIP válida.");
      const selected = [database, source, ...storage];
      if(selected.length>MAX_RECOVERY_ENTRIES-3)throw Error("Quantidade de arquivos excede o limite local.");
      const storageEntries=storage.map(file=>{
        const relative=file.webkitRelativePath;
        if(!relative||!safeRecoveryPath(relative)||relative.split("/").length<3)throw Error("Selecione a pasta raiz com uma subpasta por bucket.");
        return {path:relative.split("/").slice(1).join("/"),size:file.size};
      });
      if(new Set(storageEntries.map(row=>row.path)).size!==storageEntries.length)throw Error("Caminhos de Storage repetidos.");
      let inventoryRaw:string|null=null;
      if(inventory){
        if(inventory.size>MAX_INVENTORY_BYTES)throw Error("Inventário excede 2 MB.");
        inventoryRaw=await inventory.text();
        const comparison=compareStorageInventory(storageEntries,parseStorageInventory(inventoryRaw));
        if(!comparison.matched)throw Error("Inventário divergente: "+comparison.missing+" ausente(s), "+comparison.extra+" extra(s), "+comparison.different+" com tamanho diferente.");
      }
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
        if (!safeRecoveryPath(relative)) throw new Error("Caminho de arquivo inválido.");
        if (index >= 2 && parts.length < 3) throw new Error("Selecione uma pasta que contenha uma subpasta para cada bucket do Storage.");
        const path = `${folder}/${parts.join("/")}`;
        if (paths.has(path)) throw new Error(`Arquivo repetido no pacote: ${path}`);
        paths.add(path);
        if(!alive.current)throw Error("Operação encerrada.");
        setProgress("Conferindo "+(index+1)+" de "+selected.length+" arquivos…");
        const hash = await sha256(file);
        zip.file(path, file, { compression: "STORE" });
        entries.push({ path, size: file.size, sha256: hash });
      }

      if(inventoryRaw!==null){const file=new File([inventoryRaw],"storage.json",{type:"application/json"});zip.file("inventory/storage.json",file,{compression:"STORE"});entries.push({path:"inventory/storage.json",size:file.size,sha256:await sha256(file)});}
      zip.file("manifest.json", JSON.stringify({
        format: "sms-saude-recovery-package-v2",
        inventory_reference: inventoryRaw!==null,
        created_at: new Date().toISOString(),
        status: "arquivos selecionados; restauracao ainda nao testada",
        storage_files_selected: storage.length,
        entries,
      }, null, 2));
      zip.file("LEIA_ANTES_DE_RESTAURAR.txt", [
        "Banco: arquivo PostgreSQL nativo. Teste o pg_restore em ambiente isolado antes de migrar.",
        "Lovable Cloud: restaure backups diarios pelo painel More > Database > Manage > Backups.",
        "Storage: confira se todos os buckets e arquivos foram selecionados; este pacote nao consegue verificar a completude do Storage.",
        "Nao presuma cobertura de secrets, chaves, provedores de login ou sessoes; reconfigure e valide separadamente. O banco nativo pode conter contas e hashes de senha.",
        "O ZIP nao e criptografado. Guarde-o em armazenamento criptografado fora do projeto.",
        "Confira os hashes SHA-256 no manifest.json e valide uma restauracao antes de considera-lo recuperavel.",
      ].join("\n"));

      setProgress("Montando e verificando o ZIP final…");
      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      if(!alive.current)return;
      const verified=await verifyRecoveryPackage(new File([blob],"recovery.zip"));
      if(!verified.valid)throw Error("O pacote gerado não passou na verificação local.");
      if(!alive.current)return;
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
      if(alive.current)toast.error(error instanceof Error ? error.message : "Não foi possível montar o pacote.");
    } finally {
      running.current=false;if(alive.current){setBusy(false);setProgress("");}
    }
  };

  const checkPackage = async () => {
    if (!packageFile||running.current) return;
    running.current=true;setVerifying(true);
    setVerification(null);
    try {
      const result=await verifyRecoveryPackage(packageFile);if(alive.current)setVerification(result);
    } catch (error) {
      if(alive.current)setVerification({ valid: false, checkedFiles: 0, storageFiles: 0, buckets: 0, problems: [error instanceof Error ? error.message : "Não foi possível ler o pacote."] });
    } finally {
      running.current=false;if(alive.current)setVerifying(false);
    }
  };

  return (
    <div className="clinical-premium space-y-3 p-3 sm:p-4 min-w-0">
      {mode !== "verify" && <>
      <h4 className="font-display font-semibold">Montar pacote de recuperação no seu computador</h4>
      <p className="text-sm text-muted-foreground">Os arquivos selecionados são processados neste navegador e não são enviados ao sistema. A conferência local valida o conteúdo selecionado; a cobertura e a recuperação exigem validação independente.</p>
      <div className="grid gap-2.5 md:grid-cols-2">
        <div className="clinical-inset rounded-lg border p-3 space-y-2 min-w-0"><Label htmlFor="recovery-database">Exportação nativa do banco (.backup)</Label><Input id="recovery-database" type="file" disabled={busy||verifying} accept=".backup" onChange={event => setDatabase(event.target.files?.[0] ?? null)} /></div>
        <div className="clinical-inset rounded-lg border p-3 space-y-2 min-w-0"><Label htmlFor="recovery-source">Código do repositório (.zip)</Label><Input id="recovery-source" type="file" disabled={busy||verifying} accept=".zip" onChange={event => setSource(event.target.files?.[0] ?? null)} /></div>
        <div className="clinical-inset rounded-lg border p-3 space-y-2 md:col-span-2 min-w-0"><Label htmlFor="recovery-storage">Pasta com os arquivos do Storage</Label><Input ref={storageFolderInput} id="recovery-storage" type="file" multiple disabled={busy||verifying} onChange={event => {setStorage(Array.from(event.target.files ?? []));setStorageConfirmed(false);}} /><p className="text-xs text-muted-foreground">{storage.length} arquivo(s) selecionado(s). Organize a pasta com uma subpasta por bucket antes de selecioná-la; confira a lista e os caminhos no manifesto gerado. Seu navegador precisa permitir a seleção de pastas.</p></div>
      </div>
      <div className="clinical-inset rounded-lg border p-3 space-y-2"><Label htmlFor="recovery-inventory">Inventário independente do Storage (opcional)</Label><Input id="recovery-inventory" type="file" accept=".json" disabled={busy||verifying} onChange={event=>{setInventory(event.target.files?.[0]??null);setStorageConfirmed(false);}}/><p className="text-xs text-muted-foreground">JSON: formato sms-storage-inventory-v1, lista files com path (bucket/caminho) e size em bytes. Compare com inventário obtido separadamente pelo TI. Sem inventário, a cobertura permanece não confirmada.</p><Button variant="outline" size="sm" type="button" onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({format:"sms-storage-inventory-v1",files:[]},null,2)],{type:"application/json"}));const link=document.createElement("a");link.href=url;link.download="modelo-inventario-storage.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>Baixar modelo vazio</Button></div>
      <label className="clinical-inset rounded-lg border p-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" disabled={busy||verifying} checked={storageConfirmed} onChange={event => setStorageConfirmed(event.target.checked)} /> Conferi que a pasta selecionada contém os arquivos de todos os buckets usados pelo projeto.</label>
      <Button onClick={createPackage} disabled={busy || verifying || !database || !source || (!storage.length&&!inventory) || !storageConfirmed}>{busy ? "Verificando arquivos..." : "Baixar pacote ZIP com manifesto"}</Button>
      {busy&&<p role="status" className="text-xs text-muted-foreground">{progress}</p>}
      <p className="text-xs text-muted-foreground">Limite de 300 MB para evitar travamentos no navegador. O ZIP não é criptografado e não restaura automaticamente no Lovable.</p>
      </>}
      {mode !== "build" && <div className="space-y-3">
        <h4 className="font-display font-semibold">Verificar um pacote de recuperação</h4>
        <p className="text-sm text-muted-foreground">Selecione o ZIP montado acima. A conferência é local e compara os arquivos com os hashes do manifesto. Ela não acessa o banco nem prova que todos os arquivos do Storage foram incluídos.</p>
        <Label htmlFor="recovery-verify-file">Pacote ZIP para conferência</Label>
        <Input id="recovery-verify-file" type="file" disabled={busy||verifying} accept=".zip" onChange={event => { setPackageFile(event.target.files?.[0] ?? null); setVerification(null); }} />
        <Button variant="outline" onClick={checkPackage} disabled={!packageFile || verifying || busy}>{verifying ? "Conferindo integridade..." : "Verificar pacote"}</Button>
        {verification && (
          <div role="status" aria-live="polite" className={`rounded-md border p-3 text-sm ${verification.valid ? "border-green-300 bg-green-50 text-green-950 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200" : "border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"}`}>
            <strong>{verification.valid ? "Pacote íntegro — restauração ainda não testada" : "Pacote incompleto ou inválido"}</strong>
            <p>{verification.checkedFiles} arquivo(s) conferido(s), {verification.storageFiles} arquivo(s) do Storage em {verification.buckets} bucket(s) declarados.</p>
            <p>{verification.inventoryMatched===true?"Caminhos e tamanhos coincidem com o inventário fornecido.":verification.inventoryMatched===false?"Inventário divergente.":"Cobertura do Storage não confirmada por inventário independente."} O inventário não prova a origem dos arquivos nem restauração.</p>
            {verification.problems.length > 0 && <ul className="mt-2 list-disc pl-5">{verification.problems.map((problem, index) => <li key={`${index}-${problem}`}>{problem}</li>)}</ul>}
          </div>
        )}
        <p className="text-xs text-muted-foreground">A correspondência com os dados reais e a recuperação de contas só podem ser confirmadas por uma restauração em ambiente isolado. Segredos e provedores de login não estão no pacote.</p>
      </div>
      }
    </div>
  );
}
