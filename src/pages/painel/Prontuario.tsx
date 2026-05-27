import React, { useState, useMemo } from "react";
import { useProntuarioConfig } from "@/hooks/useProntuarioConfig";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DebouncedTextarea } from "@/components/ui/debounced-textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import CamposEspecialidade from "@/components/CamposEspecialidade";

const emptyForm = {
  paciente_id: "",
  paciente_nome: "",
  data_atendimento: new Date().toISOString().split("T")[0],
  hora_atendimento: "",
  tipo_registro: "avaliacao_inicial",
  queixa_principal: "",
  anamnese: "",
  sinais_sintomas: "",
  exame_fisico: "",
  hipotese: "",
  conduta: "",
  prescricao: "",
  solicitacao_exames: "",
  evolucao: "",
  observacoes: "",
  resultado_exame: "",
  indicacao_retorno: "",
  soap_subjetivo: "",
  soap_objetivo: "",
  soap_avaliacao: "",
  soap_plano: "",
};

const PRONTUARIO_COLUMNS = [
  "queixa_principal", "anamnese", "sinais_sintomas", "exame_fisico",
  "hipotese", "conduta", "evolucao", "prescricao", "solicitacao_exames",
  "observacoes", "resultado_exame", "indicacao_retorno",
  "soap_subjetivo", "soap_objetivo", "soap_avaliacao", "soap_plano",
];

const TIPOS = [
  { value: "avaliacao_inicial", label: "🟢 Avaliação Inicial" },
  { value: "retorno", label: "🔵 Retorno" },
  { value: "sessao", label: "🟡 Sessão" },
  { value: "urgencia", label: "🔴 Urgência" },
  { value: "procedimento", label: "🟣 Procedimento" },
];

const ProntuarioPage: React.FC = () => {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [customData, setCustomData] = useState<Record<string, any>>({});
  const [especialidadeFields, setEspecialidadeFields] = useState<Record<string, string>>({});

  const { visibleBlocks, isBlocoVisible } = useProntuarioConfig(
    user?.id,
    form.tipo_registro,
    user?.profissao,
  );

  const handleFieldChange = (key: string, value: any) => {
    if (PRONTUARIO_COLUMNS.includes(key)) {
      setForm((prev) => ({ ...prev, [key]: value }));
    } else {
      setCustomData((prev) => ({ ...prev, [key]: value }));
    }
  };

  const getFieldValue = (key: string): string => {
    if (PRONTUARIO_COLUMNS.includes(key)) return (form as any)[key] || "";
    return customData[key] || "";
  };

  const renderDynamicBlocks = () => {
    if (!visibleBlocks || visibleBlocks.length === 0) {
      return (
        <p className="text-xs text-muted-foreground italic">
          Nenhum campo configurado para este tipo de prontuário.
        </p>
      );
    }
    return visibleBlocks.map((bloco) => {
      if (
        bloco.id === "soap" ||
        bloco.id === "especialidade" ||
        bloco.id === "prescricao" ||
        bloco.id === "solicitacao_exames" ||
        bloco.id === "procedimentos"
      ) {
        return null;
      }
      const fieldKey = bloco.id.replace("evolucao.", "");
      return (
        <div key={bloco.id} className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider">
            {bloco.label}
            {(bloco.obrigatorio || bloco.admin_obrigatorio) && (
              <span className="text-destructive ml-0.5">*</span>
            )}
          </Label>
          <DebouncedTextarea
            rows={2}
            value={getFieldValue(fieldKey)}
            onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
            placeholder={`${bloco.label}...`}
            className="text-sm"
          />
        </div>
      );
    });
  };

  const handleSave = async () => {
    if (!form.paciente_nome || !form.data_atendimento) {
      toast.error("Paciente e data são obrigatórios.");
      return;
    }
    setSaving(true);
    try {
      const record: any = {
        ...form,
        paciente_id: form.paciente_id || `manual_${Date.now()}`,
        profissional_id: user?.id || "",
        profissional_nome: user?.nome || "",
        unidade_id: user?.unidadeId || "",
        setor: user?.setor || "",
        custom_data: { ...customData, ...especialidadeFields },
      };
      if (editId) {
        await supabase.from("prontuarios").update(record).eq("id", editId);
      } else {
        const { data } = await supabase.from("prontuarios").insert(record).select("id").single();
        if (data?.id) setEditId(data.id);
      }
      toast.success("Prontuário salvo!");
      setDialogOpen(false);
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err?.message || "desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm);
    setCustomData({});
    setEspecialidadeFields({});
    setDialogOpen(true);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Prontuários</h1>
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 mr-2" /> Novo Prontuário
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registro de Atendimento</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Paciente</Label>
                <input
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                  value={form.paciente_nome}
                  onChange={(e) => setForm((p) => ({ ...p, paciente_nome: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">Tipo de Registro</Label>
                <Select
                  value={form.tipo_registro}
                  onValueChange={(v) => setForm((p) => ({ ...p, tipo_registro: v }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="bg-muted/30 p-4 rounded-lg space-y-4">
              {renderDynamicBlocks()}

              {isBlocoVisible("especialidade") && user?.profissao && (
                <CamposEspecialidade
                  profissao={user.profissao}
                  profissionalId={user.id}
                  tipoProntuario={form.tipo_registro}
                  values={especialidadeFields}
                  onChange={(k, v) => setEspecialidadeFields((p) => ({ ...p, [k]: v }))}
                />
              )}
            </div>

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              {editId ? "Salvar Alterações" : "Registrar Prontuário"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProntuarioPage;
