import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getDefaultModulePermission, ModuleName, ModulePermission } from "@/contexts/PermissionsContext";
import { resolveModulePermission, type PermissionSourceRow } from "@/lib/permissionResolution";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Shield, ShieldCheck, Search, User as UserIcon, Building2, RotateCcw, Radio } from "lucide-react";
import { toast } from "sonner";
import { auditService } from "@/services/auditService";
import { Copy, Eye, Ban, CheckCheck } from "lucide-react";

const PERFIS = ["gestao", "recepcao", "triagem", "enfermagem", "profissional"] as const;
const PERFIL_LABELS: Record<string, string> = {
  master: "MASTER",
  gestao: "GESTÃO",
  recepcao: "RECEPÇÃO",
  triagem: "TRIAGEM",
  enfermagem: "ENFERMAGEM",
  profissional: "PROFISSIONAL",
};

const ROLE_ALIASES: Record<string, string> = {
  gestao: "gestao",
  "gestão": "gestao",
  gestor: "gestao",
  coordenacao: "gestao",
  coordenador: "gestao",
  recepcao: "recepcao",
  "recepção": "recepcao",
  triagem: "triagem",
  tecnico: "triagem",
  tecnico_enfermagem: "enfermagem",
  enfermagem: "enfermagem",
  profissional: "profissional",
  master: "master",
};

const normalizeRoleKey = (value: string) => {
  const key = (value || "").toLowerCase().trim();
  return ROLE_ALIASES[key] ?? key;
};

const getRoleQueryKeys = (value: string) => {
  const key = normalizeRoleKey(value);
  const raw = (value || "").toLowerCase().trim();
  const legacyAliases =
    key === "gestao" ? ["gestao", "gestor", "coordenador", "coordenacao"] :
    key === "triagem" ? ["triagem", "tecnico"] :
    key === "enfermagem" ? ["enfermagem", "tecnico_enfermagem"] :
    key === "master" ? ["master"] :
    [key];
  return Array.from(new Set([key, raw, ...legacyAliases].filter(Boolean)));
};

const MODULO_LABELS: Record<ModuleName, string> = {
  dashboard: "Dashboard",
  agenda: "Agenda",
  fila: "Fila de Espera",
  pacientes: "Pacientes",
  faltosos: "Faltosos",
  atendimento: "Atendimentos",
  tratamento: "Gestão de Tratamentos",
  prontuario: "Prontuário",
  triagem: "Triagem",
  historico_triagem: "Histórico Triagem",
  enfermagem: "Enfermagem",
  avaliacao_enfermagem: "Avaliação Enfermagem",
  pts: "PTS",
  avaliacao_multi: "Avaliação Multi",
  relatorio_alta: "Relatório de Alta",
  relatorios: "Relatórios",
  bpa_exportar: "BPA-Exportar",
  encaminhamento: "Encaminhamento",
  usuarios: "Funcionários",
  unidades_salas: "Unidades/Salas",
  disponibilidade: "Disponibilidade",
  feriados_bloqueios: "Feriados/Bloqueios",
  logs_auditoria: "Logs & Auditoria",
  monitoramento_sistema: "Monitoramento",
  configuracoes: "Configurações",
  permissoes: "Permissões",
  configuracoes_avancadas: "Gestão Operacional e Dados",
};
const ACTIONS: (keyof ModulePermission)[] = ["can_view", "can_create", "can_edit", "can_delete", "can_execute"];
const ACTION_LABELS: Record<keyof ModulePermission, string> = {
  can_view: "Visualizar",
  can_create: "Criar",
  can_edit: "Editar",
  can_delete: "Excluir",
  can_execute: "Executar",
};

const MODULE_GROUPS: { label: string; modules: ModuleName[] }[] = [
  { label: "Agenda e recepção", modules: ["agenda", "fila", "pacientes", "faltosos", "atendimento"] },
  { label: "Assistência e clínica", modules: ["tratamento", "prontuario", "triagem", "historico_triagem", "enfermagem", "avaliacao_enfermagem", "pts", "avaliacao_multi", "relatorio_alta"] },
  { label: "Documentos e regulação", modules: ["relatorios", "bpa_exportar", "encaminhamento"] },
  { label: "Gestão da unidade", modules: ["usuarios", "unidades_salas", "disponibilidade", "feriados_bloqueios", "logs_auditoria", "monitoramento_sistema"] },
  { label: "Administração", modules: ["dashboard", "configuracoes", "permissoes", "configuracoes_avancadas"] },
];

// These switches had no independent route guard. Explain their real access
// dependency instead of allowing an administrator to save an ineffective rule.
// Sub-pages without a rule of their own show (and inherit) the parent module's rule.
const SUBMODULE_HINT = (m: ModuleName) => PERMISSION_PARENT[m]
  ? `Enquanto não houver regra própria, segue ${MODULO_LABELS[PERMISSION_PARENT[m] as ModuleName]}. Ao alterar aqui, passa a ter regra própria.`
  : "";
