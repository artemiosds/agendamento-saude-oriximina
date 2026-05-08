import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ModuleName, ModulePermission } from "@/contexts/PermissionsContext";
import { supabase } from "@/integrations/supabase/client";
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

const PERFIS = ["gestao", "recepcao", "tecnico", "enfermagem", "profissional"] as const;
const PERFIL_LABELS: Record<string, string> = {
  gestao: "GESTÃO",
  recepcao: "RECEPÇÃO",
  tecnico: "TRIAGEM",
  enfermagem: "ENFERMAGEM",
  profissional: "PROFISSIONAL",
};

const MODULOS: ModuleName[] = [
  "pacientes", "encaminhamento", "fila", "triagem", "enfermagem",
  "agenda", "atendimento", "prontuario", "tratamento", "relatorios", "usuarios",
];
const MODULO_LABELS: Record<ModuleName, string> = {
  pacientes: "Pacientes",
  encaminhamento: "Encaminhamento",
  fila: "Fila de Espera",
  triagem: "Triagem",
  enfermagem: "Enfermagem",
  agenda: "Agenda",
  atendimento: "Atendimento",
  prontuario: "Prontuário",
  tratamento: "Tratamento",
  relatorios: "Relatórios",
  usuarios: "Usuários",
};
const ACTIONS: (keyof ModulePermission)[] = ["can_view", "can_create", "can_edit", "can_delete", "can_execute"];
const ACTION_LABELS: Record<keyof ModulePermission, string> = {
  can_view: "Visualizar",
  can_create: "Criar",
  can_edit: "Editar",
  can_delete: "Excluir",
  can_execute: "Executar",
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
    const { data, error } = await (supabase as any)
      .from("permissoes")
      .select("*")
      .eq("perfil", selectedPerfil)
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
    return perfilRows.find((r) => r.modulo === modulo && r.unidade_id === selectedUnidade)
      || perfilRows.find((r) => r.modulo === modulo && r.unidade_id === "");
  };

  const togglePerfil = async (modulo: ModuleName, action: keyof ModulePermission) => {
    const existing = getPerfilRow(modulo);
    const baseRow: PermRow = existing
      ? { ...existing, unidade_id: selectedUnidade } // criar/atualizar para a unidade
      : { perfil: selectedPerfil, modulo, unidade_id: selectedUnidade,
          can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false };
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
          can_delete: updated.can_delete, can_execute: updated.can_execute },
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

  // ===== Helpers Individual =====
  const getUserRow = (modulo: ModuleName): UserPermRow | undefined =>
    userRows.find((r) => r.modulo === modulo);

  const toggleUser = async (modulo: ModuleName, action: keyof ModulePermission) => {
    if (!selectedUserId) return;
    const existing = getUserRow(modulo);
    // base = override existente OU permissão do perfil do usuário (para clonar)
    const userObj = funcionarios.find((f) => f.id === selectedUserId);
    let base: UserPermRow;
    if (existing) {
      base = { ...existing };
    } else {
      // clone do perfil
      const { data: perfilData } = await (supabase as any)
        .from("permissoes")
        .select("*")
        .eq("perfil", userObj?.role || "recepcao")
        .eq("modulo", modulo)
        .in("unidade_id", [selectedUnidade, ""]);
      const ref = (perfilData || []).find((r: any) => r.unidade_id === selectedUnidade)
        || (perfilData || []).find((r: any) => r.unidade_id === "");
      base = {
        user_id: selectedUserId, modulo, unidade_id: selectedUnidade,
        can_view: ref?.can_view ?? false, can_create: ref?.can_create ?? false,
        can_edit: ref?.can_edit ?? false, can_delete: ref?.can_delete ?? false,
        can_execute: ref?.can_execute ?? false,
      };
    }
    const newVal = !base[action];
    const updated: UserPermRow = { ...base, [action]: newVal };
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
        { user_id: selectedUserId, modulo, unidade_id: selectedUnidade,
          can_view: updated.can_view, can_create: updated.can_create, can_edit: updated.can_edit,
          can_delete: updated.can_delete, can_execute: updated.can_execute },
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
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="perfil">Permissões por Perfil</TabsTrigger>
          <TabsTrigger value="individual">Permissões Individuais</TabsTrigger>
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
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 py-2">
                        {ACTIONS.map((action) => {
                          const k = `perfil-${modulo}-${action}`;
                          const isLoading = saving === k;
                          return (
                            <label key={action} className="flex items-center gap-2 cursor-pointer">
                              <Switch
                                checked={!!row?.[action]}
                                onCheckedChange={() => togglePerfil(modulo, action)}
                                disabled={isLoading}
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
            </CardContent>
          </Card>

          {selectedUserId && (
            loading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : (
              <Accordion type="multiple" className="space-y-2">
                {MODULOS.map((modulo) => {
                  const override = getUserRow(modulo);
                  const activeCount = override ? ACTIONS.filter((a) => override[a]).length : 0;
                  return (
                    <AccordionItem key={modulo} value={modulo} className="border rounded-lg px-4">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3 flex-1">
                          <span className="font-medium">{MODULO_LABELS[modulo]}</span>
                          {override ? (
                            <>
                              <Badge variant="default">{activeCount}/5</Badge>
                              <Badge variant="secondary" className="text-xs">Exceção ativa</Badge>
                            </>
                          ) : (
                            <Badge variant="outline" className="text-xs">Herda do perfil</Badge>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 py-2">
                          {ACTIONS.map((action) => {
                            const k = `user-${modulo}-${action}`;
                            const isLoading = saving === k;
                            return (
                              <label key={action} className="flex items-center gap-2 cursor-pointer">
                                <Switch
                                  checked={!!override?.[action]}
                                  onCheckedChange={() => toggleUser(modulo, action)}
                                  disabled={isLoading}
                                />
                                <span className="text-sm">{ACTION_LABELS[action]}</span>
                                {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                              </label>
                            );
                          })}
                        </div>
                        {override && (
                          <div className="pt-2 border-t mt-2">
                            <Button variant="ghost" size="sm" onClick={() => resetUserOverride(modulo)}
                              disabled={saving === `user-reset-${modulo}`}>
                              {saving === `user-reset-${modulo}` ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                              Remover exceção (voltar ao perfil)
                            </Button>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
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
