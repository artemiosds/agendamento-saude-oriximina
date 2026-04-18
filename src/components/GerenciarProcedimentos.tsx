import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, Stethoscope, Users, ChevronDown, Tag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useData } from "@/contexts/DataContext";
import { SIGTAP_ESPECIALIDADE_TO_PROFISSAO, procedureService } from "@/services/procedureService";

interface SigtapProc {
  codigo: string;
  nome: string;
  especialidade: string;
  total_cids: number;
}

const ESPECIALIDADE_LABELS: Record<string, { label: string; color: string }> = {
  fisioterapia: { label: "Fisioterapia", color: "bg-emerald-500" },
  psicologia: { label: "Psicologia", color: "bg-purple-500" },
  enfermagem: { label: "Enfermagem", color: "bg-sky-500" },
  nutricao: { label: "Nutrição", color: "bg-orange-500" },
  terapia_ocupacional: { label: "Terapia Ocupacional", color: "bg-pink-500" },
  fonoaudiologia: { label: "Fonoaudiologia", color: "bg-amber-500" },
  assistencia_social: { label: "Assistência Social", color: "bg-cyan-500" },
  medico: { label: "Médico", color: "bg-red-500" },
  odontologia: { label: "Odontologia", color: "bg-indigo-500" },
};

const GerenciarProcedimentos: React.FC = () => {
  const { funcionarios } = useData();
  const [procs, setProcs] = useState<SigtapProc[]>([]);
  const [links, setLinks] = useState<Map<string, Set<string>>>(new Map());
  const [cidsByProc, setCidsByProc] = useState<Record<string, { codigo: string; descricao: string }[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterEsp, setFilterEsp] = useState<string>("all");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  // Modal
  const [manageProc, setManageProc] = useState<SigtapProc | null>(null);
  const [selectedProfs, setSelectedProfs] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [procsRes, vincRes] = await Promise.all([
      (supabase as any)
        .from("sigtap_procedimentos")
        .select("codigo, nome, especialidade, total_cids")
        .eq("ativo", true)
        .order("especialidade")
        .order("nome"),
      (supabase as any).from("procedimento_profissionais").select("procedimento_codigo, profissional_id"),
    ]);

    setProcs(procsRes.data || []);
    const map = new Map<string, Set<string>>();
    (vincRes.data || []).forEach((v: any) => {
      if (!map.has(v.procedimento_codigo)) map.set(v.procedimento_codigo, new Set());
      map.get(v.procedimento_codigo)!.add(v.profissional_id);
    });
    setLinks(map);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const profissionaisAtivos = useMemo(
    () => funcionarios.filter((f) => f.role === "profissional" && f.ativo === true),
    [funcionarios],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return procs.filter((p) => {
      if (filterEsp !== "all" && p.especialidade !== filterEsp) return false;
      if (!s) return true;
      return p.nome.toLowerCase().includes(s) || p.codigo.toLowerCase().includes(s);
    });
  }, [procs, search, filterEsp]);

  const grouped = useMemo(() => {
    const g: Record<string, SigtapProc[]> = {};
    filtered.forEach((p) => {
      const key = p.especialidade || "outros";
      if (!g[key]) g[key] = [];
      g[key].push(p);
    });
    return g;
  }, [filtered]);

  const toggleGroup = (k: string) => setOpenGroups((p) => ({ ...p, [k]: !p[k] }));

  const openManage = async (p: SigtapProc) => {
    setManageProc(p);
    setSelectedProfs(new Set(links.get(p.codigo) || []));
    if (!cidsByProc[p.codigo]) {
      const cids = await procedureService.getCidsForProcedure(p.codigo);
      setCidsByProc((prev) => ({ ...prev, [p.codigo]: cids }));
    }
  };

  const profissionaisDaEspecialidade = useMemo(() => {
    if (!manageProc) return [];
    const validNames = SIGTAP_ESPECIALIDADE_TO_PROFISSAO[manageProc.especialidade] || [];
    if (validNames.length === 0) return profissionaisAtivos;
    return profissionaisAtivos.filter((f) =>
      validNames.some((vn) => (f.profissao || "").toLowerCase() === vn.toLowerCase()),
    );
  }, [manageProc, profissionaisAtivos]);

  const toggleProf = (id: string) => {
    setSelectedProfs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveLinks = async () => {
    if (!manageProc) return;
    setSaving(true);
    try {
      const current = links.get(manageProc.codigo) || new Set();
      const toAdd = [...selectedProfs].filter((id) => !current.has(id));
      const toRemove = [...current].filter((id) => !selectedProfs.has(id));

      if (toRemove.length > 0) {
        await (supabase as any)
          .from("procedimento_profissionais")
          .delete()
          .eq("procedimento_codigo", manageProc.codigo)
          .in("profissional_id", toRemove);
      }
      if (toAdd.length > 0) {
        await (supabase as any).from("procedimento_profissionais").insert(
          toAdd.map((profissional_id) => ({
            procedimento_codigo: manageProc.codigo,
            profissional_id,
          })),
        );
      }

      const newMap = new Map(links);
      newMap.set(manageProc.codigo, new Set(selectedProfs));
      setLinks(newMap);
      procedureService.invalidateCache();
      toast.success("Vínculos atualizados.");
      setManageProc(null);
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e.message || ""));
    } finally {
      setSaving(false);
    }
  };

  const especialidadesPresentes = useMemo(() => {
    const set = new Set(procs.map((p) => p.especialidade));
    return [...set].filter(Boolean);
  }, [procs]);

  return (
    <Card className="shadow-card border-0">
      <CardContent className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Stethoscope className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold font-display text-foreground">Procedimentos Clínicos</h3>
            <p className="text-sm text-muted-foreground">
              Gerencie os procedimentos importados do SIGTAP e vincule profissionais
            </p>
          </div>
          <Badge variant="outline">{procs.length} procedimentos</Badge>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou código SIGTAP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterEsp} onValueChange={setFilterEsp}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Filtrar especialidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as especialidades</SelectItem>
              {especialidadesPresentes.map((e) => (
                <SelectItem key={e} value={e}>
                  {ESPECIALIDADE_LABELS[e]?.label || e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="py-8 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Carregando procedimentos SIGTAP...
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">Nenhum procedimento encontrado.</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(grouped).map(([esp, items]) => {
              const meta = ESPECIALIDADE_LABELS[esp] || { label: esp, color: "bg-gray-500" };
              const isOpen = openGroups[esp] ?? false;
              return (
                <Collapsible key={esp} open={isOpen} onOpenChange={() => toggleGroup(esp)}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/40 transition">
                      <span className={`w-3 h-3 rounded-full ${meta.color}`} />
                      <span className="font-semibold text-sm flex-1 text-left">{meta.label}</span>
                      <Badge variant="secondary">{items.length} procedimentos</Badge>
                      <ChevronDown
                        className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2 space-y-2">
                    {items.map((p) => {
                      const linked = links.get(p.codigo)?.size || 0;
                      return (
                        <div
                          key={p.codigo}
                          className="p-3 rounded-lg border bg-muted/30 flex flex-col sm:flex-row sm:items-center gap-3"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{p.nome}</div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {p.codigo}
                              </Badge>
                              <Badge variant="secondary" className="text-[10px] gap-1">
                                <Tag className="w-3 h-3" /> {p.total_cids} CIDs
                              </Badge>
                              <Badge variant="outline" className="text-[10px] gap-1">
                                <Users className="w-3 h-3" /> {linked} prof.
                              </Badge>
                            </div>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => openManage(p)}>
                            Gerenciar
                          </Button>
                        </div>
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}

        <Dialog open={!!manageProc} onOpenChange={(o) => !o && setManageProc(null)}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Vincular Profissionais</DialogTitle>
            </DialogHeader>
            {manageProc && (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-muted/40 border">
                  <div className="font-medium text-sm">{manageProc.nome}</div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {manageProc.codigo}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {ESPECIALIDADE_LABELS[manageProc.especialidade]?.label || manageProc.especialidade}
                    </Badge>
                  </div>
                  {(cidsByProc[manageProc.codigo]?.length || 0) > 0 && (
                    <div className="mt-2">
                      <Label className="text-xs text-muted-foreground">CIDs vinculados (amostra):</Label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {cidsByProc[manageProc.codigo].slice(0, 8).map((c) => (
                          <Badge key={c.codigo} variant="outline" className="text-[10px]">
                            {c.codigo}
                          </Badge>
                        ))}
                        {(cidsByProc[manageProc.codigo].length || 0) > 8 && (
                          <Badge variant="outline" className="text-[10px]">
                            +{cidsByProc[manageProc.codigo].length - 8}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <Label className="text-sm">
                    Profissionais disponíveis ({profissionaisDaEspecialidade.length})
                  </Label>
                  <div className="border rounded-md mt-2 max-h-72 overflow-y-auto">
                    {profissionaisDaEspecialidade.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground text-center">
                        Nenhum profissional cadastrado para esta especialidade.
                      </p>
                    ) : (
                      profissionaisDaEspecialidade.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-3 p-3 hover:bg-accent/40 cursor-pointer border-b last:border-b-0"
                          onClick={() => toggleProf(p.id)}
                        >
                          <Checkbox
                            checked={selectedProfs.has(p.id)}
                            onCheckedChange={() => toggleProf(p.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{p.nome}</div>
                            <div className="text-xs text-muted-foreground">
                              {p.profissao}
                              {p.numero_conselho ? ` • ${p.tipo_conselho || ""} ${p.numero_conselho}` : ""}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Sem nenhum vínculo, o procedimento fica disponível para todos os profissionais da área.
                  </p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setManageProc(null)}>
                Cancelar
              </Button>
              <Button onClick={saveLinks} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar Vínculos
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default GerenciarProcedimentos;
