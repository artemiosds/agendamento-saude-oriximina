import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Loader2, Link as LinkIcon, Search, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface ProcInterno {
  id: string;
  nome: string;
  especialidade: string;
  codigo_sigtap: string;
  ativo: boolean;
}

interface SigtapOption {
  codigo: string;
  nome: string;
  especialidade: string;
}

/**
 * UI para o MASTER vincular cada procedimento interno (tabela `procedimentos`)
 * a um código SIGTAP oficial (tabela `sigtap_procedimentos`).
 * Esse vínculo é o que permite a geração do BPA-Produção a partir dos prontuários.
 */
const VincularSigtapProcedimentos: React.FC = () => {
  const { user } = useAuth();
  const isMaster = user?.role === "master";

  const [procs, setProcs] = useState<ProcInterno[]>([]);
  const [sigtap, setSigtap] = useState<SigtapOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [searchSigtap, setSearchSigtap] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [procsRes, sigtapRes] = await Promise.all([
        (supabase as any)
          .from("procedimentos")
          .select("id, nome, especialidade, codigo_sigtap, ativo")
          .eq("ativo", true)
          .order("especialidade")
          .order("nome"),
        (supabase as any)
          .from("sigtap_procedimentos")
          .select("codigo, nome, especialidade")
          .eq("ativo", true)
          .order("nome")
          .limit(5000),
      ]);
      setProcs(procsRes.data || []);
      setSigtap(sigtapRes.data || []);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar procedimentos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isMaster) load();
  }, [isMaster]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return procs;
    return procs.filter(
      (p) =>
        p.nome.toLowerCase().includes(s) ||
        p.especialidade.toLowerCase().includes(s) ||
        (p.codigo_sigtap || "").includes(s),
    );
  }, [procs, search]);

  const sigtapMatches = (procId: string) => {
    const q = (searchSigtap[procId] || "").trim().toLowerCase();
    if (!q) return [];
    return sigtap
      .filter((s) => s.codigo.includes(q) || s.nome.toLowerCase().includes(q))
      .slice(0, 8);
  };

  const handleSave = async (proc: ProcInterno) => {
    const novoCodigo = (editing[proc.id] ?? proc.codigo_sigtap ?? "").trim();
    if (novoCodigo && novoCodigo.length !== 10) {
      toast.error("Código SIGTAP deve ter 10 dígitos");
      return;
    }
    setSaving(proc.id);
    try {
      const { error } = await (supabase as any)
        .from("procedimentos")
        .update({ codigo_sigtap: novoCodigo })
        .eq("id", proc.id);
      if (error) throw error;
      setProcs((prev) =>
        prev.map((p) => (p.id === proc.id ? { ...p, codigo_sigtap: novoCodigo } : p)),
      );
      setEditing((prev) => {
        const next = { ...prev };
        delete next[proc.id];
        return next;
      });
      toast.success("Vínculo SIGTAP atualizado");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err?.message || "desconhecido"));
    } finally {
      setSaving(null);
    }
  };

  const aplicarCodigo = (proc: ProcInterno, codigo: string) => {
    setEditing((prev) => ({ ...prev, [proc.id]: codigo }));
    setSearchSigtap((prev) => ({ ...prev, [proc.id]: "" }));
  };

  if (!isMaster) return null;

  const totalVinculados = procs.filter((p) => (p.codigo_sigtap || "").length === 10).length;

  return (
    <Card className="shadow-card border-0">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <LinkIcon className="w-5 h-5 text-primary" />
          Vinculação SIGTAP × Procedimentos Clínicos
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Vincule cada procedimento clínico ao código SIGTAP oficial (10 dígitos). Esse vínculo é
          obrigatório para a geração do BPA-Produção (SIA/SUS).
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, especialidade ou código..."
              className="pl-9"
            />
          </div>
          <div className="flex gap-2 text-xs">
            <Badge variant="outline" className="bg-success/10 text-success border-success/20">
              Vinculados: {totalVinculados}
            </Badge>
            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
              Pendentes: {procs.length - totalVinculados}
            </Badge>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Nenhum procedimento encontrado.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((proc) => {
              const valorAtual = editing[proc.id] ?? proc.codigo_sigtap ?? "";
              const editado = editing[proc.id] !== undefined && editing[proc.id] !== proc.codigo_sigtap;
              const vinculado = (proc.codigo_sigtap || "").length === 10;
              const matches = sigtapMatches(proc.id);

              return (
                <div
                  key={proc.id}
                  className="border rounded-lg p-3 bg-card hover:bg-muted/30 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm text-foreground">{proc.nome}</p>
                        {vinculado ? (
                          <Badge className="bg-success/10 text-success border-0 text-[10px]">
                            <Check className="w-3 h-3 mr-1" /> SIGTAP {proc.codigo_sigtap}
                          </Badge>
                        ) : (
                          <Badge className="bg-destructive/10 text-destructive border-0 text-[10px]">
                            <X className="w-3 h-3 mr-1" /> Sem SIGTAP
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {proc.especialidade || "—"}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:w-80">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Label className="text-[10px] text-muted-foreground">Código SIGTAP (10 dígitos)</Label>
                          <Input
                            value={valorAtual}
                            onChange={(e) => {
                              const v = e.target.value.replace(/\D/g, "").slice(0, 10);
                              setEditing((prev) => ({ ...prev, [proc.id]: v }));
                            }}
                            maxLength={10}
                            placeholder="0000000000"
                            className="font-mono text-sm h-8"
                          />
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleSave(proc)}
                          disabled={!editado || saving === proc.id}
                          className="mt-4 h-8"
                        >
                          {saving === proc.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            "Salvar"
                          )}
                        </Button>
                      </div>
                      <div className="relative">
                        <Input
                          value={searchSigtap[proc.id] || ""}
                          onChange={(e) =>
                            setSearchSigtap((prev) => ({ ...prev, [proc.id]: e.target.value }))
                          }
                          placeholder="Buscar no catálogo SIGTAP..."
                          className="text-xs h-7"
                        />
                        {matches.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                            {matches.map((m) => (
                              <button
                                key={m.codigo}
                                type="button"
                                onClick={() => aplicarCodigo(proc, m.codigo)}
                                className="w-full text-left px-2 py-1.5 hover:bg-accent text-xs border-b last:border-0"
                              >
                                <span className="font-mono text-primary">{m.codigo}</span>{" "}
                                <span className="text-foreground">{m.nome}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default VincularSigtapProcedimentos;
