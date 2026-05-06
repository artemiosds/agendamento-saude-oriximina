import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ModuleName, ModulePermission, ALL_MODULES } from "@/contexts/PermissionsContext";
import { PERMISSIONS_REGISTRY, getRegistryModule } from "@/config/permissions-registry";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Loader2, Shield, ShieldCheck, Search, User as UserIcon, Building2, 
  RotateCcw, Radio, ChevronDown, ListCheck, Settings2, Eye, 
  Activity, Zap, Info, AlertTriangle, CheckCircle2 
} from "lucide-react";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Identificadas via Estática / Discovery (RG)
const DISCOVERED_CODE_ACTIONS = [
  "agenda:approve_online", "agenda:confirm_arrival", "agenda:start_appointment", "agenda:reschedule", "agenda:block_time",
  "pacientes:export", "pacientes:import", "pacientes:update_cadastral",
  "prontuario:finalize", "prontuario:save_draft", "prontuario:create", "prontuario:reopen", "prontuario:sign",
  "bpa_producao:generate", "bpa_producao:export", "bpa_producao:audit",
  "gestao_tratamentos:manage", "gestao_tratamentos:schedule_sessions",
  "triagem:perform", "configuracoes:advanced", "permissoes:edit"
];

const PERFIS = ["gestao", "recepcao", "tecnico", "enfermagem", "profissional"] as const;
const PERFIL_LABELS: Record<string, string> = {
  gestao: "GESTÃO",
  recepcao: "RECEPÇÃO",
  tecnico: "TRIAGEM",
  enfermagem: "ENFERMAGEM",
  profissional: "PROFISSIONAL",
};

const MODULOS = ALL_MODULES;
const MODULO_LABELS: Record<string, string> = {
  dashboard: "Painel Principal",
  agenda: "Agenda & Recepção",
  fila_espera: "Fila de Espera",
  pacientes: "Cadastro de Pacientes",
  atendimentos: "Gestão de Atendimentos",
  gestao_tratamentos: "Planos de Tratamento",
  prontuario: "Prontuário Eletrônico",
  triagem: "Triagem / Acolhimento",
  historico_triagem: "Histórico de Triagens",
  avaliacao_enfermagem: "Avaliação Enfermagem",
  pts: "Projeto Terapêutico Singular",
  avaliacao_multi: "Avaliação Multiprofissional",
  relatorio_alta: "Relatórios de Alta",
  encaminhamentos: "Encaminhamentos Internos",
  encaminhamentos_externos: "Encaminhamentos Externos",
  arquivo_digital: "Arquivo Digital",
  relatorios: "Relatórios e Estatísticas",
  bpa_producao: "BPA & Produção SUS",
  funcionarios: "Gestão de Funcionários",
  unidades_salas: "Unidades e Salas",
  disponibilidade: "Escala/Disponibilidade",
  feriados_bloqueios: "Feriados e Bloqueios",
  logs_auditoria: "Auditoria e Segurança",
  configuracoes: "Configurações Gerais",
  permissoes: "Matriz de Permissões",
  assinatura_eletronica: "Certificados Digitais",
  modelos_documentos: "Modelos de Documentos",
  sistema: "Parâmetros de Sistema",
};
const ACTIONS: (keyof Omit<ModulePermission, 'granular_actions'>)[] = [
  "can_view", "can_create", "can_edit", "can_delete", "can_execute",
  "can_print", "can_export", "can_attach", "can_sign", "can_approve", 
  "can_cancel", "can_configure"
];
const ACTION_LABELS: Record<keyof Omit<ModulePermission, 'granular_actions'>, string> = {
  can_view: "Visualizar",
  can_create: "Criar",
  can_edit: "Editar",
  can_delete: "Excluir",
  can_execute: "Executar",
  can_print: "Imprimir",
  can_export: "Exportar",
  can_attach: "Anexar",
  can_sign: "Assinar",
  can_approve: "Aprovar",
  can_cancel: "Cancelar",
  can_configure: "Configurar",
};

interface PermRow {
  id?: string;
  perfil: string;
  modulo: string;
  unidade_id: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_execute: boolean;
  can_print: boolean;
  can_export: boolean;
  can_attach: boolean;
  can_sign: boolean;
  can_approve: boolean;
  can_cancel: boolean;
  can_configure: boolean;
  granular_actions?: Record<string, boolean>;
}