const ROUTE_DEPENDENCIES: Partial<Record<ModuleName, string>> = {
  dashboard: "O Dashboard está disponível a usuários autenticados; esta regra não controla sua abertura.",
  configuracoes: "Acesso exclusivo do perfil Master; esta regra não concede acesso a outros perfis.",
  permissoes: "Acesso exclusivo do perfil Master; esta regra não concede acesso a outros perfis.",
  configuracoes_avancadas: "Acesso exclusivo do perfil Master; esta regra não concede acesso a outros perfis.",
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
  can_print?: boolean | null;
  can_export?: boolean | null;
  can_attach?: boolean | null;
  can_sign?: boolean | null;
  can_approve?: boolean | null;
  can_cancel?: boolean | null;
  can_configure?: boolean | null;
  granular_actions?: Json | null;
}

interface UserPermRow {
  id?: string;
  user_id: string;
  modulo: string;
  unidade_id: string;
  can_view: boolean | null;
  can_create: boolean | null;
  can_edit: boolean | null;
  can_delete: boolean | null;
  can_execute: boolean | null;
  can_print?: boolean | null;
  can_export?: boolean | null;
  can_attach?: boolean | null;
  can_sign?: boolean | null;
  can_approve?: boolean | null;
  can_cancel?: boolean | null;
  can_configure?: boolean | null;
  granular_actions?: Json | null;
}

interface UnidadeOption { id: string; nome: string; }
interface FuncOption { id: string; nome: string; usuario: string; role: string; unidade_id: string; }

