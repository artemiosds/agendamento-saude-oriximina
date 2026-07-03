import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOperacional } from '@/contexts/OperacionalContext';
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
import { Plus, Pencil, Trash2, Loader2, Eye, EyeOff, UserPlus, Ticket, Search, User, ClipboardList, Calendar, Building2, MoreVertical, CheckCircle, XCircle, History, List } from "lucide-react";
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
  telefone?: string;
  documento?: string;
  orgao_origem?: string;
  responsavel?: string;
  observacoes?: string;
  data_validade?: string;
  permissoes?: {
    pode_agendar: boolean;
    pode_visualizar: boolean;
    pode_cancelar: boolean;
    pode_editar_paciente: boolean;
    pode_cadastrar_paciente: boolean;
    pode_selecionar_paciente: boolean;
    pode_anexar_documento: boolean;
  };
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
  turno?: string;
  horario_inicio?: string;
  horario_fim?: string;
  especialidade?: string;
  dia_semana?: number;
  ativo: boolean;
  criado_em: string;
}

interface ExternalAppointment {
  id: string;
  data_agendamento: string;
  horario: string;
  paciente_nome: string;
  status: string;
  profissional_interno_nome: string;
}

const ProfissionaisExternos: React.FC = () => {
  const { user } = useAuth();
  const { unidades, funcionarios, disponibilidades } = useOperacional();
  const { unidadesVisiveis, profissionaisVisiveis } = useUnidadeFilter();
  const { can } = usePermissions();
  const canManage = can("usuarios", "can_edit");

  const [externos, setExternos] = useState<ExternalProf[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [showSenha, setShowSenha] = useState(false);
  const [form, setForm] = useState({ 
    nome: "", 
    email: "", 
    senha: "", 
    unidade_id: "",
    telefone: "",
    documento: "",
    orgao_origem: "",
    responsavel: "",
    observacoes: "",
    data_validade: "",
    permissoes: {
      pode_agendar: true,
      pode_visualizar: true,
      pode_cancelar: true,
      pode_editar_paciente: true,
      pode_cadastrar_paciente: true,
      pode_selecionar_paciente: true,
      pode_anexar_documento: true
    }
  });

  // Quotas
  const [quotas, setQuotas] = useState<QuotaRow[]>([]);
  const [quotaDialogOpen, setQuotaDialogOpen] = useState(false);
  const [quotaListDialogOpen, setQuotaListDialogOpen] = useState(false);
  const [quotaEditDialogOpen, setQuotaEditDialogOpen] = useState(false);
  const [agendaDialogOpen, setAgendaDialogOpen] = useState(false);
  const [selectedExternoId, setSelectedExternoId] = useState<string>("");
  const [selectedQuota, setSelectedQuota] = useState<QuotaRow | null>(null);
  const [quotaAppointments, setQuotaAppointments] = useState<ExternalAppointment[]>([]);
  const [loadingAgenda, setLoadingAgenda] = useState(false);
  const [selectedProfIds, setSelectedProfIds] = useState<string[]>([]);
  const [vagasPorProf, setVagasPorProf] = useState<Record<string, { 
    vagas: number; 
    turno: string; 
    horario_inicio: string; 
    horario_fim: string; 
  }>>({});
  const [savingQuota, setSavingQuota] = useState(false);
  const [quotaForm, setQuotaForm] = useState({
    vagas_total: 0,
    turno: "",
    horario_inicio: "",
    horario_fim: "",
    periodo_inicio: "",
    periodo_fim: "",
    ativo: true
  });

  const loadExternos = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("manage-external", { body: { action: "list" } });
      setExternos(data?.profissionais || []);
      const { data: quotasData } = await supabase.from("quotas_externas").select("*").order('criado_em', { ascending: false });
      setQuotas(quotasData || []);
      (window as any).__quotasExternasCached = quotasData || [];
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadExternos(); }, [loadExternos]);

  const openNew = () => {
    setEditId(null);
    setForm({ 
      nome: "", 
      email: "", 
      senha: "", 
      unidade_id: "",
      telefone: "",
      documento: "",
      orgao_origem: "",
      responsavel: "",
      observacoes: "",
      data_validade: "",
      permissoes: {
        pode_agendar: true,
        pode_visualizar: true,
        pode_cancelar: true,
        pode_editar_paciente: true,
        pode_cadastrar_paciente: true,
        pode_selecionar_paciente: true,
        pode_anexar_documento: true
      }
    });
    setDialogOpen(true);
  };

  const openEdit = (e: ExternalProf) => {
    setEditId(e.id);
    setForm({ 
      nome: e.nome, 
      email: e.email, 
      senha: "", 
      unidade_id: e.unidade_id,
      telefone: e.telefone || "",
      documento: e.documento || "",
      orgao_origem: e.orgao_origem || "",
      responsavel: e.responsavel || "",
      observacoes: e.observacoes || "",
      data_validade: e.data_validade || "",
      permissoes: e.permissoes || {
        pode_agendar: true,
        pode_visualizar: true,
        pode_cancelar: true,
        pode_editar_paciente: true,
        pode_cadastrar_paciente: true,
        pode_selecionar_paciente: true,
        pode_anexar_documento: true
      }
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome || !form.email) { toast.error("Nome e e-mail são obrigatórios."); return; }
    setSaving(true);
    try {
      if (editId) {
        const body: any = { 
          action: "update", 
          id: editId, 
          nome: form.nome, 
          email: form.email, 
          unidade_id: form.unidade_id,
          telefone: form.telefone,
          documento: form.documento,
          orgao_origem: form.orgao_origem,
          responsavel: form.responsavel,
          observacoes: form.observacoes,
          data_validade: form.data_validade,
          permissoes: form.permissoes
        };
        if (form.senha) body.senha = form.senha;
        const { data, error } = await supabase.functions.invoke("manage-external", { body });
        if (error || data?.error) { toast.error(data?.error || "Erro."); setSaving(false); return; }
        toast.success("Profissional externo atualizado!");
      } else {
        if (!form.senha) { toast.error("Senha obrigatória para novo cadastro."); setSaving(false); return; }
        const { data, error } = await supabase.functions.invoke("manage-external", {
          body: { 
            action: "create", 
            nome: form.nome, 
            email: form.email, 
            senha: form.senha, 
            unidade_id: form.unidade_id, 
            criado_por: user?.id || "",
            telefone: form.telefone,
            documento: form.documento,
            orgao_origem: form.orgao_origem,
            responsavel: form.responsavel,
            observacoes: form.observacoes,
            data_validade: form.data_validade,
            permissoes: form.permissoes
          },
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
      setVagasPorProf(v => ({ ...v, [profId]: { vagas: 5, turno: "manha", horario_inicio: "07:30", horario_fim: "11:30" } }));
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
        unidade_id: form.unidade_id || "",
        vagas_total: vagasPorProf[profId]?.vagas || 5,
        vagas_usadas: 0,
        periodo_inicio: today,
        periodo_fim: endOfYear,
        turno: vagasPorProf[profId]?.turno || "manha",
        horario_inicio: vagasPorProf[profId]?.horario_inicio || "07:30",
        horario_fim: vagasPorProf[profId]?.horario_fim || "11:30",
        especialidade: (profissionaisInternos.find(f => f.id === profId) as any)?.profissao || "Médico",
        ativo: true
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

  const handleEditQuota = (quota: QuotaRow) => {
    setSelectedQuota(quota);
    setQuotaForm({
      vagas_total: quota.vagas_total,
      turno: quota.turno || "manha",
      horario_inicio: quota.horario_inicio || "07:30",
      horario_fim: quota.horario_fim || "11:30",
      periodo_inicio: quota.periodo_inicio,
      periodo_fim: quota.periodo_fim,
      ativo: quota.ativo
    });
    setQuotaEditDialogOpen(true);
  };

  const handleUpdateQuota = async () => {
    if (!selectedQuota) return;
    
    if (quotaForm.vagas_total < selectedQuota.vagas_usadas) {
      toast.error(`Não é possível reduzir para ${quotaForm.vagas_total} vagas, pois já existem ${selectedQuota.vagas_usadas} agendamentos vinculados a esta cota.`);
      return;
    }

    setSavingQuota(true);
    try {
      const { error } = await supabase
        .from("quotas_externas")
        .update({
          vagas_total: quotaForm.vagas_total,
          turno: quotaForm.turno,
          horario_inicio: quotaForm.horario_inicio,
          horario_fim: quotaForm.horario_fim,
          periodo_inicio: quotaForm.periodo_inicio,
          periodo_fim: quotaForm.periodo_fim,
          ativo: quotaForm.ativo
        })
        .eq("id", selectedQuota.id);

      if (error) throw error;
      toast.success("Cota atualizada com sucesso!");
      setQuotaEditDialogOpen(false);
      await loadExternos();
    } catch (err: any) {
      console.error("[Funcionários Externos] Erro ao atualizar cota", err);
      toast.error("Erro ao atualizar cota.");
    } finally {
      setSavingQuota(false);
    }
  };

  const handleDeleteQuota = async (quota: QuotaRow) => {
    try {
      if (quota.vagas_usadas > 0) {
        // Soft delete/deactivate if has history
        const { error } = await supabase
          .from("quotas_externas")
          .update({ ativo: false })
          .eq("id", quota.id);
        
        if (error) throw error;
        toast.info("Esta cota possui agendamentos. Ela foi desativada para preservar o histórico.");
      } else {
        const { error } = await supabase
          .from("quotas_externas")
          .delete()
          .eq("id", quota.id);
        
        if (error) throw error;
        toast.success("Cota removida definitivamente.");
      }
      await loadExternos();
    } catch (err: any) {
      console.error("[Funcionários Externos] Erro ao excluir cota", err);
      toast.error("Erro ao remover cota.");
    }
  };

  const handleToggleQuotaStatus = async (quota: QuotaRow) => {
    try {
      const { error } = await supabase
        .from("quotas_externas")
        .update({ ativo: !quota.ativo })
        .eq("id", quota.id);
      
      if (error) throw error;
      toast.success(quota.ativo ? "Cota desativada" : "Cota ativada");
      await loadExternos();
    } catch (err: any) {
      toast.error("Erro ao alterar status da cota.");
    }
  };

  const handleVerAgenda = async (quota: QuotaRow) => {
    setSelectedQuota(quota);
    setLoadingAgenda(true);
    setAgendaDialogOpen(true);
    try {
      // Assuming a table external_appointments or similar linked to quota
      // Let's try to find appointments linked to this quota
      const client: any = supabase;
      const response = await client
        .from("agendamentos")
        .select("id, data_agendamento, horario, status, pacientes(nome), funcionarios(nome)")
        .eq("profissional_externo_id", quota.profissional_externo_id)
        .eq("profissional_id", quota.profissional_interno_id)
        .eq("data_agendamento", quota.periodo_inicio);
      
      const { data, error } = response;

      if (error) throw error;
      
      setQuotaAppointments(data?.map((a: any) => ({
        id: a.id,
        data_agendamento: a.data_agendamento,
        horario: a.horario,
        paciente_nome: a.pacientes?.nome || "Paciente não identificado",
        status: a.status,
        profissional_interno_nome: a.funcionarios?.nome || "Profissional não identificado"
      })) || []);
    } catch (err) {
      console.error("Erro ao carregar agenda da cota", err);
      setQuotaAppointments([]);
    } finally {
      setLoadingAgenda(false);
    }
  };

  // Sincronizado com Disponibilidade: só aparecem profissionais que possuem disponibilidade
  // cadastrada nas unidades visíveis ao usuário atual.
  const unidadesVisiveisIds = new Set(unidadesVisiveis.map(u => u.id));
  const profIdsComDisponibilidade = new Set(
    disponibilidades
      .filter((d: any) => unidadesVisiveisIds.size === 0 || unidadesVisiveisIds.has(d.unidadeId))
      .map((d: any) => d.profissionalId)
  );
  const profissionaisInternos = funcionarios.filter((f: any) =>
    f.role === "profissional" && f.ativo && profIdsComDisponibilidade.has(f.id)
  );

  const filteredExternos = externos.filter(e => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return e.nome.toLowerCase().includes(term) || e.email.toLowerCase().includes(term);
  });

  const quotaConfiguredProfIds = new Set(
    quotas
      .filter(q => q.profissional_externo_id === selectedExternoId)
      .map(q => q.profissional_interno_id)
  );
  const availableForQuota = profissionaisInternos;

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredExternos.map(ext => {
            const unidade = unidades.find((u: any) => u.id === ext.unidade_id);
            const extQuotas = quotas.filter(q => q.profissional_externo_id === ext.id);
            const totalVagas = extQuotas.reduce((acc, curr) => acc + curr.vagas_total, 0);
            const usadasVagas = extQuotas.reduce((acc, curr) => acc + curr.vagas_usadas, 0);
            
            return (
              <Card key={ext.id} className="overflow-hidden border-t-4 border-t-primary/20 hover:shadow-md transition-shadow">
                <CardContent className="p-0">
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                          <User className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-foreground truncate">{ext.nome}</p>
                            <Badge variant={ext.ativo ? "default" : "secondary"} className="text-[10px] h-4">
                              {ext.ativo ? "ATIVO" : "INATIVO"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{ext.email}</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 py-2 border-y border-dashed">
                      <div className="text-center p-2 rounded bg-accent/30">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">Cotas Ativas</p>
                        <p className="text-lg font-bold text-primary">{extQuotas.length}</p>
                      </div>
                      <div className="text-center p-2 rounded bg-accent/30">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">Vagas Livres</p>
                        <p className="text-lg font-bold text-success">{totalVagas - usadasVagas}/{totalVagas}</p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      {unidade && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Building2 className="w-3 h-3 shrink-0" />
                          <span className="truncate">{unidade.nome}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3 shrink-0" />
                        <span>Desde {new Date(ext.criado_em).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-muted/30 p-2 flex items-center justify-between border-t">
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setSelectedExternoId(ext.id); setQuotaListDialogOpen(true); }} title="Gerenciar Cotas">
                        <Ticket className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openQuotaDialog(ext.id)} title="Adicionar Cotas">
                        <Plus className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(ext)} title="Editar Profissional">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleToggleActive(ext)} title={ext.ativo ? "Desativar" : "Ativar"}>
                        {ext.ativo ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => {/* TODO: Link agendamento online */}}>
                        <Search className="w-3 h-3" /> Agenda
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"><Trash2 className="w-4 h-4" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir {ext.nome}?</AlertDialogTitle>
                            <AlertDialogDescription>Esta ação não pode ser desfeita. Todos os acessos e quotas serão removidos.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(ext.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  {extQuotas.length > 0 && (
                    <div className="px-4 pb-4 mt-2">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Resumo de Turnos</p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {Array.from(new Set(extQuotas.map(q => q.turno || "Manhã"))).map(turno => (
                          <Badge key={turno} variant="outline" className="text-[9px] uppercase font-bold py-0 h-5 bg-background">
                            {turno}
                          </Badge>
                        ))}
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
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editId ? "Editar" : "Cadastrar"} Profissional Externo</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto px-1">
            <div className="space-y-3">
              <h3 className="font-semibold text-sm border-b pb-1">DADOS DO EXTERNO</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2"><Label>Nome Completo *</Label><Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} /></div>
                <div><Label>E-mail *</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
                <div><Label>Telefone</Label><Input value={form.telefone} onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))} /></div>
                <div><Label>Documento/Registro</Label><Input value={form.documento} onChange={e => setForm(p => ({ ...p, documento: e.target.value }))} /></div>
                <div><Label>Órgão/Unidade Origem</Label><Input value={form.orgao_origem} onChange={e => setForm(p => ({ ...p, orgao_origem: e.target.value }))} /></div>
                <div><Label>Responsável</Label><Input value={form.responsavel} onChange={e => setForm(p => ({ ...p, responsavel: e.target.value }))} /></div>
                <div><Label>Data Validade Acesso</Label><Input type="date" value={form.data_validade} onChange={e => setForm(p => ({ ...p, data_validade: e.target.value }))} /></div>
                <div className="sm:col-span-2">
                  <Label>Unidade Destino Principal</Label>
                  <Select value={form.unidade_id} onValueChange={v => setForm(p => ({ ...p, unidade_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{unidadesVisiveis.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2"><Label>Observações</Label><Input value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} /></div>
              </div>

              <h3 className="font-semibold text-sm border-b pb-1 mt-4">PERMISSÕES</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(form.permissoes).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <Checkbox 
                      id={key} 
                      checked={value} 
                      onCheckedChange={(checked) => setForm(p => ({ ...p, permissoes: { ...p.permissoes, [key]: !!checked } }))} 
                    />
                    <Label htmlFor={key} className="text-xs cursor-pointer">{key.replace(/_/g, " ").toUpperCase()}</Label>
                  </div>
                ))}
              </div>

              <h3 className="font-semibold text-sm border-b pb-1 mt-4">CONFIGURAÇÃO DE ACESSO</h3>
              <div>
                <Label>{editId ? "Nova Senha (opcional)" : "Senha *"}</Label>
                <div className="relative">
                  <Input type={showSenha ? "text" : "password"} value={form.senha} onChange={e => setForm(p => ({ ...p, senha: e.target.value }))} placeholder="Min. 6 caracteres" className="pr-10" />
                  <button type="button" onClick={() => setShowSenha(!showSenha)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
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
                Nenhum profissional com disponibilidade cadastrada foi encontrado.
              </p>
            ) : (
              <div className="space-y-2">
                {availableForQuota.map((f: any) => {
                  const isSelected = selectedProfIds.includes(f.id);
                  const alreadyConfigured = quotaConfiguredProfIds.has(f.id);
                  return (
                    <div key={f.id} className={`rounded-lg border p-3 transition-colors ${isSelected ? "border-primary bg-primary/5" : "border-border"}`}>
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={isSelected}
                          disabled={alreadyConfigured}
                          onCheckedChange={() => !alreadyConfigured && toggleProfSelection(f.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-foreground">{f.nome}</p>
                          <p className="text-xs text-muted-foreground">{f.profissao || f.cargo || ""}</p>
                        </div>
                        {alreadyConfigured && (
                          <Badge variant="secondary" className="text-[10px] shrink-0">Quota já cadastrada</Badge>
                        )}
                        {isSelected && (
                          <div className="flex flex-col gap-2 mt-2 pt-2 border-t w-full">
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <Label className="text-xs">Vagas:</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  value={vagasPorProf[f.id]?.vagas || 5}
                                  onChange={e => setVagasPorProf(v => ({ ...v, [f.id]: { ...v[f.id], vagas: Math.max(1, Number(e.target.value)) } }))}
                                  className="h-8 text-center text-sm"
                                />
                              </div>
                              <div className="flex-1">
                                <Label className="text-xs">Turno:</Label>
                                <Select 
                                  value={vagasPorProf[f.id]?.turno || "manha"} 
                                  onValueChange={v => setVagasPorProf(prev => ({ ...prev, [f.id]: { ...prev[f.id], turno: v } }))}
                                >
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="manha">Manhã</SelectItem>
                                    <SelectItem value="tarde">Tarde</SelectItem>
                                    <SelectItem value="noite">Noite</SelectItem>
                                    <SelectItem value="integral">Integral</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <Label className="text-xs">Início:</Label>
                                <Input
                                  type="time"
                                  value={vagasPorProf[f.id]?.horario_inicio || "07:30"}
                                  onChange={e => setVagasPorProf(v => ({ ...v, [f.id]: { ...v[f.id], horario_inicio: e.target.value } }))}
                                  className="h-8 text-sm"
                                />
                              </div>
                              <div className="flex-1">
                                <Label className="text-xs">Fim:</Label>
                                <Input
                                  type="time"
                                  value={vagasPorProf[f.id]?.horario_fim || "11:30"}
                                  onChange={e => setVagasPorProf(v => ({ ...v, [f.id]: { ...v[f.id], horario_fim: e.target.value } }))}
                                  className="h-8 text-sm"
                                />
                              </div>
                            </div>
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
                      {prof?.nome || "—"}: <strong>{vagasPorProf[id]?.vagas || 5} vagas ({vagasPorProf[id]?.turno})</strong>
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
      {/* List/Manage Quotas Dialog */}
      <Dialog open={quotaListDialogOpen} onOpenChange={setQuotaListDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="w-5 h-5 text-primary" />
              Cotas de {externos.find(e => e.id === selectedExternoId)?.nome}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-2">
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Prof. Destino</th>
                    <th className="px-3 py-2 text-left font-medium">Especialidade</th>
                    <th className="px-3 py-2 text-left font-medium">Turno/Horário</th>
                    <th className="px-3 py-2 text-center font-medium">Vagas</th>
                    <th className="px-3 py-2 text-center font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {quotas.filter(q => q.profissional_externo_id === selectedExternoId).length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Nenhuma cota encontrada.</td></tr>
                  ) : (
                    quotas.filter(q => q.profissional_externo_id === selectedExternoId).map(q => {
                      const prof = funcionarios.find((f: any) => f.id === q.profissional_interno_id);
                      return (
                        <tr key={q.id} className="hover:bg-accent/5 transition-colors">
                          <td className="px-3 py-2 font-medium">{prof?.nome || "—"}</td>
                          <td className="px-3 py-2">{q.especialidade || "—"}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col">
                              <span className="capitalize">{q.turno}</span>
                              <span className="text-[10px] text-muted-foreground">{q.horario_inicio?.substring(0, 5)} - {q.horario_fim?.substring(0, 5)}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex flex-col items-center">
                              <span className="font-bold">{q.vagas_total}</span>
                              <span className="text-[10px] text-muted-foreground">U: {q.vagas_usadas} | L: {q.vagas_total - q.vagas_usadas}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Badge variant={q.ativo ? "default" : "secondary"} className="text-[10px] py-0 h-5">
                              {q.ativo ? "ATIVA" : "INATIVA"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleVerAgenda(q)} title="Ver Agenda">
                                <List className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEditQuota(q)} title="Editar">
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleToggleQuotaStatus(q)} title={q.ativo ? "Desativar" : "Ativar"}>
                                {q.ativo ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Excluir"><Trash2 className="w-3.5 h-3.5" /></Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir cota?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Profissional: {prof?.nome}<br />
                                      Vagas: {q.vagas_total}<br />
                                      {q.vagas_usadas > 0 ? "Esta cota possui agendamentos e será desativada em vez de excluída." : "Esta ação não pode ser desfeita."}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeleteQuota(q)} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Quota Dialog */}
      <Dialog open={quotaEditDialogOpen} onOpenChange={setQuotaEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar Cota</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="bg-accent/30 p-3 rounded-md mb-4">
              <p className="text-sm font-semibold">Profissional: {funcionarios.find((f: any) => f.id === selectedQuota?.profissional_interno_id)?.nome}</p>
              <p className="text-xs text-muted-foreground">Vagas usadas atualmente: {selectedQuota?.vagas_usadas}</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vagas Totais</Label>
                <Input 
                  type="number" 
                  min={selectedQuota?.vagas_usadas || 1} 
                  value={quotaForm.vagas_total} 
                  onChange={e => setQuotaForm(p => ({ ...p, vagas_total: Number(e.target.value) }))} 
                />
              </div>
              <div className="space-y-2">
                <Label>Turno</Label>
                <Select value={quotaForm.turno} onValueChange={v => setQuotaForm(p => ({ ...p, turno: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manha">Manhã</SelectItem>
                    <SelectItem value="tarde">Tarde</SelectItem>
                    <SelectItem value="noite">Noite</SelectItem>
                    <SelectItem value="integral">Integral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Horário Início</Label>
                <Input type="time" value={quotaForm.horario_inicio} onChange={e => setQuotaForm(p => ({ ...p, horario_inicio: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Horário Fim</Label>
                <Input type="time" value={quotaForm.horario_fim} onChange={e => setQuotaForm(p => ({ ...p, horario_fim: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Início Período</Label>
                <Input type="date" value={quotaForm.periodo_inicio} onChange={e => setQuotaForm(p => ({ ...p, periodo_inicio: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Fim Período</Label>
                <Input type="date" value={quotaForm.periodo_fim} onChange={e => setQuotaForm(p => ({ ...p, periodo_fim: e.target.value }))} />
              </div>
            </div>

            <div className="flex items-center gap-2 py-2">
              <Checkbox id="quota-ativo" checked={quotaForm.ativo} onCheckedChange={c => setQuotaForm(p => ({ ...p, ativo: !!c }))} />
              <Label htmlFor="quota-ativo">Cota Ativa</Label>
            </div>

            <Button onClick={handleUpdateQuota} disabled={savingQuota} className="w-full gradient-primary text-primary-foreground">
              {savingQuota && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Salvar Alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Agenda/Appointments Dialog */}
      <Dialog open={agendaDialogOpen} onOpenChange={setAgendaDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Agendamentos da Cota</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {loadingAgenda ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : quotaAppointments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Nenhum agendamento vinculado a esta cota.</div>
            ) : (
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left">Data/Hora</th>
                      <th className="px-3 py-2 text-left">Paciente</th>
                      <th className="px-3 py-2 text-left">Profissional</th>
                      <th className="px-3 py-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {quotaAppointments.map(app => (
                      <tr key={app.id}>
                        <td className="px-3 py-2">{new Date(app.data_agendamento).toLocaleDateString()} {app.horario}</td>
                        <td className="px-3 py-2 font-medium">{app.paciente_nome}</td>
                        <td className="px-3 py-2">{app.profissional_interno_nome}</td>
                        <td className="px-3 py-2 text-center">
                          <Badge variant="outline" className="text-[10px]">{app.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProfissionaisExternos;
