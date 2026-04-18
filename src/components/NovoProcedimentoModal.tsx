import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { procedureService, ESPECIALIDADES_DISPONIVEIS, profissaoToEspecialidadeSigtap } from "@/services/procedureService";

interface CidItem { codigo: string; descricao: string; }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultProfissao?: string;
  criadoPor?: string;
  onCreated?: (codigo: string) => void;
}

export function NovoProcedimentoModal({ open, onOpenChange, defaultProfissao, criadoPor, onCreated }: Props) {
  const defaultEsp = profissaoToEspecialidadeSigtap(defaultProfissao || "") || "";
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [especialidade, setEspecialidade] = useState(defaultEsp);
  const [valor, setValor] = useState<string>("");
  const [cidCodigo, setCidCodigo] = useState("");
  const [cidDescricao, setCidDescricao] = useState("");
  const [cids, setCids] = useState<CidItem[]>([]);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setNome(""); setCodigo(""); setEspecialidade(defaultEsp); setValor("");
    setCidCodigo(""); setCidDescricao(""); setCids([]);
  };

  const addCid = () => {
    const c = cidCodigo.trim().toUpperCase();
    if (!c) return;
    if (cids.some((x) => x.codigo === c)) return;
    setCids([...cids, { codigo: c, descricao: cidDescricao.trim() }]);
    setCidCodigo(""); setCidDescricao("");
  };

  const removeCid = (codigo: string) => setCids(cids.filter((c) => c.codigo !== codigo));

  const handleSave = async () => {
    if (!nome.trim()) { toast.error("Informe o nome do procedimento"); return; }
    if (!especialidade) { toast.error("Selecione a especialidade"); return; }
    setSaving(true);
    try {
      const { codigo: novoCodigo } = await procedureService.createCustom({
        codigo: codigo.trim() || undefined,
        nome: nome.trim(),
        especialidade,
        valor: valor ? Number(valor.replace(",", ".")) : null,
        cids,
        criadoPor,
      });
      toast.success("Procedimento cadastrado");
      onCreated?.(novoCodigo);
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err?.message || "desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" /> Cadastrar Novo Procedimento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Código (opcional)</Label>
              <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ex.: 030101001" />
              <p className="text-xs text-muted-foreground mt-1">Gerado automaticamente se vazio.</p>
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
            </div>
          </div>

          <div>
            <Label>Nome do Procedimento *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Acompanhamento de gestante" />
          </div>

          <div>
            <Label>Especialidade *</Label>
            <Select value={especialidade} onValueChange={setEspecialidade}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {ESPECIALIDADES_DISPONIVEIS.map((e) => (
                  <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="border rounded-lg p-3 bg-muted/30">
            <Label className="mb-2 block">CIDs vinculados</Label>
            <div className="grid grid-cols-12 gap-2 mb-2">
              <Input className="col-span-3" placeholder="Código" value={cidCodigo} onChange={(e) => setCidCodigo(e.target.value)} />
              <Input className="col-span-7" placeholder="Descrição (opcional)" value={cidDescricao} onChange={(e) => setCidDescricao(e.target.value)} />
              <Button type="button" variant="outline" className="col-span-2" onClick={addCid}>Adicionar</Button>
            </div>
            {cids.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {cids.map((c) => (
                  <Badge key={c.codigo} variant="secondary" className="gap-1">
                    {c.codigo}{c.descricao ? ` - ${c.descricao}` : ''}
                    <button type="button" onClick={() => removeCid(c.codigo)} className="ml-1 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhum CID vinculado.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar e Usar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
