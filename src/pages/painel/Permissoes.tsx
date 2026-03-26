import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ModuleName, ModulePermission } from "@/contexts/PermissionsContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield, ShieldCheck, AlertCircle } from "lucide-react";
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
  "pacientes",
  "encaminhamento",
  "fila",
  "triagem",
  "enfermagem",
  "agenda",
  "atendimento",
  "prontuario",
  "tratamento",
  "relatorios",
  "usuarios",
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
const ACTION_LABELS: Record<keyof ModulePermission, string> = {
  can_view: "Visualizar",
  can_create: "Criar",
  can_edit: "Editar",
  can_delete: "Excluir",
  can_execute: "Executar",
};

interface PermRow {
  id: string;
  perfil: string;
  modulo: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_execute: boolean;
}

const Permissoes: React.FC = () => {
  const { hasPermission } = useAuth();
  const [selectedPerfil, setSelectedPerfil] = useState<string>(PERFIS[0]); // ← alterado para primeiro perfil
  const [rows, setRows] = useState<PermRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<{ modulo: string; action: string } | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("permissoes").select("*").eq("perfil", selectedPerfil);
      if (error) throw error;
      setRows(data || []);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar permissões");
    } finally {
      setLoading(false);
    }
  }, [selectedPerfil]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  if (!hasPermission(["master"])) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Shield className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
        <p>Acesso restrito ao perfil MASTER.</p>
      </div>
    );
  }

  const getRow = (modulo: ModuleName): PermRow | undefined => rows.find((r) => r.modulo === modulo);

  const toggle = async (modulo: ModuleName, action: keyof ModulePermission) => {
    const row = getRow(modulo);
    if (!row || saving) return;
    const newVal = !row[action];

    setSaving({ modulo, action });

    // Optimistic update
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [action]: newVal } : r)));

    const { error } = await supabase
      .from("permissoes")
      .update({ [action]: newVal, updated_at: new Date().toISOString() })
      .eq("id", row.id);

    if (error) {
      // Rollback
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [action]: !newVal } : r)));
      toast.error(`Erro ao salvar permissão: ${error.message}`);
    } else {
      toast.success(`${MODULO_LABELS[modulo]} → ${ACTION_LABELS[action]}: ${newVal ? "ATIVADO" : "DESATIVADO"}`);
    }
    setSaving(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Configuração de Permissões</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">Perfil:</span>
        <Select value={selectedPerfil} onValueChange={setSelectedPerfil}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERFIS.map((p) => (
              <SelectItem key={p} value={p}>
                {PERFIL_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline" className="gap-1">
          <ShieldCheck className="w-3 h-3" />
          MASTER tem acesso total (não editável)
        </Badge>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className="grid gap-4">
          {MODULOS.map((modulo) => {
            const row = getRow(modulo);
            if (!row) return null;
            return (
              <Card key={modulo}>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-base">{MODULO_LABELS[modulo]}</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <div className="flex flex-wrap gap-6">
                    {(Object.keys(ACTION_LABELS) as (keyof ModulePermission)[]).map((action) => (
                      <label key={action} className="flex items-center gap-2 cursor-pointer select-none">
                        <Switch
                          checked={row[action]}
                          onCheckedChange={() => toggle(modulo, action)}
                          disabled={saving?.modulo === modulo && saving?.action === action}
                        />
                        <span className="text-sm">{ACTION_LABELS[action]}</span>
                      </label>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Permissoes;
