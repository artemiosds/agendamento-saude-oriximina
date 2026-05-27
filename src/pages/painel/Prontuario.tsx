import React, { useState, useMemo, useEffect } from "react";
import { useProntuarioConfig } from "@/hooks/useProntuarioConfig";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DebouncedTextarea } from "@/components/ui/debounced-textarea";
import { DebouncedInput } from "@/components/ui/debounced-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle, Plus, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import CamposEspecialidade from "@/components/CamposEspecialidade";
import { Checkbox } from "@/components/ui/checkbox";

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
  const [records, setRecords] = useState<any[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);

  const fetchRecords = async () => {
    setLoadingRecords(true);
    const { data } = await supabase
      .from("prontuarios")
      .select("*")
      .order("criado_em", { ascending: false })
      .limit(10);
    if (data) setRecords(data);
    setLoadingRecords(false);
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const { visibleBlocks, isBlocoVisible, tipoNormalized } = useProntuarioConfig(
    user?.id,
    form.tipo_registro,
    user?.profissao,
  );

  useEffect(() => {
    if (!editId) return;
    const fetchRecord = async () => {
      const { data } = await supabase
        .from("prontuarios")
        .select("*")
        .eq("id", editId)
        .maybeSingle();
      
      if (data) {
        setForm({
          paciente_id: data.paciente_id || "",
          paciente_nome: data.paciente_nome || "",
          data_atendimento: data.data_atendimento || "",
          hora_atendimento: data.hora_atendimento || "",
          tipo_registro: data.tipo_registro || "avaliacao_inicial",
          queixa_principal: data.queixa_principal || "",
          anamnese: data.anamnese || "",
          sinais_sintomas: data.sinais_sintomas || "",
          exame_fisico: data.exame_fisico || "",
          hipotese: data.hipotese || "",
          conduta: data.conduta || "",
          prescricao: data.prescricao || "",
          solicitacao_exames: data.solicitacao_exames || "",
          evolucao: data.evolucao || "",
          observacoes: data.observacoes || "",
          resultado_exame: data.resultado_exame || "",
          indicacao_retorno: data.indicacao_retorno || "",
          soap_subjetivo: data.soap_subjetivo || "",
          soap_objetivo: data.soap_objetivo || "",
          soap_avaliacao: data.soap_avaliacao || "",
          soap_plano: data.soap_plano || "",
        });
        
        const cData = data.custom_data || {};
        const espFields: Record<string, string> = {};
        const otherFields: Record<string, any> = {};
        
        Object.entries(cData).forEach(([k, v]) => {
          if (k.startsWith("esp_")) {
            espFields[k] = String(v);
          } else {
            otherFields[k] = v;
          }
        });
        
        setCustomData(otherFields);
        setEspecialidadeFields(espFields);
      }
    };
    fetchRecord();
  }, [editId]);

  const handleFieldChange = (key: string, value: any) => {
    if (PRONTUARIO_COLUMNS.includes(key)) {
      setForm((prev) => ({ ...prev, [key]: value }));
    } else {
      setCustomData((prev) => ({ ...prev, [key]: value }));
    }
  };

  const getFieldValue = (key: string): any => {
    if (PRONTUARIO_COLUMNS.includes(key)) return (form as any)[key] || "";
    return customData[key] ?? "";
  };

  const renderField = (bloco: any) => {
    const fieldKey = bloco.id.replace("evolucao.", "");
    const value = getFieldValue(fieldKey);
    const tipo = bloco.tipo || 'textarea';

    switch (tipo) {
      case 'textarea':
        return (
          <DebouncedTextarea
            rows={3}
            value={value}
            onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
            placeholder={`${bloco.label}...`}
            className="text-sm"
          />
        );
      case 'number':
        return (
          <DebouncedInput
            type="number"
            value={value}
            onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
            placeholder={`${bloco.label}...`}
            className="text-sm"
          />
        );
      case 'select':
        return (
          <Select value={value} onValueChange={(v) => handleFieldChange(fieldKey, v)}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {bloco.opcoes?.map((opt: string) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'checkbox':
        return (
          <div className="flex items-center gap-2">
            <Checkbox
              checked={!!value}
              onCheckedChange={(checked) => handleFieldChange(fieldKey, checked)}
            />
            <span className="text-sm">{bloco.label}</span>
          </div>
        );
      default:
        return (
          <DebouncedInput
            value={value}
            onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
            placeholder={`${bloco.label}...`}
            className="text-sm"
          />
        );
    }
  };

  const renderDynamicBlocks = () => {
    return visibleBlocks.map((bloco) => {
      if (bloco.id === "especialidade") return null;
      if (bloco.id === "soap") {
        // Render SOAP individual fields if they are visible
        return null; 
      }
      
      return (
        <div key={bloco.id} className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider">
            {bloco.label}
            {(bloco.obrigatorio || bloco.admin_obrigatorio) && (
              <span className="text-destructive ml-0.5">*</span>
            )}
          </Label>
          {renderField(bloco)}
          {bloco.ajuda && <p className="text-[10px] text-muted-foreground italic">💡 {bloco.ajuda}</p>}
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
      fetchRecords();
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
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="w-6 h-6 text-primary" />
          Prontuários
        </h1>
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 mr-2" /> Novo Prontuário
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {loadingRecords ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : records.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhum prontuário encontrado.</p>
        ) : (
          records.map((r) => (
            <Card key={r.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-foreground">{r.paciente_nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {TIPOS.find(t => t.value === r.tipo_registro)?.label || r.tipo_registro} • {new Date(r.data_atendimento).toLocaleDateString()}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => {
                  setEditId(r.id);
                  setDialogOpen(true);
                }}>
                  Visualizar/Editar
                </Button>
              </CardContent>
            </Card>
          ))
        )}
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
                <DebouncedInput
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
                  tipoProntuario={tipoNormalized}
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