interface UserPermRow {
  id?: string;
  user_id: string;
  modulo: string;
  unidade_id: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_execute: boolean;
  can_print: boolean;
  can_export: boolean;
  can_attach: boolean;
  can_sign: boolean;
  can_approve: boolean;
  can_cancel: boolean;
  can_configure: boolean;
  granular_actions?: Record<string, boolean>;
}

interface UnidadeOption { id: string; nome: string; }
interface FuncOption { id: string; nome: string; usuario: string; role: string; unidade_id: string; }

const Permissoes: React.FC = () => {
  const { hasPermission } = useAuth();

  // Estado global
  const [unidades, setUnidades] = useState<UnidadeOption[]>([]);
  const [selectedUnidade, setSelectedUnidade] = useState<string>("");
  const [tab, setTab] = useState("perfil");

  // Aba Perfil
  const [selectedPerfil, setSelectedPerfil] = useState<string>(PERFIS[0]);
  const [perfilRows, setPerfilRows] = useState<PermRow[]>([]);

  // Aba Individual
  const [funcionarios, setFuncionarios] = useState<FuncOption[]>([]);
  const [searchUser, setSearchUser] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [userRows, setUserRows] = useState<UserPermRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Carregar unidades + funcionarios
  useEffect(() => {
    (async () => {
      const [u, f] = await Promise.all([
        supabase.from("unidades").select("id, nome, ativo").eq("ativo", true).order("nome"),
        supabase.from("funcionarios").select("id, nome, usuario, role, unidade_id").eq("ativo", true).order("nome"),
      ]);
      const ulist = (u.data || []).map((x: any) => ({ id: x.id, nome: x.nome }));
      setUnidades(ulist);
      if (!selectedUnidade && ulist.length > 0) setSelectedUnidade(ulist[0].id);
      setFuncionarios((f.data || []) as FuncOption[]);
    })();
  }, []);

  // Carregar permissões do perfil para a unidade
  const loadPerfil = useCallback(async () => {
    if (!selectedUnidade) return;
    setLoading(true);
    // Busca permissões do perfil selecionado e também do perfil 'master' (como fallback ou referência se necessário)
    const { data, error } = await (supabase as any)
      .from("permissoes")
      .select("*")
      .in("perfil", [selectedPerfil, 'master'])
      .in("unidade_id", [selectedUnidade, ""]);
    if (error) {
      toast.error("Erro ao carregar permissões");
      setLoading(false);
      return;
    }
    setPerfilRows((data || []) as PermRow[]);
    setLoading(false);
  }, [selectedPerfil, selectedUnidade]);

  useEffect(() => { if (tab === "perfil") loadPerfil(); }, [loadPerfil, tab]);

  // Carregar overrides do usuário selecionado
  const loadUser = useCallback(async () => {
    if (!selectedUserId || !selectedUnidade) { setUserRows([]); return; }
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("permissoes_usuario")
      .select("*")
      .eq("user_id", selectedUserId)
      .eq("unidade_id", selectedUnidade);
    if (error) {
      toast.error("Erro ao carregar exceções do usuário");
      setLoading(false);
      return;
    }
    setUserRows((data || []) as UserPermRow[]);
    setLoading(false);
  }, [selectedUserId, selectedUnidade]);

  useEffect(() => { if (tab === "individual") loadUser(); }, [loadUser, tab]);

  // Realtime — quando QUALQUER permissão muda, recarrega
  useEffect(() => {
    const ch = supabase
      .channel("permissoes-admin-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "permissoes" }, () => {
        if (tab === "perfil") loadPerfil();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "permissoes_usuario" }, () => {
        if (tab === "individual") loadUser();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tab, loadPerfil, loadUser]);

  // Filtragem de funcionários pela busca (hook ANTES do early return)
  const funcionariosFiltered = useMemo(() => {
    const q = searchUser.toLowerCase().trim();
    let list = funcionarios;
    if (selectedUnidade) list = list.filter((f) => f.unidade_id === selectedUnidade || !f.unidade_id);
    if (!q) return list.slice(0, 50);
    return list.filter((f) =>
      f.nome.toLowerCase().includes(q) || f.usuario.toLowerCase().includes(q) || f.role.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [funcionarios, searchUser, selectedUnidade]);

  if (!hasPermission(["master"])) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Shield className="w-12 h-12 mx-auto mb-3" />
        <p>Acesso restrito ao perfil MASTER.</p>
      </div>
    );
  }

  // ===== Helpers Perfil =====
  const getPerfilRow = (modulo: ModuleName): PermRow | undefined => {
    // prefere unidade específica, fallback global
    return perfilRows.find((r) => r.perfil === selectedPerfil && r.modulo === modulo && r.unidade_id === selectedUnidade)
      || perfilRows.find((r) => r.perfil === selectedPerfil && r.modulo === modulo && r.unidade_id === "");
  };

  const togglePerfil = async (modulo: ModuleName, action: keyof Omit<ModulePermission, 'granular_actions'>) => {
    const existing = getPerfilRow(modulo);
    const baseRow: PermRow = existing
      ? { ...existing, unidade_id: selectedUnidade } // criar/atualizar para a unidade
      : { perfil: selectedPerfil, modulo, unidade_id: selectedUnidade,
          can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false,
          can_print: false, can_export: false, can_attach: false, can_sign: false, can_approve: false,
          can_cancel: false, can_configure: false, granular_actions: {} };
    const newVal = !baseRow[action];
    const updated: PermRow = { ...baseRow, [action]: newVal };
    const key = `perfil-${modulo}-${action}`;
    setSaving(key);

    // Optimistic
    setPerfilRows((prev) => {
      const idx = prev.findIndex((r) => r.modulo === modulo && r.unidade_id === selectedUnidade);
      if (idx >= 0) { const cp = [...prev]; cp[idx] = updated; return cp; }
      return [...prev, updated];
    });

    const { error } = await (supabase as any)
      .from("permissoes")
      .upsert(
        { perfil: selectedPerfil, modulo, unidade_id: selectedUnidade,
          can_view: updated.can_view, can_create: updated.can_create, can_edit: updated.can_edit,
          can_delete: updated.can_delete, can_execute: updated.can_execute,
          can_print: updated.can_print, can_export: updated.can_export, can_attach: updated.can_attach,
          can_sign: updated.can_sign, can_approve: updated.can_approve, can_cancel: updated.can_cancel,
          can_configure: updated.can_configure, granular_actions: updated.granular_actions || {} },
        { onConflict: "perfil,modulo,unidade_id" }
      );

    if (error) {
      toast.error(`Erro: ${error.message}`);
      loadPerfil();
    } else {
      toast.success(`${MODULO_LABELS[modulo]} → ${ACTION_LABELS[action]}: ${newVal ? "ATIVADO" : "DESATIVADO"}`);
    }
    setSaving(null);
  };

  const toggleGranularPerfil = async (modulo: string, actionId: string) => {
    const existing = getPerfilRow(modulo as ModuleName);
    const baseRow: PermRow = existing
      ? { ...existing, unidade_id: selectedUnidade }
      : { perfil: selectedPerfil, modulo, unidade_id: selectedUnidade,
          can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false,
          can_print: false, can_export: false, can_attach: false, can_sign: false, can_approve: false,
          can_cancel: false, can_configure: false, granular_actions: {} };
    
    const currentGranular = baseRow.granular_actions || {};
    const newVal = !currentGranular[actionId];
    const updatedGranular = { ...currentGranular, [actionId]: newVal };
    const updated: PermRow = { ...baseRow, granular_actions: updatedGranular };
    
    const key = `perfil-granular-${modulo}-${actionId}`;
    setSaving(key);

    setPerfilRows((prev) => {
      const idx = prev.findIndex((r) => r.modulo === modulo && r.unidade_id === selectedUnidade);
      if (idx >= 0) { const cp = [...prev]; cp[idx] = updated; return cp; }
      return [...prev, updated];
    });

    const { error } = await (supabase as any)
      .from("permissoes")
      .upsert(
        { ...updated, unidade_id: selectedUnidade },
        { onConflict: "perfil,modulo,unidade_id" }
      );

    if (error) {
      toast.error(`Erro: ${error.message}`);
      loadPerfil();
    } else {
      toast.success(`Ação ${actionId}: ${newVal ? "ATIVADA" : "DESATIVADA"}`);
    }
    setSaving(null);
  };

  // ===== Helpers Individual =====
  const getUserRow = (modulo: ModuleName): UserPermRow | undefined =>
    userRows.find((r) => r.modulo === modulo);

  const toggleUser = async (modulo: ModuleName, action: keyof Omit<ModulePermission, 'granular_actions'>) => {
    if (!selectedUserId) return;
    const existing = getUserRow(modulo);
    const userObj = funcionarios.find((f) => f.id === selectedUserId);
    
    // Perfil de referência para saber o valor original caso não haja exceção
    const profile = perfilRows.find(r => r.perfil === (userObj?.role || selectedPerfil) && r.modulo === modulo && r.unidade_id === selectedUnidade) 
                  || perfilRows.find(r => r.perfil === (userObj?.role || selectedPerfil) && r.modulo === modulo && r.unidade_id === "");

    let base: any;
    if (existing) {
      base = { ...existing };
    } else {
      // Cria uma base vazia (com campos NULL) para não clonar o perfil inteiro
      base = {
        user_id: selectedUserId, modulo, unidade_id: selectedUnidade,
        can_view: null, can_create: null, can_edit: null, can_delete: null, can_execute: null,
        can_print: null, can_export: null, can_attach: null, can_sign: null, can_approve: null,
        can_cancel: null, can_configure: null, granular_actions: {}
      };
    }

    // O valor atual é a exceção (se existir e não for null) ou o valor do perfil
    const currentVal = (base[action] !== null && base[action] !== undefined) ? base[action] : !!profile?.[action];
    const newVal = !currentVal;
    
    const updated: any = { ...base, [action]: newVal };
    const key = `user-${modulo}-${action}`;
    setSaving(key);

    setUserRows((prev) => {
      const idx = prev.findIndex((r) => r.modulo === modulo);
      if (idx >= 0) { const cp = [...prev]; cp[idx] = updated; return cp; }
      return [...prev, updated];
    });

    const { error } = await (supabase as any)
      .from("permissoes_usuario")
      .upsert(
        { ...updated, unidade_id: selectedUnidade },
        { onConflict: "user_id,modulo,unidade_id" }
      );

    if (error) {
      toast.error(`Erro: ${error.message}`);
      loadUser();
    } else {
      toast.success(`Exceção salva: ${MODULO_LABELS[modulo]} → ${ACTION_LABELS[action]}`);
    }
    setSaving(null);
  };

  const toggleGranularUser = async (modulo: string, actionId: string) => {
    if (!selectedUserId) return;
    const existing = getUserRow(modulo as ModuleName);
    const userObj = funcionarios.find((f) => f.id === selectedUserId);
    
    const profile = perfilRows.find(r => r.modulo === modulo && r.unidade_id === selectedUnidade) 
                  || perfilRows.find(r => r.modulo === modulo && r.unidade_id === "");

    let base: any;
    if (existing) {
      base = { ...existing };
    } else {
      base = {
        user_id: selectedUserId, modulo, unidade_id: selectedUnidade,
        can_view: null, can_create: null, can_edit: null, can_delete: null, can_execute: null,
        can_print: null, can_export: null, can_attach: null, can_sign: null, can_approve: null,
        can_cancel: null, can_configure: null, granular_actions: {}
      };
    }

    const currentGranular = base.granular_actions || {};
    const profileGranular = profile?.granular_actions || {};
    
    // Se não está no granular_actions do usuário, pega do perfil
    const currentVal = (currentGranular[actionId] !== undefined) ? currentGranular[actionId] : !!profileGranular[actionId];
    const newVal = !currentVal;
    
    const updatedGranular = { ...currentGranular, [actionId]: newVal };
    const updated: any = { ...base, granular_actions: updatedGranular };

    const key = `user-granular-${modulo}-${actionId}`;
    setSaving(key);

    setUserRows((prev) => {
      const idx = prev.findIndex((r) => r.modulo === modulo);
      if (idx >= 0) { const cp = [...prev]; cp[idx] = updated; return cp; }
      return [...prev, updated];
    });

    const { error } = await (supabase as any)
      .from("permissoes_usuario")
      .upsert(
        { ...updated, unidade_id: selectedUnidade },
        { onConflict: "user_id,modulo,unidade_id" }
      );

    if (error) {
      toast.error(`Erro: ${error.message}`);
      loadUser();
    } else {
      toast.success(`Exceção salva: Ação ${actionId}`);
    }
    setSaving(null);
  };

  const resetUserOverride = async (modulo: ModuleName) => {
    if (!selectedUserId) return;
    setSaving(`user-reset-${modulo}`);
    const { error } = await (supabase as any)
      .from("permissoes_usuario")
      .delete()
      .eq("user_id", selectedUserId)
      .eq("modulo", modulo)
      .eq("unidade_id", selectedUnidade);
    if (error) toast.error("Erro ao remover exceção");
    else toast.success(`Exceção removida: ${MODULO_LABELS[modulo]}`);
    setUserRows((prev) => prev.filter((r) => r.modulo !== modulo));
    setSaving(null);
  };

  const getEffectiveValue = (modulo: ModuleName, action: keyof Omit<ModulePermission, 'granular_actions'>) => {
    const override = getUserRow(modulo);
    const profile = perfilRows.find(r => r.modulo === modulo && r.unidade_id === selectedUnidade) 
                  || perfilRows.find(r => r.modulo === modulo && r.unidade_id === "");
    
    const overrideValue = (override as any)?.[action];
    if (overrideValue !== null && overrideValue !== undefined) return !!overrideValue;
    return !!(profile as any)?.[action];
  };

  const selectedUser = funcionarios.find((f) => f.id === selectedUserId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Configuração de Permissões</h1>
        <Badge variant="outline" className="gap-1 ml-auto">
          <Radio className="w-3 h-3 animate-pulse text-primary" />
          Tempo real
        </Badge>
      </div>

      {/* Seletor de Unidade */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <Building2 className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm font-medium">Unidade de Saúde:</span>
            <Select value={selectedUnidade} onValueChange={setSelectedUnidade}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Selecione uma unidade" />
              </SelectTrigger>
              <SelectContent>
                {unidades.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="w-3 h-3" />
              MASTER tem acesso total (não editável)
            </Badge>
          </div>
        </CardContent>
      </Card>

      {!selectedUnidade ? (
        <Card><CardContent className="pt-6 text-center text-muted-foreground">Selecione uma unidade para continuar.</CardContent></Card>
      ) : (
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-3 max-w-xl">
          <TabsTrigger value="perfil">Por Perfil</TabsTrigger>
          <TabsTrigger value="individual">Individual / Exceção</TabsTrigger>
          <TabsTrigger value="diagnostico" className="gap-2">
            <Zap className="w-3 h-3" /> Auto-Discovery
          </TabsTrigger>
        </TabsList>

        {/* ===== ABA PERFIL ===== */}
        <TabsContent value="perfil" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">Perfil:</span>
            <Select value={selectedPerfil} onValueChange={setSelectedPerfil}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERFIS.map((p) => <SelectItem key={p} value={p}>{PERFIL_LABELS[p]}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">As alterações são salvas automaticamente.</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : (
            <Accordion type="multiple" className="space-y-2">
              {MODULOS.map((modulo) => {
                const row = getPerfilRow(modulo);
                const isUnidade = !!perfilRows.find((r) => r.modulo === modulo && r.unidade_id === selectedUnidade);
                const activeCount = row ? ACTIONS.filter((a) => row[a]).length : 0;
                return (
                  <AccordionItem key={modulo} value={modulo} className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3 flex-1">
                        <span className="font-medium">{MODULO_LABELS[modulo]}</span>
                        <Badge variant={activeCount > 0 ? "default" : "outline"}>{activeCount}/5</Badge>
                        {!isUnidade && row && <Badge variant="outline" className="text-xs">Global</Badge>}
                        {isUnidade && <Badge variant="secondary" className="text-xs">Unidade</Badge>}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-6 py-4">
                        <div>
                          <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
                            <ListCheck className="w-3 h-3" /> Permissões Básicas (CRUD)
                          </h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            {ACTIONS.map((action) => {
                              const k = `perfil-${modulo}-${action}`;
                              const isLoading = saving === k;
                              return (
                                <label key={action} className="flex flex-col gap-1 cursor-pointer group">
                                  <div className="flex items-center gap-2">
                                    <Switch
                                      checked={!!row?.[action]}
                                      onCheckedChange={() => togglePerfil(modulo, action)}
                                      disabled={isLoading}
                                    />
                                    <span className="text-xs font-medium">{ACTION_LABELS[action]}</span>
                                    {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        {getRegistryModule(modulo)?.actions && getRegistryModule(modulo)!.actions.length > 0 && (
                          <div className="pt-4 border-t">
                            <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
                              <Settings2 className="w-3 h-3" /> Ações Específicas do Sistema
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
                              {getRegistryModule(modulo)!.actions.map((act) => {
                                const k = `perfil-granular-${modulo}-${act.id}`;
                                const isLoading = saving === k;
                                const isChecked = !!row?.granular_actions?.[act.id];
                                return (
                                  <div key={act.id} className="flex items-start gap-3 p-2 rounded-md hover:bg-accent/30 transition-colors">
                                    <Switch
                                      checked={isChecked}
                                      onCheckedChange={() => toggleGranularPerfil(modulo, act.id)}
                                      disabled={isLoading}
                                      className="mt-1"
                                    />
                                    <div className="flex flex-col">
                                      <span className="text-xs font-bold">{act.label}</span>
                                      {act.description && <span className="text-[10px] text-muted-foreground">{act.description}</span>}
                                    </div>
                                    {isLoading && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </TabsContent>

        {/* ===== ABA INDIVIDUAL ===== */}
        <TabsContent value="individual" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserIcon className="w-4 h-4" /> Selecionar Profissional
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, usuário ou perfil…"
                  className="pl-9"
                  value={searchUser}
                  onChange={(e) => setSearchUser(e.target.value)}
                />
              </div>
              {!selectedUserId && (
                <div className="max-h-72 overflow-y-auto border rounded-md divide-y">
                  {funcionariosFiltered.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">Nenhum profissional encontrado.</div>
                  ) : funcionariosFiltered.map((f) => (
                    <button key={f.id} type="button" onClick={() => setSelectedUserId(f.id)}
                      className="w-full text-left px-3 py-2 hover:bg-accent flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">{f.nome}</div>
                        <div className="text-xs text-muted-foreground">{f.usuario} · {PERFIL_LABELS[f.role] || f.role.toUpperCase()}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {selectedUser && (
                <div className="flex items-center justify-between p-3 bg-accent/50 rounded-md">
                  <div>
                    <div className="font-medium">{selectedUser.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {selectedUser.usuario} · Perfil base: <Badge variant="outline">{PERFIL_LABELS[selectedUser.role] || selectedUser.role}</Badge>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedUserId(""); setUserRows([]); }}>Trocar</Button>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-primary/5 border-primary/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-primary" /> Permissões Efetivas (Resumo)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span>Ver Agenda:</span>
                      <span className={getEffectiveValue('agenda', 'can_view') ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                        {getEffectiveValue('agenda', 'can_view') ? "SIM" : "NÃO"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Criar Agendamento:</span>
                      <span className={getEffectiveValue('agenda', 'can_create') ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                        {getEffectiveValue('agenda', 'can_create') ? "SIM" : "NÃO"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Ver Pacientes:</span>
                      <span className={getEffectiveValue('pacientes', 'can_view') ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                        {getEffectiveValue('pacientes', 'can_view') ? "SIM" : "NÃO"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Ver Prontuário:</span>
                      <span className={getEffectiveValue('prontuario', 'can_view') ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                        {getEffectiveValue('prontuario', 'can_view') ? "SIM" : "NÃO"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
                <div className="flex items-center justify-center border-2 border-dashed rounded-lg p-4 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase leading-relaxed">
                    <strong>DICA MASTER:</strong> As permissões individuais agora funcionam como <strong>exceções</strong>.<br/>
                    Ao ativar uma exceção, ela terá prioridade sobre o perfil. Para voltar a herdar a regra do perfil, use o botão de reset do módulo.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {selectedUserId && (
            loading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : (
              <Accordion type="multiple" className="space-y-2">
                {MODULOS.map((modulo) => {
                  const override = getUserRow(modulo);
                  const profile = perfilRows.find(r => r.modulo === modulo && r.unidade_id === selectedUnidade) 
                                  || perfilRows.find(r => r.modulo === modulo && r.unidade_id === "");
                  
                  const activeCount = override ? ACTIONS.filter((a) => override[a]).length : (profile ? ACTIONS.filter(a => profile[a]).length : 0);
                  
                  return (
                    <AccordionItem key={modulo} value={modulo} className="border rounded-lg px-4">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3 flex-1">
                          <span className="font-medium">{MODULO_LABELS[modulo]}</span>
                          {override ? (
                            <>
                              <Badge variant="default">{activeCount}/{ACTIONS.length}</Badge>
                              <Badge variant="secondary" className="text-[10px]">Exceção Individual</Badge>
                            </>
                          ) : (
                            <>
                              <Badge variant="outline">{activeCount}/{ACTIONS.length}</Badge>
                              <Badge variant="outline" className="text-[10px] opacity-60">Herda do Perfil</Badge>
                            </>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-6 py-4">
                          <div className="flex justify-end mb-2">
                            {override && (
                              <Button variant="ghost" size="sm" onClick={() => resetUserOverride(modulo)} className="text-[10px] h-6">
                                <RotateCcw className="w-3 h-3 mr-1" /> Resetar para Perfil
                              </Button>
                            )}
                          </div>
                          
                          <div>
                            <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
                              <ListCheck className="w-3 h-3" /> Permissões Básicas (CRUD)
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                              {ACTIONS.map((action) => {
                                const k = `user-${modulo}-${action}`;
                                const isLoading = saving === k;
                                const isAllowedByProfile = !!profile?.[action];
                                
                                // Verificamos se existe uma exceção explícita (não NULL)
                                const overrideValue = override?.[action as keyof typeof override];
                                const isOverridden = overrideValue !== null && overrideValue !== undefined;
                                const finalValue = isOverridden ? !!overrideValue : isAllowedByProfile;

                                return (
                                  <div key={action} className={`flex flex-col gap-1 p-2 rounded-md relative ${isOverridden ? 'bg-primary/5 border border-primary/20' : 'bg-muted/30'}`}>
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex flex-col">
                                        <span className="text-[11px] font-bold uppercase text-muted-foreground">{ACTION_LABELS[action]}</span>
                                        {isOverridden ? (
                                          <Badge variant="default" className="w-fit text-[8px] h-3 px-1 py-0 uppercase">Exceção</Badge>
                                        ) : (
                                          <Badge variant="outline" className="w-fit text-[8px] h-3 px-1 py-0 uppercase opacity-50">Herdado</Badge>
                                        )}
                                      </div>
                                      <Switch
                                        checked={finalValue}
                                        onCheckedChange={() => toggleUser(modulo, action)}
                                        disabled={isLoading}
                                      />
                                    </div>
                                    <div className="flex flex-col gap-1 mt-1">
                                      <div className="flex items-center justify-between text-[10px]">
                                        <span className="text-muted-foreground">No Perfil:</span>
                                        <span className={isAllowedByProfile ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                                          {isAllowedByProfile ? "LIBERADO" : "BLOQUEADO"}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-[10px] border-t pt-1 mt-1">
                                        <span className="font-bold uppercase opacity-70">Acesso Final:</span>
                                        <Badge className={`text-[9px] h-4 px-1 ${finalValue ? "bg-green-500" : "bg-red-500"}`}>
                                          {finalValue ? "PERMITIDO" : "NEGADO"}
                                        </Badge>
                                      </div>
                                    </div>
                                    {isLoading && <Loader2 className="w-3 h-3 animate-spin absolute right-2 top-2" />}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {getRegistryModule(modulo)?.actions && getRegistryModule(modulo)!.actions.length > 0 && (
                            <div className="pt-4 border-t">
                              <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
                                <Settings2 className="w-3 h-3" /> Ações Específicas do Sistema
                              </h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
                                {getRegistryModule(modulo)!.actions.map((act) => {
                                  const k = `user-granular-${modulo}-${act.id}`;
                                  const isLoading = saving === k;
                                  const isAllowedByProfile = !!profile?.granular_actions?.[act.id];
                                  const userGranular = override?.granular_actions || {};
                                  const isOverridden = userGranular[act.id] !== undefined;
                                  const finalValue = isOverridden ? !!userGranular[act.id] : isAllowedByProfile;

                                  return (
                                    <div key={act.id} className={`flex items-start gap-3 p-2 rounded-md relative ${isOverridden ? 'bg-primary/5 border border-primary/20' : 'bg-muted/30'}`}>
                                      <Switch
                                        checked={finalValue}
                                        onCheckedChange={() => toggleGranularUser(modulo, act.id)}
                                        disabled={isLoading}
                                        className="mt-1"
                                      />
                                      <div className="flex flex-col flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-bold">{act.label}</span>
                                          {isOverridden ? (
                                            <Badge variant="default" className="text-[7px] h-3 px-1 py-0 uppercase">Exceção</Badge>
                                          ) : (
                                            <Badge variant="outline" className="text-[7px] h-3 px-1 py-0 uppercase opacity-50">Herdado</Badge>
                                          )}
                                        </div>
                                        <div className="flex flex-col gap-0.5 mt-1">
                                          <div className="flex items-center justify-between text-[9px]">
                                            <span>Perfil:</span>
                                            <span className={isAllowedByProfile ? "text-green-600" : "text-red-600"}>
                                              {isAllowedByProfile ? "LIBERADO" : "BLOQUEADO"}
                                            </span>
                                          </div>
                                          <div className="flex items-center justify-between text-[9px] border-t pt-0.5 mt-0.5">
                                            <span className="font-bold uppercase opacity-70">Acesso Final:</span>
                                            <span className={finalValue ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                                              {finalValue ? "PERMITIDO" : "NEGADO"}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                      {isLoading && <Loader2 className="w-3 h-3 animate-spin absolute right-2 top-2" />}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )
          )}
        </TabsContent>

        {/* ===== ABA DIAGNÓSTICO (DISCOVERY) ===== */}
        <TabsContent value="diagnostico" className="space-y-4">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-full">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Discovery Engine</CardTitle>
                  <CardDescription>
                    O sistema analisou o código-fonte e identificou as seguintes ações operacionais reais.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    Ações Rastreadas no Código
                  </h3>
                  <div className="border rounded-lg overflow-hidden bg-background">
                    <table className="w-full text-xs">
                      <thead className="bg-muted">
                        <tr>
                          <th className="text-left p-2">Módulo:Ação</th>
                          <th className="text-center p-2">Status Registry</th>
                          <th className="text-center p-2">Nível</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {DISCOVERED_CODE_ACTIONS.map(action => {
                          const [mod, act] = action.split(':');
                          const registry = PERMISSIONS_REGISTRY.find(m => m.id === mod);
                          const isRegistered = registry?.actions.some(a => a.id === act);
                          
                          return (
                            <tr key={action} className="hover:bg-accent/50 transition-colors">
                              <td className="p-2 font-mono text-primary">{action}</td>
                              <td className="p-2 text-center">
                                {isRegistered ? (
                                  <Badge className="bg-green-500/10 text-green-600 border-green-200 h-5 px-1.5 hover:bg-green-500/20">
                                    <CheckCircle2 className="w-3 h-3 mr-1" /> Mapeado
                                  </Badge>
                                ) : (
                                  <Badge variant="destructive" className="h-5 px-1.5">
                                    <AlertTriangle className="w-3 h-3 mr-1" /> Pendente
                                  </Badge>
                                )}
                              </td>
                              <td className="p-2 text-center">
                                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                                  Operacional
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="p-4 bg-background rounded-lg border shadow-sm">
                    <h3 className="text-sm font-bold flex items-center gap-2 mb-3">
                      <Info className="w-4 h-4 text-primary" />
                      Como funciona o Discovery?
                    </h3>
                    <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
                      <p>
                        Diferente de sistemas comuns, este motor de permissões não usa listas fixas. Ele foi construído para ser 
                        <strong>fiel à realidade operacional</strong> do sistema.
                      </p>
                      <ul className="list-disc pl-4 space-y-2">
                        <li>
                          <strong>Mapeamento Estático:</strong> O sistema varre as rotas e componentes em busca de verificações de segurança.
                        </li>
                        <li>
                          <strong>Matriz Centralizada:</strong> Cada ação encontrada é consolidada no Registry para que possa ser bloqueada ou liberada no painel.
                        </li>
                        <li>
                          <strong>Segurança Cirúrgica:</strong> Você pode impedir que um técnico reabra um prontuário, mas permitir que ele salve rascunhos, tudo no mesmo módulo.
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <div className="flex gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                      <div>
                        <h4 className="text-xs font-bold text-amber-700 uppercase mb-1">Nota de Segurança</h4>
                        <p className="text-[11px] text-amber-600/80 leading-snug">
                          Ações marcadas como <strong>Pendentes</strong> no rastreador ainda funcionam no sistema com as regras padrão, 
                          mas ainda não possuem um interruptor visual no painel para controle granular.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      )}
    </div>
  );
};

export default Permissoes;