const Permissoes: React.FC = () => {
  const { hasPermission, user, isUnitMaster, isGlobalAdmin } = useAuth();

  // Estado global
  const [unidades, setUnidades] = useState<UnidadeOption[]>([]);
  const [selectedUnidade, setSelectedUnidade] = useState<string>(isUnitMaster ? user?.unidadeId || "" : "");
  const unidadeScope = selectedUnidade === "__global__" ? "" : selectedUnidade;
  const [moduleSearch, setModuleSearch] = useState("");
  const [tab, setTab] = useState("perfil");

  // Aba Perfil
  const [selectedPerfil, setSelectedPerfil] = useState<string>(PERFIS[0]);
  const [perfilRows, setPerfilRows] = useState<PermRow[]>([]);

  // Aba Individual
  const [funcionarios, setFuncionarios] = useState<FuncOption[]>([]);
  const [searchUser, setSearchUser] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [userBaseRows, setUserBaseRows] = useState<PermRow[]>([]);
  const [userRows, setUserRows] = useState<UserPermRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const savingLock = useRef(false);

  const logPerm = (acao: string, detalhes: Record<string, unknown>, before?: unknown, after?: unknown) => {
    void auditService.log({
      acao, modulo: "permissoes", entidade: "permissoes", tipoEvento: "edicao",
      user: user ? { id: user.id, nome: user.nome, role: user.role, unidadeId: user.unidadeId } : null,
      unidadeId: unidadeScope || undefined, detalhes: { escopo: unidadeScope || "global", ...detalhes }, before, after,
    }).catch(() => undefined);
  };
  const askMotivo = (texto: string): string | null => {
    const m = window.prompt(`${texto}\n\nInforme o motivo da alteração (obrigatório, mínimo 5 caracteres):`);
    if (m === null) return null;
    if (m.trim().length < 5) { toast.error("Motivo obrigatório (mínimo 5 caracteres)."); return null; }
    return m.trim();
  };

  const visibleGroups = useMemo(() => MODULE_GROUPS.map((group) => ({
    ...group,
    modules: group.modules.filter((modulo) => MODULO_LABELS[modulo].toLowerCase().includes(moduleSearch.toLowerCase().trim())),
  })).filter((group) => group.modules.length > 0), [moduleSearch]);

  // Carregar unidades + funcionarios
  useEffect(() => {
    (async () => {
      const unitsQuery = supabase.from("unidades").select("id, nome, ativo").eq("ativo", true).order("nome");
      const staffQuery = supabase.from("funcionarios").select("id, nome, usuario, role, unidade_id").eq("ativo", true).order("nome");
      const [u, f] = await Promise.all([
        isUnitMaster ? unitsQuery.eq("id", user?.unidadeId || "") : unitsQuery,
        isUnitMaster ? staffQuery.eq("unidade_id", user?.unidadeId || "") : staffQuery,
      ]);
      if (u.error || f.error) toast.error("Não foi possível carregar unidades ou funcionários.");
      const ulist = (u.data || []).map((x) => ({ id: x.id, nome: x.nome }));
      setUnidades(ulist);
      if (isUnitMaster) setSelectedUnidade(user?.unidadeId || "");
      else setSelectedUnidade((current) => current || ulist[0]?.id || "");
      setFuncionarios((f.data || []) as FuncOption[]);
    })();
  }, [isUnitMaster, user?.unidadeId]);

  // Carregar permissões do perfil para a unidade
  const loadPerfil = useCallback(async () => {
    if (!selectedUnidade) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("permissoes")
      .select("*")
      .in("perfil", getRoleQueryKeys(selectedPerfil))
      .in("unidade_id", [unidadeScope, ""]);
    if (error) {
      toast.error("Erro ao carregar permissões");
      setLoading(false);
      return;
    }
    setPerfilRows((data || []) as PermRow[]);
    setLoading(false);
  }, [selectedPerfil, selectedUnidade, unidadeScope]);

  useEffect(() => { if (tab === "perfil") loadPerfil(); }, [loadPerfil, tab]);

  // Carregar overrides do usuário selecionado
  const loadUser = useCallback(async () => {
    if (!selectedUserId || !selectedUnidade) { setUserBaseRows([]); setUserRows([]); return; }
    setLoading(true);

    const selectedFunc = funcionarios.find((f) => f.id === selectedUserId);
    if (!selectedFunc || (isUnitMaster && selectedFunc.unidade_id !== selectedUnidade)) {
      setUserBaseRows([]); setUserRows([]); setLoading(false); return;
    }
    const roleKey = normalizeRoleKey(selectedFunc.role);

    const { data: baseData, error: baseError } = await supabase
      .from("permissoes")
      .select("*")
      .in("perfil", getRoleQueryKeys(selectedFunc?.role || roleKey))
      .in("unidade_id", [unidadeScope, ""]);

    if (baseError) {
      toast.error("Erro ao carregar permissões-base do perfil");
      setUserBaseRows([]);
      setUserRows([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("permissoes_usuario")
      .select("*")
      .eq("user_id", selectedUserId)
      .in("unidade_id", [unidadeScope, ""]);
    if (error) {
      toast.error("Erro ao carregar exceções do usuário");
      setUserRows([]);
      setLoading(false);
      return;
    }
    setUserBaseRows((baseData || []) as PermRow[]);
    setUserRows((data || []) as UserPermRow[]);
    setLoading(false);
  }, [funcionarios, selectedUserId, selectedUnidade, unidadeScope, isUnitMaster]);

  useEffect(() => { if (tab === "individual") loadUser(); }, [loadUser, tab]);

  // Realtime - quando QUALQUER permissão muda, recarrega
  useEffect(() => {
    const ch = supabase
      .channel("permissoes-admin-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "permissoes" }, () => {
        if (tab === "perfil") loadPerfil();
        if (tab === "individual") loadUser();
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
    if (selectedUnidade && selectedUnidade !== "__global__") list = list.filter((f) => f.unidade_id === selectedUnidade || !f.unidade_id);
    if (!q) return list.slice(0, 50);
    return list.filter((f) =>
      f.nome.toLowerCase().includes(q)
      || f.usuario.toLowerCase().includes(q)
      || f.role.toLowerCase().includes(q)
      || normalizeRoleKey(f.role).includes(q)
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
    const own = getOwnPerfilRow(modulo);
    const parent = PERMISSION_PARENT[modulo] as ModuleName | undefined;
    if (own || !parent) return own;
    const p = getOwnPerfilRow(parent);
    if (p) return { ...p, id: undefined, modulo };
    const d = getDefaultModulePermission(normalizeRoleKey(selectedPerfil), parent);
    return { perfil: normalizeRoleKey(selectedPerfil), modulo, unidade_id: unidadeScope, ...d };
  };
  const getOwnPerfilRow = (modulo: ModuleName): PermRow | undefined => {
    // prefere unidade específica, fallback global
    const perfilKey = normalizeRoleKey(selectedPerfil);
    return perfilRows.find((r) => r.perfil === perfilKey && r.modulo === modulo && r.unidade_id === unidadeScope)
      || perfilRows.find((r) => r.modulo === modulo && r.unidade_id === unidadeScope)
      || perfilRows.find((r) => r.perfil === perfilKey && r.modulo === modulo && r.unidade_id === "")
      || perfilRows.find((r) => r.modulo === modulo && r.unidade_id === "");
  };

  const togglePerfil = async (modulo: ModuleName, action: keyof ModulePermission) => {
    if (savingLock.current || ROUTE_DEPENDENCIES[modulo] || (isUnitMaster && selectedUnidade !== user?.unidadeId)) return;
    savingLock.current = true;
    const existing = getPerfilRow(modulo);
    const baseRow: PermRow = existing
      ? { ...existing, id: undefined, perfil: normalizeRoleKey(selectedPerfil), unidade_id: unidadeScope }
      : { perfil: normalizeRoleKey(selectedPerfil), modulo, unidade_id: unidadeScope,
          can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false };
    const newVal = !baseRow[action];
    const updated: PermRow = { ...baseRow, [action]: newVal };
    const inheritedExtras = existing ? {
      can_print: existing.can_print, can_export: existing.can_export,
      can_attach: existing.can_attach, can_sign: existing.can_sign,
      can_approve: existing.can_approve, can_cancel: existing.can_cancel,
      can_configure: existing.can_configure, granular_actions: existing.granular_actions,
    } : {};
    const key = `perfil-${modulo}-${action}`;
    setSaving(key);

    // Optimistic
    setPerfilRows((prev) => {
      const idx = prev.findIndex((r) => r.perfil === normalizeRoleKey(selectedPerfil) && r.modulo === modulo && r.unidade_id === unidadeScope);
      if (idx >= 0) { const cp = [...prev]; cp[idx] = updated; return cp; }
      return [...prev, updated];
    });

    try {
      const { data: saved, error } = await supabase
        .from("permissoes")
        .upsert(
          { perfil: normalizeRoleKey(selectedPerfil), modulo, unidade_id: unidadeScope,
            can_view: updated.can_view, can_create: updated.can_create, can_edit: updated.can_edit,
            can_delete: updated.can_delete, can_execute: updated.can_execute, ...inheritedExtras },
          { onConflict: "perfil,modulo,unidade_id" }
        ).select("id").maybeSingle();

      if (error || !saved) {
        toast.error(`Erro: ${error?.message || "Gravação não confirmada"}`);
        await loadPerfil();
      } else {
        toast.success(`${MODULO_LABELS[modulo]} → ${ACTION_LABELS[action]}: ${newVal ? "ATIVADO" : "DESATIVADO"}`);
        logPerm("permissao_perfil_alterada", { perfil: normalizeRoleKey(selectedPerfil), modulo, acao: action, valor: newVal }, existing, updated);
      }
    } catch {
      toast.error("Não foi possível salvar a permissão.");
      await loadPerfil();
    } finally {
      savingLock.current = false;
      setSaving(null);
    }
  };

  // ===== Helpers Individual =====
  const selectedUserRoleKey = normalizeRoleKey(funcionarios.find((f) => f.id === selectedUserId)?.role || "recepcao");

  const getUserBaseRow = (modulo: ModuleName): PermRow | undefined =>
    userBaseRows.find((r) => r.perfil === selectedUserRoleKey && r.modulo === modulo && r.unidade_id === unidadeScope)
      || userBaseRows.find((r) => r.modulo === modulo && r.unidade_id === unidadeScope)
      || userBaseRows.find((r) => r.perfil === selectedUserRoleKey && r.modulo === modulo && r.unidade_id === "")
      || userBaseRows.find((r) => r.modulo === modulo && r.unidade_id === "");

  const getUserOverrideRow = (modulo: ModuleName): UserPermRow | undefined =>
    userRows.find((r) => r.modulo === modulo && r.unidade_id === unidadeScope)
      || userRows.find((r) => r.modulo === modulo && r.unidade_id === "");

  const getUserEffectiveRow = (modulo: ModuleName): ModulePermission => selectedUserRoleKey === "master"
    ? { can_view: true, can_create: true, can_edit: true, can_delete: true, can_execute: true }
    : resolveWithParent({
        modulo, unidadeId: unidadeScope, perfil: selectedUserRoleKey,
        rawRole: funcionarios.find((f) => f.id === selectedUserId)?.role,
        perfilRows: userBaseRows as PermissionSourceRow[], userRows: userRows as PermissionSourceRow[],
        defaults: getDefaultModulePermission(selectedUserRoleKey, modulo),
      }, PERMISSION_PARENT[modulo] ? getDefaultModulePermission(selectedUserRoleKey, PERMISSION_PARENT[modulo] as ModuleName) : undefined);

  const toggleUser = async (modulo: ModuleName, action: keyof ModulePermission) => {
    if (!selectedUserId || savingLock.current || ROUTE_DEPENDENCIES[modulo] || (isUnitMaster && selectedUnidade !== user?.unidadeId)) return;
    savingLock.current = true;
    const existing = getUserOverrideRow(modulo);
    const baseProfile = getUserEffectiveRow(modulo);
    let base: UserPermRow;
    if (existing) {
      base = { ...existing, id: undefined, unidade_id: unidadeScope };
    } else {
      base = {
        user_id: selectedUserId, modulo, unidade_id: unidadeScope,
        can_view: baseProfile.can_view, can_create: baseProfile.can_create,
        can_edit: baseProfile.can_edit, can_delete: baseProfile.can_delete,
        can_execute: baseProfile.can_execute,
      };
    }
    const newVal = !baseProfile[action];
    const updated: UserPermRow = { ...base, [action]: newVal };
    const inheritedExtras = existing ? {
      can_print: existing.can_print, can_export: existing.can_export,
      can_attach: existing.can_attach, can_sign: existing.can_sign,
      can_approve: existing.can_approve, can_cancel: existing.can_cancel,
      can_configure: existing.can_configure, granular_actions: existing.granular_actions,
    } : {};
    const key = `user-${modulo}-${action}`;
    setSaving(key);

    setUserRows((prev) => {
      const idx = prev.findIndex((r) => r.modulo === modulo && r.unidade_id === unidadeScope);
      if (idx >= 0) { const cp = [...prev]; cp[idx] = updated; return cp; }
      return [...prev, updated];
    });

    try {
      const { data: saved, error } = await supabase
        .from("permissoes_usuario")
        .upsert(
          { user_id: selectedUserId, modulo, unidade_id: unidadeScope,
            can_view: updated.can_view, can_create: updated.can_create, can_edit: updated.can_edit,
            can_delete: updated.can_delete, can_execute: updated.can_execute, ...inheritedExtras },
          { onConflict: "user_id,modulo,unidade_id" }
        ).select("id").maybeSingle();

      if (error || !saved) {
        toast.error(`Erro: ${error?.message || "Gravação não confirmada"}`);
        await loadUser();
      } else {
        toast.success(`Exceção salva: ${MODULO_LABELS[modulo]} → ${ACTION_LABELS[action]}`);
        logPerm("permissao_usuario_alterada", { funcionario_id: selectedUserId, modulo, acao: action, valor: newVal }, existing, updated);
      }
    } catch {
      toast.error("Não foi possível salvar a exceção.");
      await loadUser();
    } finally {
      savingLock.current = false;
      setSaving(null);
    }
  };

  const resetUserOverride = async (modulo: ModuleName) => {
    if (!selectedUserId || savingLock.current || (isUnitMaster && selectedUnidade !== user?.unidadeId)) return;
    savingLock.current = true;
    setSaving(`user-reset-${modulo}`);
    try {
      const { data: deleted, error } = await supabase
        .from("permissoes_usuario")
        .delete()
        .eq("user_id", selectedUserId)
        .eq("modulo", modulo)
        .eq("unidade_id", unidadeScope)
        .select("id").maybeSingle();
      if (error || !deleted) {
        toast.error("Erro ao remover exceção");
        await loadUser();
      } else {
        toast.success(`Exceção removida: ${MODULO_LABELS[modulo]}`);
        logPerm("excecao_usuario_removida", { funcionario_id: selectedUserId, modulo });
        setUserRows((prev) => prev.filter((r) => !(r.modulo === modulo && r.unidade_id === unidadeScope)));
      }
    } catch {
      toast.error("Não foi possível remover a exceção.");
      await loadUser();
    } finally {
      savingLock.current = false;
      setSaving(null);
    }
  };

  type Preset = "total" | "leitura" | "bloquear";
  const presetValues = (preset: Preset): ModulePermission => ({
    can_view: preset !== "bloquear", can_create: preset === "total", can_edit: preset === "total",
    can_delete: preset === "total", can_execute: preset === "total",
  });
  const PRESET_LABEL: Record<Preset, string> = { total: "Acesso total", leitura: "Apenas leitura", bloquear: "Bloqueado" };
  const canWriteScope = !(isUnitMaster && selectedUnidade !== user?.unidadeId);

  const applyPreset = async (target: "perfil" | "user", modulos: ModuleName[], preset: Preset) => {
    const list = modulos.filter((m) => !ROUTE_DEPENDENCIES[m]);
    if (!list.length || savingLock.current || !canWriteScope) return;
    if (target === "user" && !selectedUserId) return;
    if (list.length > 1 || preset === "total") {
      const motivo = askMotivo(`Aplicar "${PRESET_LABEL[preset]}" em ${list.length} módulo(s)?`);
      if (!motivo) return;
      await runPreset(target, list, preset, motivo);
    } else await runPreset(target, list, preset);
  };
  const runPreset = async (target: "perfil" | "user", list: ModuleName[], preset: Preset, motivo?: string) => {
    savingLock.current = true; setSaving(`preset-${target}`);
    const vals = presetValues(preset);
    const perfil = normalizeRoleKey(selectedPerfil);
    try {
      const { error } = target === "perfil"
        ? await supabase.from("permissoes").upsert(list.map((modulo) => ({ perfil, modulo, unidade_id: unidadeScope, ...vals })), { onConflict: "perfil,modulo,unidade_id" })
        : await supabase.from("permissoes_usuario").upsert(list.map((modulo) => ({ user_id: selectedUserId, modulo, unidade_id: unidadeScope, ...vals })), { onConflict: "user_id,modulo,unidade_id" });
      if (error) toast.error(`Erro: ${error.message}`);
      else {
        toast.success(`${PRESET_LABEL[preset]} aplicado em ${list.length} módulo(s).`);
        logPerm(target === "perfil" ? "permissao_perfil_em_massa" : "permissao_usuario_em_massa",
          { perfil: target === "perfil" ? perfil : undefined, funcionario_id: target === "user" ? selectedUserId : undefined, modulos: list, preset, motivo_alteracao: motivo });
      }
    } finally {
      savingLock.current = false; setSaving(null);
      if (target === "perfil") await loadPerfil(); else await loadUser();
    }
  };

  const copyFromPerfil = async (source: string) => {
    if (!source || source === selectedPerfil || savingLock.current || !canWriteScope) return;
    const motivo = askMotivo(`Copiar todas as permissões de ${PERFIL_LABELS[source]} para ${PERFIL_LABELS[selectedPerfil]} nesta unidade? As regras atuais de ${PERFIL_LABELS[selectedPerfil]} serão substituídas.`);
    if (!motivo) return;
    savingLock.current = true; setSaving("copy");
    try {
      const { data, error } = await supabase.from("permissoes").select("*").in("perfil", getRoleQueryKeys(source)).in("unidade_id", [unidadeScope, ""]);
      if (error) { toast.error("Erro ao ler o perfil de origem."); return; }
      const rows = (data || []) as PermRow[];
      const destino = normalizeRoleKey(selectedPerfil);
      const payload = (Object.keys(MODULO_LABELS) as ModuleName[]).filter((m) => !ROUTE_DEPENDENCIES[m]).map((modulo) => {
        const r = rows.find((x) => x.modulo === modulo && x.unidade_id === unidadeScope) || rows.find((x) => x.modulo === modulo && x.unidade_id === "");
        const d = r ?? getDefaultModulePermission(normalizeRoleKey(source), modulo);
        return { perfil: destino, modulo, unidade_id: unidadeScope, can_view: !!d.can_view, can_create: !!d.can_create, can_edit: !!d.can_edit, can_delete: !!d.can_delete, can_execute: !!d.can_execute };
      });
      const { error: upErr } = await supabase.from("permissoes").upsert(payload, { onConflict: "perfil,modulo,unidade_id" });
      if (upErr) toast.error(`Erro: ${upErr.message}`);
      else { toast.success(`Permissões copiadas de ${PERFIL_LABELS[source]}.`); logPerm("permissao_perfil_copiada", { origem: source, destino, motivo_alteracao: motivo }); }
    } finally { savingLock.current = false; setSaving(null); await loadPerfil(); }
  };

  const resetAllUserOverrides = async () => {
    if (!selectedUserId || savingLock.current || !canWriteScope) return;
    const count = userRows.filter((r) => r.unidade_id === unidadeScope).length;
    if (!count) { toast.info("Este funcionário não tem exceções nesta unidade."); return; }
    const motivo = askMotivo(`Remover as ${count} exceção(ões) e voltar o funcionário ao padrão do perfil?`);
    if (!motivo) return;
    savingLock.current = true; setSaving("reset-all");
    try {
      const { error } = await supabase.from("permissoes_usuario").delete().eq("user_id", selectedUserId).eq("unidade_id", unidadeScope);
      if (error) toast.error("Erro ao remover exceções.");
      else { toast.success("Funcionário voltou ao padrão do perfil."); logPerm("excecoes_usuario_redefinidas", { funcionario_id: selectedUserId, total: count, motivo_alteracao: motivo }); }
    } finally { savingLock.current = false; setSaving(null); await loadUser(); }
  };

  const ActionChips = ({ perm }: { perm?: Partial<ModulePermission> }) => {
    const on = ACTIONS.filter((a) => perm?.[a]);
    if (!on.length) return <Badge variant="outline" className="text-xs text-muted-foreground">Sem acesso</Badge>;
    if (on.length === 5) return <Badge className="text-xs">Acesso total</Badge>;
    return <span className="hidden md:flex flex-wrap gap-1">{on.map((a) => <Badge key={a} variant={a === "can_delete" ? "destructive" : a === "can_view" ? "secondary" : "default"} className="text-[10px] px-1.5">{ACTION_LABELS[a]}</Badge>)}</span>;
  };
  const PresetButtons = ({ target, modulos, compact }: { target: "perfil" | "user"; modulos: ModuleName[]; compact?: boolean }) => (
    <div className="flex flex-wrap gap-1">
      <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={!!saving || !canWriteScope} onClick={() => applyPreset(target, modulos, "total")}><CheckCheck className="w-3 h-3 mr-1" />{compact ? "Total" : "Acesso total"}</Button>
      <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={!!saving || !canWriteScope} onClick={() => applyPreset(target, modulos, "leitura")}><Eye className="w-3 h-3 mr-1" />{compact ? "Leitura" : "Apenas leitura"}</Button>
      <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={!!saving || !canWriteScope} onClick={() => applyPreset(target, modulos, "bloquear")}><Ban className="w-3 h-3 mr-1" />Bloquear</Button>
    </div>
  );

  const editableModules = (Object.keys(MODULO_LABELS) as ModuleName[]).filter((m) => !ROUTE_DEPENDENCIES[m]);
  const perfilSummary = editableModules.reduce((acc, m) => {
    const r = getPerfilRow(m); const n = r ? ACTIONS.filter((a) => r[a]).length : 0;
    if (r?.can_view) acc.view++; if (n === 5) acc.total++; if (r?.can_delete) acc.del++; if (r && unidadeScope && r.unidade_id === unidadeScope) acc.local++;
    return acc;
  }, { view: 0, total: 0, del: 0, local: 0 });

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
            <Select value={selectedUnidade} onValueChange={(value) => { setSelectedUnidade(value); setSelectedUserId(""); }} disabled={isUnitMaster || !!saving}>
              <SelectTrigger className="w-full sm:w-[280px]" aria-label="Unidade de Saúde">
                <SelectValue placeholder="Selecione uma unidade" />
              </SelectTrigger>
              <SelectContent>
                {isGlobalAdmin && <SelectItem value="__global__">Padrão global (todas as unidades)</SelectItem>}
                {unidades.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="w-3 h-3" />
              MASTER tem acesso total (não editável)
            </Badge>
            {isUnitMaster && <span className="text-xs text-muted-foreground">Você administra somente a sua unidade.</span>}
            {selectedUnidade === "__global__" && <span className="text-xs text-muted-foreground">Alterações no padrão global afetam unidades sem regra própria.</span>}
          </div>
        </CardContent>
      </Card>

      {!selectedUnidade ? (
        <Card><CardContent className="pt-6 text-center text-muted-foreground">Selecione uma unidade para continuar.</CardContent></Card>
      ) : (
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-md h-auto">
          <TabsTrigger value="perfil">Permissões por Perfil</TabsTrigger>
          <TabsTrigger value="individual">Permissões Individuais</TabsTrigger>
        </TabsList>
        <div className="relative max-w-md mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input aria-label="Buscar módulo" placeholder="Buscar módulo de acesso..." className="pl-9"
            value={moduleSearch} onChange={(event) => setModuleSearch(event.target.value)} />
        </div>
        <p className="text-xs text-muted-foreground">Os módulos informativos mostram qual permissão realmente controla a página. As regras salvas permanecem preservadas.</p>
        {visibleGroups.length === 0 && <p role="status" className="text-sm text-muted-foreground py-4">Nenhum módulo corresponde à busca.</p>}

        {/* ===== ABA PERFIL ===== */}
        <TabsContent value="perfil" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">Perfil:</span>
            <Select value={selectedPerfil} onValueChange={setSelectedPerfil} disabled={!!saving}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERFIS.map((p) => <SelectItem key={p} value={p}>{PERFIL_LABELS[p]}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">As alterações são salvas automaticamente e registradas na auditoria.</span>
            <div className="flex items-center gap-2 ml-auto">
              <Copy className="w-4 h-4 text-muted-foreground" />
              <Select value="" onValueChange={copyFromPerfil} disabled={!!saving || !canWriteScope}>
                <SelectTrigger className="w-[220px]" aria-label="Copiar de outro perfil"><SelectValue placeholder="Copiar de outro perfil..." /></SelectTrigger>
                <SelectContent>{PERFIS.filter((p) => p !== selectedPerfil).map((p) => <SelectItem key={p} value={p}>{PERFIL_LABELS[p]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {!loading && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[["Módulos visíveis", `${perfilSummary.view}/${editableModules.length}`], ["Com acesso total", perfilSummary.total], ["Podem excluir", perfilSummary.del], ["Regras próprias da unidade", unidadeScope ? perfilSummary.local : "—"]].map(([l, v]) => (
                <Card key={l as string}><CardContent className="p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="text-xl font-semibold">{v}</div></CardContent></Card>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : (
            <Accordion type="multiple" className="space-y-5">
              {visibleGroups.map((group) => <div key={group.label} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold text-muted-foreground">{group.label}</h2><PresetButtons target="perfil" modulos={group.modules} compact /></div>
                {group.modules.map((modulo) => {
                const row = getPerfilRow(modulo);
                const isUnidade = unidadeScope !== "" && row?.unidade_id === unidadeScope;
                return (
                  <AccordionItem key={modulo} value={modulo} className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3 flex-1">
                        <span className="font-medium">{MODULO_LABELS[modulo]}</span>
                        <ActionChips perm={row} />
                        {!isUnidade && row && <Badge variant="outline" className="text-xs">Global</Badge>}
                        {isUnidade && <Badge variant="secondary" className="text-xs">Unidade</Badge>}
                        {ROUTE_DEPENDENCIES[modulo] && <Badge variant="outline" className="text-xs">Informativo</Badge>}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      {ROUTE_DEPENDENCIES[modulo] && <p className="text-sm text-muted-foreground py-2">{ROUTE_DEPENDENCIES[modulo]}</p>}
                      {SUBMODULE_HINT(modulo) && <p className="text-xs text-muted-foreground">{SUBMODULE_HINT(modulo)}</p>}
                      {!ROUTE_DEPENDENCIES[modulo] && <div className="py-2"><PresetButtons target="perfil" modulos={[modulo]} /></div>}
                      {modulo === "agenda" && <p className="text-xs text-muted-foreground">Inclui o acesso à página Exames Diagnósticos.</p>}
                      {modulo === "usuarios" && <p className="text-xs text-muted-foreground">Acessos ao Portal exige também perfil Master.</p>}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 py-2">
                        {ACTIONS.map((action) => {
                          const k = `perfil-${modulo}-${action}`;
                          const isLoading = saving === k;
                          return (
                            <label key={action} className="flex items-center gap-2 cursor-pointer">
                              <Switch
                                checked={!!row?.[action]}
                                onCheckedChange={() => togglePerfil(modulo, action)}
                                disabled={!!saving || !!ROUTE_DEPENDENCIES[modulo]}
                                aria-label={`${ACTION_LABELS[action]} em ${MODULO_LABELS[modulo]}`}
                              />
                              <span className="text-sm">{ACTION_LABELS[action]}</span>
                              {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                            </label>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
                })}
              </div>)}
            </Accordion>
          )}
        </TabsContent>

        {/* ===== ABA INDIVIDUAL ===== */}
        <TabsContent value="individual" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserIcon className="w-4 h-4" /> Selecionar funcionário
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  aria-label="Buscar funcionário"
                  placeholder="Buscar por nome, usuário ou perfil..."
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
                      className="w-full text-left px-3 py-2 hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">{f.nome}</div>
                        <div className="text-xs text-muted-foreground">{f.usuario} · {PERFIL_LABELS[normalizeRoleKey(f.role)] || f.role.toUpperCase()}</div>
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
                      {selectedUser.usuario} · Perfil base: <Badge variant="outline">{PERFIL_LABELS[normalizeRoleKey(selectedUser.role)] || selectedUser.role}</Badge>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={resetAllUserOverrides} disabled={!!saving || !canWriteScope}><RotateCcw className="w-3 h-3 mr-1" />Redefinir exceções</Button>
                    <Button variant="ghost" size="sm" onClick={() => { setSelectedUserId(""); setUserBaseRows([]); setUserRows([]); }}>Trocar</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {selectedUserId && (
            loading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : (
              <Accordion type="multiple" className="space-y-5">
                {visibleGroups.map((group) => <div key={group.label} className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold text-muted-foreground">{group.label}</h2>{selectedUserRoleKey !== "master" && <PresetButtons target="user" modulos={group.modules} compact />}</div>
                  {group.modules.map((modulo) => {
                  const override = getUserOverrideRow(modulo);
                  const base = getUserBaseRow(modulo);
                  const effective = getUserEffectiveRow(modulo);
                  return (
                    <AccordionItem key={modulo} value={modulo} className="border rounded-lg px-4">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3 flex-1">
                          <span className="font-medium">{MODULO_LABELS[modulo]}</span>
                          {override ? (
                            <>
                              <ActionChips perm={effective} />
                              <Badge variant="secondary" className="text-xs">{override.unidade_id === "" ? "Exceção global" : "Exceção da unidade"}</Badge>
                            </>
                          ) : (
                            <><ActionChips perm={effective} /><Badge variant="outline" className="text-xs">Herda do perfil</Badge></>
                          )}
                          {ROUTE_DEPENDENCIES[modulo] && <Badge variant="outline" className="text-xs">Informativo</Badge>}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        {ROUTE_DEPENDENCIES[modulo] && <p className="text-sm text-muted-foreground py-2">{ROUTE_DEPENDENCIES[modulo]}</p>}
                        {SUBMODULE_HINT(modulo) && <p className="text-xs text-muted-foreground">{SUBMODULE_HINT(modulo)}</p>}
                        {!ROUTE_DEPENDENCIES[modulo] && selectedUserRoleKey !== "master" && <div className="py-2"><PresetButtons target="user" modulos={[modulo]} /></div>}
                        {selectedUserRoleKey === "master" && <p className="text-sm text-muted-foreground py-2">Master tem acesso total independentemente destas exceções.</p>}
                        {!ROUTE_DEPENDENCIES[modulo] && selectedUserRoleKey !== "master" && <p className="text-xs text-muted-foreground py-1">Ao criar uma exceção, as cinco ações deste módulo ficam definidas para o funcionário.</p>}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 py-2">
                          {ACTIONS.map((action) => {
                            const k = `user-${modulo}-${action}`;
                            const isLoading = saving === k;
                            return (
                              <label key={action} className="flex items-center gap-2 cursor-pointer">
                                <Switch
                                  checked={!!effective?.[action]}
                                  onCheckedChange={() => toggleUser(modulo, action)}
                                  disabled={!!saving || !!ROUTE_DEPENDENCIES[modulo] || selectedUserRoleKey === "master"}
                                  aria-label={`${ACTION_LABELS[action]} em ${MODULO_LABELS[modulo]} para o funcionário selecionado`}
                                />
                                <span className="text-sm">{ACTION_LABELS[action]}</span>
                                {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                              </label>
                            );
                          })}
                        </div>
                        {base && (
                          <div className="pt-2 text-xs text-muted-foreground">
                            Base do perfil: {ACTIONS.filter((a) => base[a]).length}/5 ativos
                          </div>
                        )}
                        {override?.unidade_id === unidadeScope && (
                          <div className="pt-2 border-t mt-2">
                            <Button variant="ghost" size="sm" onClick={() => resetUserOverride(modulo)}
                              disabled={!!saving}>
                              {saving === `user-reset-${modulo}` ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                              Remover exceção (voltar ao perfil)
                            </Button>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  );
                  })}
                </div>)}
              </Accordion>
            )
          )}
        </TabsContent>
      </Tabs>
      )}
    </div>
  );
};

export default Permissoes;

