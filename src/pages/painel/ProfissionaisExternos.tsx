import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
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

  // Default periodo_fim to end of month
  useEffect(() => {
    if (!quotaForm.periodo_fim && quotaForm.periodo_inicio) {
      const d = new Date(quotaForm.periodo_inicio);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      setQuotaForm(p => ({ ...p, periodo_fim: lastDay.toISOString().slice(0, 10) }));
    }
  }, [quotaForm.periodo_inicio, quotaForm.periodo_fim]);

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

  // Quota management
  const openQuotaDialog = (externoId: string) => {
    setSelectedExternoId(externoId);
    setQuotaForm({
      profissional_interno_id: "",
      unidade_id: "",
      vagas_total: 5,
      periodo_inicio: new Date().toISOString().slice(0, 10),
      periodo_fim: "",
    });
    setQuotaDialogOpen(true);
  };

  const handleSaveQuota = async () => {
    if (!quotaForm.profissional_interno_id || !quotaForm.vagas_total) {
      toast.error("Selecione o profissional e defina as vagas.");
      return;
    }
    try {
      const { error } = await supabase.from("quotas_externas").insert({
        profissional_externo_id: selectedExternoId,
        profissional_interno_id: quotaForm.profissional_interno_id,
        unidade_id: quotaForm.unidade_id,
        vagas_total: quotaForm.vagas_total,
        vagas_usadas: 0,
        periodo_inicio: quotaForm.periodo_inicio,
        periodo_fim: quotaForm.periodo_fim,
      });
      if (error) throw error;
      toast.success("Quota adicionada!");
      setQuotaDialogOpen(false);
      await loadExternos();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar quota.");
    }
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
                                  ({q.periodo_inicio} → {q.periodo_fim})
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={restantes > 0 ? "default" : "destructive"}>
                                  {restantes}/{q.vagas_total}
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

      {/* Add Quota Dialog */}
      <Dialog open={quotaDialogOpen} onOpenChange={setQuotaDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Adicionar Quota</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Profissional Interno *</Label>
              <Select value={quotaForm.profissional_interno_id} onValueChange={v => setQuotaForm(p => ({ ...p, profissional_interno_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o profissional" /></SelectTrigger>
                <SelectContent>
                  {profissionaisInternos.map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>{f.nome} — {f.profissao || f.cargo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unidade</Label>
              <Select value={quotaForm.unidade_id} onValueChange={v => setQuotaForm(p => ({ ...p, unidade_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{unidadesVisiveis.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vagas (total)</Label>
              <Input type="number" min={1} value={quotaForm.vagas_total} onChange={e => setQuotaForm(p => ({ ...p, vagas_total: Number(e.target.value) }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Início</Label><Input type="date" value={quotaForm.periodo_inicio} onChange={e => setQuotaForm(p => ({ ...p, periodo_inicio: e.target.value }))} /></div>
              <div><Label>Fim</Label><Input type="date" value={quotaForm.periodo_fim} onChange={e => setQuotaForm(p => ({ ...p, periodo_fim: e.target.value }))} /></div>
            </div>
            <Button onClick={handleSaveQuota} className="w-full gradient-primary text-primary-foreground">Adicionar Quota</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProfissionaisExternos;
