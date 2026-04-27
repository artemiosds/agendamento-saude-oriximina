import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, Stethoscope, Users, ChevronDown, Tag, Loader2, Plus, Pencil, Trash2, X, Globe, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  SIGTAP_ESPECIALIDADE_TO_PROFISSAO,
  ESPECIALIDADES_DISPONIVEIS,
  procedureService,
} from "@/services/procedureService";

interface SigtapProc {
  codigo: string;
  nome: string;
  descricao?: string;
  especialidade: string;
  total_cids: number;
  origem: "SIGTAP" | "PERSONALIZADO";
  valor?: number | null;
  ativo: boolean;
}

const ESPECIALIDADE_META: Record<string, { label: string; color: string }> = {
  enfermagem: { label: "Enfermagem", color: "bg-sky-500" },
  medicina: { label: "Medicina", color: "bg-red-500" },
  medico: { label: "Medicina", color: "bg-red-500" },
  odontologia: { label: "Odontologia", color: "bg-orange-500" },
  fisioterapia: { label: "Fisioterapia", color: "bg-emerald-500" },
  nutricao: { label: "Nutrição", color: "bg-amber-500" },
  psicologia: { label: "Psicologia", color: "bg-purple-500" },
  terapia_ocupacional: { label: "Terapia Ocupacional", color: "bg-pink-500" },
  fonoaudiologia: { label: "Fonoaudiologia", color: "bg-cyan-500" },
  servico_social: { label: "Serviço Social", color: "bg-indigo-500" },
  assistencia_social: { label: "Serviço Social", color: "bg-indigo-500" },
  farmacia: { label: "Farmácia", color: "bg-teal-500" },
  biomedicina: { label: "Biomedicina", color: "bg-violet-500" },
  educacao_fisica: { label: "Educação Física", color: "bg-yellow-500" },
  podologia: { label: "Podologia", color: "bg-fuchsia-500" },
  optometria: { label: "Optometria", color: "bg-blue-400" },
  saude_coletiva: { label: "Saúde Coletiva", color: "bg-slate-500" },
  outros: { label: "Outros", color: "bg-gray-400" },
};

interface CustomForm {
  codigo: string;
  nome: string;
  descricao: string;
  especialidade: string;
  valor: string;
  cids: { codigo: string; descricao: string }[];
  cidInput: string;
}

const emptyForm: CustomForm = {
  codigo: "",
  nome: "",
  descricao: "",
  especialidade: "",
  valor: "",
  cids: [],
  cidInput: "",
};

