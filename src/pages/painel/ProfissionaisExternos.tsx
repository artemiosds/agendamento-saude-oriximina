import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, Loader2, Eye, EyeOff, UserPlus, Ticket, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUnidadeFilter } from "@/hooks/useUnidadeFilter";

interface ExternalProf {
  id: string;
  auth_user_id: string | null;
  nome: string;
  email: string;
  unidade_id: string;
  ativo: boolean;
  criado_em: string;
}

interface QuotaRow {
  id: string;
  profissional_externo_id: string;
  profissional_interno_id: string;
  unidade_id: string;
  vagas_total: number;
  vagas_usadas: number;
  periodo_inicio: string;
  periodo_fim: string;
}

const ProfissionaisExternos: React.FC = () => {
  const { user } = useAuth();
  const { unidades, funcionarios } = useData();
  const { unidadesVisiveis } = useUnidadeFilter();
  const { can } = usePermissions();
  const canManage = can("usuarios", "can_edit");

  const [externos, setExternos] = useState<ExternalProf[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [showSenha, setShowSenha] = useState(false);
  const [form, setForm] = useState({ nome: "", email: "", senha: "", unidade_id: "" });

  // Quotas
  const [quotas, setQuotas] = useState<QuotaRow[]>([]);
  const [quotaDialogOpen, setQuotaDialogOpen] = useState(false);
  const [selectedExternoId, setSelectedExternoId] = useState<string>("");
  const [selectedProfIds, setSelectedProfIds] = useState<string[]>([]);
  const [vagasPorProf, setVagasPorProf] = useState<Record<string, number>>({});
  const [savingQuota, setSavingQuota] = useState(false);

  const loadExternos = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("manage-external", { body: { action: "list" } });
      setExternos(data?.profissionais || []);
      const { data: quotasData } = await supabase.from("quotas_externas").select("*");
      setQuotas(quotasData || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadExternos(); }, [loadExternos]);

  const openNew = () => {
    setEditId(null);
    setForm({ nome: "", email: "", senha: "", unidade_id: "" });
    setDialogOpen(true);
  };

  const openEdit = (e: ExternalProf) => {
    setEditId(e.id);
    setForm({ nome: e.nome, email: e.email, senha: "", unidade_id: e.unidade_id });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome || !form.email) { toast.error("Nome e e-mail são obrigatórios."); return; }
    setSaving(true);
    try {
      if (editId) {
        const body: any = { action: "update", id: editId, nome: form.nome, email: form.email, unidade_id: form.unidade_id };
        if (form.senha) body.senha = form.senha;
        const { data, error } = await supabase.functions.invoke("manage-external", { body });
        if (error || data?.error) { toast.error(data?.error || "Erro."); setSaving(false); return; }
        toast.success("Profissional externo atualizado!");
      } else {
        if (!form.senha) { toast.error("Senha obrigatória para novo cadastro."); setSaving(false); return; }
        const { data, error } = await supabase.functions.invoke("manage-external", {
          body: { action: "create", nome: form.nome, email: form.email, senha: form.senha, unidade_id: form.unidade_id, criado_por: user?.id || "" },
        });
        if (error || data?.error) { toast.error(data?.error || "Erro."); setSaving(false); return; }
        toast.success("Profissional externo cadastrado!");
      }
      setDialogOpen(false);
      await loadExternos();
    } catch { toast.error("Erro ao salvar."); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-external", { body: { action: "delete", id } });
      if (error || data?.error) { toast.error("Erro ao excluir."); return; }
      toast.success("Excluído!");
      await loadExternos();
    } catch { toast.error("Erro."); }
  };

  const handleToggleActive = async (ext: ExternalProf) => {
    const { data, error } = await supabase.functions.invoke("manage-external", {
      body: { action: "update", id: ext.id, ativo: !ext.ativo },
    });
    if (!error && !data?.error) {
      toast.success(ext.ativo ? "Desativado" : "Ativado");
      await loadExternos();
    }
  };

  // Quota management – multi-select
  const openQuotaDialog = (externoId: string) => {
    setSelectedExternoId(externoId);
    // Pre-select already configured professionals
    const existing = quotas.filter(q => q.profissional_externo_id === externoId);
    const existingIds = existing.map(q => q.profissional_interno_id);
    // Only show unconfigured professionals as candidates
    setSelectedProfIds([]);
    setVagasPorProf({});
    setQuotaDialogOpen(true);
  };

  const toggleProfSelection = (profId: string) => {
    setSelectedProfIds(prev => {
      if (prev.includes(profId)) {
        const next = prev.filter(id => id !== profId);
        setVagasPorProf(v => { const copy = { ...v }; delete copy[profId]; return copy; });
        return next;
      }
      setVagasPorProf(v => ({ ...v, [profId]: 5 }));
      return [...prev, profId];
    });
  };

  const handleSaveQuotas = async () => {
    if (selectedProfIds.length === 0) {
      toast.error("Selecione ao menos um profissional.");
      return;
    }
    setSavingQuota(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const endOfYear = `${new Date().getFullYear()}-12-31`;

      const inserts = selectedProfIds.map(profId => ({
        profissional_externo_id: selectedExternoId,
        profissional_interno_id: profId,
        unidade_id: "",
        vagas_total: vagasPorProf[profId] || 5,
        vagas_usadas: 0,
        periodo_inicio: today,
        periodo_fim: endOfYear,
      }));

      const { error } = await supabase.from("quotas_externas").insert(inserts);
      if (error) throw error;
      toast.success(`${inserts.length} quota(s) adicionada(s)!`);
      setQuotaDialogOpen(false);
      await loadExternos();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar quotas.");
    }
    setSavingQuota(false);
  };

  const handleDeleteQuota = async (quotaId: string) => {
    await supabase.from("quotas_externas").delete().eq("id", quotaId);
    toast.success("Quota removida.");
    await loadExternos();
  };

  const profissionaisInternos = funcionarios.filter((f: any) => f.role === "profissional" && f.ativo);

  const filteredExternos = externos.filter(e => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return e.nome.toLowerCase().includes(term) || e.email.toLowerCase().includes(term);
  });

  // For quota dialog: filter out professionals that already have a quota for this external
  const availableForQuota = profissionaisInternos.filter((f: any) =>
    !quotas.some(q => q.profissional_externo_id === selectedExternoId && q.profissional_interno_id === f.id)
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Profissionais Externos</h1>
          <p className="text-muted-foreground text-sm">{filteredExternos.length} de {externos.length} cadastrados</p>
        </div>
        {canManage && (
          <Button onClick={openNew} className="gradient-primary text-primary-foreground">
            <UserPlus className="w-4 h-4 mr-2" /> Novo Externo
          </Button>
        )}
      </div>

      <div className="relative w-full sm:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, e-mail..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : filteredExternos.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{externos.length === 0 ? "Nenhum profissional externo cadastrado." : "Nenhum resultado encontrado."}</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filteredExternos.map(ext => {
            const unidade = unidades.find((u: any) => u.id === ext.unidade_id);
            const extQuotas = quotas.filter(q => q.profissional_externo_id === ext.id);
            return (
              <Card key={ext.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-foreground">{ext.nome}</p>
                        <Badge variant={ext.ativo ? "default" : "secondary"}>{ext.ativo ? "Ativo" : "Inativo"}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{ext.email}</p>
                      {unidade && <p className="text-xs text-muted-foreground">Unidade: {unidade.nome}</p>}
                    </div>
                    {canManage && (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openQuotaDialog(ext.id)} title="Gerenciar Quotas">
                          <Ticket className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(ext)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleToggleActive(ext)}>
                          {ext.ativo ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="w-4 h-4" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir {ext.nome}?</AlertDialogTitle>
                              <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(ext.id)}>Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>

                  {/* Quotas for this external */}
                  {extQuotas.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">QUOTAS</p>
                      <div className="space-y-1">
                        {extQuotas.map(q => {
                          const prof = profissionaisInternos.find((f: any) => f.id === q.profissional_interno_id);
                          const restantes = q.vagas_total - q.vagas_usadas;
                          return (
                            <div key={q.id} className="flex items-center justify-between p-2 rounded bg-accent/30 text-sm">
                              <div>
                                <span className="font-medium">{prof?.nome || "—"}</span>
                                <span className="text-muted-foreground ml-2">
                                  {(prof as any)?.profissao || ""}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={restantes > 0 ? "default" : "destructive"}>
                                  {restantes}/{q.vagas_total} vagas
                                </Badge>
                                {canManage && (
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDeleteQuota(q.id)}>
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit External Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? "Editar" : "Cadastrar"} Profissional Externo</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} /></div>
            <div><Label>E-mail *</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
            <div>
              <Label>{editId ? "Nova Senha (opcional)" : "Senha *"}</Label>
              <div className="relative">
                <Input type={showSenha ? "text" : "password"} value={form.senha} onChange={e => setForm(p => ({ ...p, senha: e.target.value }))} placeholder="Min. 6 caracteres" className="pr-10" />
                <button type="button" onClick={() => setShowSenha(!showSenha)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <Label>Unidade</Label>
              <Select value={form.unidade_id} onValueChange={v => setForm(p => ({ ...p, unidade_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{unidadesVisiveis.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full gradient-primary text-primary-foreground">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Quota Dialog – Multi-select */}
      <Dialog open={quotaDialogOpen} onOpenChange={setQuotaDialogOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Adicionar Quotas</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecione os profissionais internos e defina a quantidade de vagas para cada um.
            </p>

            {availableForQuota.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Todos os profissionais já possuem quota configurada para este externo.
              </p>
            ) : (
              <div className="space-y-2">
                {availableForQuota.map((f: any) => {
                  const isSelected = selectedProfIds.includes(f.id);
                  return (
                    <div key={f.id} className={`rounded-lg border p-3 transition-colors ${isSelected ? "border-primary bg-primary/5" : "border-border"}`}>
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleProfSelection(f.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-foreground">{f.nome}</p>
                          <p className="text-xs text-muted-foreground">{f.profissao || f.cargo || ""}</p>
                        </div>
                        {isSelected && (
                          <div className="flex items-center gap-2 shrink-0">
                            <Label className="text-xs whitespace-nowrap">Vagas:</Label>
                            <Input
                              type="number"
                              min={1}
                              value={vagasPorProf[f.id] || 5}
                              onChange={e => setVagasPorProf(v => ({ ...v, [f.id]: Math.max(1, Number(e.target.value)) }))}
                              className="w-16 h-8 text-center text-sm"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedProfIds.length > 0 && (
              <div className="bg-accent/30 rounded-lg p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-1">RESUMO</p>
                {selectedProfIds.map(id => {
                  const prof = profissionaisInternos.find((f: any) => f.id === id);
                  return (
                    <p key={id} className="text-sm">
                      {prof?.nome || "—"}: <strong>{vagasPorProf[id] || 5} vagas</strong>
                    </p>
                  );
                })}
              </div>
            )}

            <Button
              onClick={handleSaveQuotas}
              disabled={savingQuota || selectedProfIds.length === 0}
              className="w-full gradient-primary text-primary-foreground"
            >
              {savingQuota && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Adicionar {selectedProfIds.length > 0 ? `${selectedProfIds.length} Quota(s)` : "Quotas"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProfissionaisExternos;