const GerenciarProcedimentos: React.FC = () => {
  const { funcionarios } = useData();
  const { user } = useAuth();
  const isMaster = user?.role === "master";

  const [procs, setProcs] = useState<SigtapProc[]>([]);
  const [links, setLinks] = useState<Map<string, Set<string>>>(new Map());
  const [cidsByProc, setCidsByProc] = useState<Record<string, { codigo: string; descricao: string }[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterEsp, setFilterEsp] = useState<string>("all");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  // Modal de vínculos
  const [manageProc, setManageProc] = useState<SigtapProc | null>(null);
  const [selectedProfs, setSelectedProfs] = useState<Set<string>>(new Set());
  const [savingLinks, setSavingLinks] = useState(false);

  // Modal de cadastro/edição
  const [customOpen, setCustomOpen] = useState(false);
  const [editingCodigo, setEditingCodigo] = useState<string | null>(null);
  const [form, setForm] = useState<CustomForm>(emptyForm);
  const [savingCustom, setSavingCustom] = useState(false);

  // SIGTAP global config: disponibilizar todos os procedimentos para todos os profissionais
  const userUnidadeId = user?.unidadeId || "";
  const isGlobalAdmin = user?.usuario === 'admin.sms' || (user?.role === 'master' && !user?.unidadeId);
  const [sigtapDisponibilizarTodos, setSigtapDisponibilizarTodos] = useState<boolean>(false);
  const [savingSigtapCfg, setSavingSigtapCfg] = useState(false);
  // Escopo do toggle: global (admin global) ou da unidade do master atual
  const sigtapScope: 'global' | 'unidade' = isGlobalAdmin ? 'global' : 'unidade';

  const loadSigtapConfig = async () => {
    try {
      const { data } = await supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
      const cfg = ((data?.configuracoes as any) || {}) as Record<string, any>;
      const sig = (cfg.config_sigtap || {}) as Record<string, any>;
      const porUnidade = (sig.por_unidade || {}) as Record<string, { disponibilizarTodos?: boolean }>;
      if (sigtapScope === 'unidade' && userUnidadeId && porUnidade[userUnidadeId] && typeof porUnidade[userUnidadeId].disponibilizarTodos === 'boolean') {
        setSigtapDisponibilizarTodos(!!porUnidade[userUnidadeId].disponibilizarTodos);
      } else {
        setSigtapDisponibilizarTodos(!!sig.disponibilizarTodos);
      }
    } catch (e) {
      console.error('Erro ao carregar config SIGTAP', e);
    }
  };

  const toggleSigtapDisponibilizarTodos = async (next: boolean) => {
    if (!isMaster) {
      toast.error('Apenas o perfil Master pode alterar esta configuração');
      return;
    }
    setSavingSigtapCfg(true);
    const previous = sigtapDisponibilizarTodos;
    setSigtapDisponibilizarTodos(next); // otimista
    try {
      const { data } = await supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
      const cfg = ((data?.configuracoes as any) || {}) as Record<string, any>;
      const sig = { ...(cfg.config_sigtap || {}) } as Record<string, any>;
      if (sigtapScope === 'unidade' && userUnidadeId) {
        const porUnidade = { ...(sig.por_unidade || {}) } as Record<string, { disponibilizarTodos?: boolean }>;
        porUnidade[userUnidadeId] = { ...(porUnidade[userUnidadeId] || {}), disponibilizarTodos: next };
        sig.por_unidade = porUnidade;
      } else {
        sig.disponibilizarTodos = next;
      }
      const newCfg = { ...cfg, config_sigtap: sig };
      const { error } = await supabase.from('system_config').upsert({ id: 'default', configuracoes: newCfg as any, updated_at: new Date().toISOString() });
      if (error) throw error;
      toast.success(next ? 'Modo geral ativado: procedimentos liberados para todos.' : 'Modo por especialidade ativado.');
    } catch (e) {
      console.error(e);
      setSigtapDisponibilizarTodos(previous);
      toast.error('Erro ao salvar configuração. Tente novamente.');
    } finally {
      setSavingSigtapCfg(false);
    }
  };

  useEffect(() => { loadSigtapConfig(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userUnidadeId, sigtapScope]);

  const load = async () => {
    setLoading(true);
    const [procsRes, vincRes] = await Promise.all([
      (supabase as any)
        .from("sigtap_procedimentos")
        .select("codigo, nome, descricao, especialidade, total_cids, origem, valor, ativo")
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
    setSavingLinks(true);
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
      setSavingLinks(false);
    }
  };

  const especialidadesPresentes = useMemo(() => {
    const set = new Set(procs.map((p) => p.especialidade));
    return [...set].filter(Boolean);
  }, [procs]);

  // ===== Custom CRUD =====
  const openCreate = () => {
    setEditingCodigo(null);
    setForm(emptyForm);
    setCustomOpen(true);
  };

  const openEdit = (p: SigtapProc) => {
    setEditingCodigo(p.codigo);
    setForm({
      codigo: p.codigo,
      nome: p.nome,
      descricao: p.descricao || "",
      especialidade: p.especialidade,
      valor: p.valor != null ? String(p.valor) : "",
      cids: cidsByProc[p.codigo] || [],
      cidInput: "",
    });
    if (!cidsByProc[p.codigo]) {
      procedureService.getCidsForProcedure(p.codigo).then((cids) => {
        setCidsByProc((prev) => ({ ...prev, [p.codigo]: cids }));
        setForm((f) => ({ ...f, cids }));
      });
    }
    setCustomOpen(true);
  };

  const addCidToForm = () => {
    const code = form.cidInput.trim().toUpperCase();
    if (!code) return;
    if (form.cids.some((c) => c.codigo === code)) return;
    setForm((f) => ({ ...f, cids: [...f.cids, { codigo: code, descricao: "" }], cidInput: "" }));
  };

  const removeCidFromForm = (code: string) => {
    setForm((f) => ({ ...f, cids: f.cids.filter((c) => c.codigo !== code) }));
  };

  const saveCustom = async () => {
    if (form.nome.trim().length < 3) return toast.error("Nome deve ter ao menos 3 caracteres.");
    if (!form.especialidade) return toast.error("Selecione a especialidade.");
    setSavingCustom(true);
    try {
      const valorNum = form.valor ? parseFloat(form.valor.replace(",", ".")) : null;
      if (editingCodigo) {
        await procedureService.updateCustom(editingCodigo, {
          nome: form.nome.trim(),
          descricao: form.descricao,
          especialidade: form.especialidade,
          valor: valorNum,
        });
        // Sincronizar CIDs (replace)
        await (supabase as any).from("sigtap_procedimento_cids").delete().eq("procedimento_codigo", editingCodigo);
        if (form.cids.length > 0) {
          await (supabase as any).from("sigtap_procedimento_cids").insert(
            form.cids.map((c) => ({
              procedimento_codigo: editingCodigo,
              cid_codigo: c.codigo,
              cid_descricao: c.descricao || "",
            })),
          );
        }
        await (supabase as any)
          .from("sigtap_procedimentos")
          .update({ total_cids: form.cids.length })
          .eq("codigo", editingCodigo);
        toast.success("Procedimento atualizado.");
      } else {
        await procedureService.createCustom({
          codigo: form.codigo.trim() || undefined,
          nome: form.nome.trim(),
          descricao: form.descricao,
          especialidade: form.especialidade,
          valor: valorNum,
          cids: form.cids,
          criadoPor: user?.id || "",
        });
        toast.success("Procedimento criado.");
      }
      setCustomOpen(false);
      await load();
    } catch (e: any) {
      toast.error("Erro: " + (e.message || ""));
    } finally {
      setSavingCustom(false);
    }
  };

  const handleDelete = async (p: SigtapProc) => {
    if (!confirm(`Excluir o procedimento "${p.nome}"?`)) return;
    try {
      await procedureService.deleteCustom(p.codigo);
      toast.success("Procedimento excluído.");
      await load();
    } catch (e: any) {
      toast.error("Erro: " + (e.message || ""));
    }
  };

  return (
    <Card className="shadow-card border-0">
      <CardContent className="p-5">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Stethoscope className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <h3 className="font-semibold font-display text-foreground">Procedimentos Clínicos</h3>
            <p className="text-sm text-muted-foreground">
              Gerencie os procedimentos importados do SIGTAP e personalizados
            </p>
          </div>
          <Badge variant="outline">{procs.length} procedimentos</Badge>
          {isMaster && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1" /> Novo Procedimento
            </Button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou código..."
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
                  {ESPECIALIDADE_META[e]?.label || e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="py-8 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Carregando procedimentos...
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">Nenhum procedimento encontrado.</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(grouped).map(([esp, items]) => {
              const meta = ESPECIALIDADE_META[esp] || { label: esp, color: "bg-gray-500" };
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
                      const isCustom = p.origem === "PERSONALIZADO";
                      return (
                        <div
                          key={p.codigo}
                          className="p-3 rounded-lg border bg-muted/30 flex flex-col sm:flex-row sm:items-center gap-3"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant={isCustom ? "default" : "secondary"}
                                className="text-[10px]"
                              >
                                {isCustom ? "✏️ PERSONALIZADO" : "🏷️ SIGTAP"}
                              </Badge>
                              <span className="font-medium text-sm">{p.nome}</span>
                            </div>
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
                              {p.valor != null && (
                                <Badge variant="outline" className="text-[10px]">
                                  R$ {Number(p.valor).toFixed(2)}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {isCustom && isMaster && (
                              <>
                                <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => handleDelete(p)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
                            <Button size="sm" variant="outline" onClick={() => openManage(p)}>
                              Gerenciar
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}

        {/* Modal de vínculos */}
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
                      {ESPECIALIDADE_META[manageProc.especialidade]?.label || manageProc.especialidade}
                    </Badge>
                  </div>
                  {(cidsByProc[manageProc.codigo]?.length || 0) > 0 && (
                    <div className="mt-2">
                      <Label className="text-xs text-muted-foreground">CIDs vinculados:</Label>
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
                              {(p as any).numeroConselho
                                ? ` • ${(p as any).tipoConselho || ""} ${(p as any).numeroConselho}`
                                : ""}
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
              <Button onClick={saveLinks} disabled={savingLinks}>
                {savingLinks && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar Vínculos
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal de cadastro/edição custom */}
        <Dialog open={customOpen} onOpenChange={setCustomOpen}>
          <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingCodigo ? "Editar Procedimento" : "Novo Procedimento Personalizado"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-sm">
                  Código {!editingCodigo && <span className="text-muted-foreground text-xs">(opcional)</span>}
                </Label>
                <Input
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                  placeholder="Ex: CUSTOM-FISIO-001 (gerado automaticamente se vazio)"
                  disabled={!!editingCodigo}
                />
              </div>
              <div>
                <Label className="text-sm">Nome *</Label>
                <Input
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Nome do procedimento"
                />
              </div>
              <div>
                <Label className="text-sm">Descrição</Label>
                <Textarea
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Especialidade *</Label>
                  <Select
                    value={form.especialidade}
                    onValueChange={(v) => setForm({ ...form, especialidade: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {ESPECIALIDADES_DISPONIVEIS.map((e) => (
                        <SelectItem key={e.key} value={e.key}>
                          {e.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Valor (R$)</Label>
                  <Input
                    value={form.valor}
                    onChange={(e) => setForm({ ...form, valor: e.target.value })}
                    placeholder="0,00"
                    inputMode="decimal"
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm">CIDs vinculados</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={form.cidInput}
                    onChange={(e) => setForm({ ...form, cidInput: e.target.value })}
                    placeholder="Ex: M54.5"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCidToForm();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={addCidToForm}>
                    Adicionar
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {form.cids.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhum CID adicionado</p>
                  ) : (
                    form.cids.map((c) => (
                      <Badge key={c.codigo} variant="secondary" className="text-[10px] gap-1">
                        {c.codigo}
                        <button onClick={() => removeCidFromForm(c.codigo)}>
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCustomOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={saveCustom} disabled={savingCustom}>
                {savingCustom && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default GerenciarProcedimentos;
