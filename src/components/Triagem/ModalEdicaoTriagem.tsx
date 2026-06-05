import React, { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, X, Save } from "lucide-react";
import { MANCHESTER_LEVELS } from "@/lib/manchesterProtocol";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import CustomFieldsRenderer from "@/components/CustomFieldsRenderer";
import { useCustomFields } from "@/hooks/useCustomFields";

interface ModalEdicaoTriagemProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: any;
  onSuccess: () => void;
}

const COMORBIDADES_COMUNS = [
  "Hipertensão", "Diabetes", "Cardiopatia", "Asma", "DPOC", "Obesidade",
  "Dislipidemia", "Hipotireoidismo", "Hipertireoidismo", "Insuficiência Renal",
  "Hepatopatia", "Câncer", "Depressão", "Ansiedade", "TEA", "TDAH", "AVC prévio", "IAM prévio",
];

const SINTOMAS_ACOLHIMENTO = [
  "alucinação", "delírios", "labilidade emocional", "embotamento afetivo", 
  "pensamento e fala alterada", "aparência alterada", "tristeza", "medo", 
  "ansiedade", "nervosismo", "falta de prazer", "perda de interesse", 
  "insônia ou sono alterado", "culpa", "agressividade", "raiva", 
  "pensamentos negativos", "autoagressão", "choro", "dificuldades em tomar decisões", 
  "baixa autoestima", "alteração do apetite", "preocupação", "tremor", 
  "falta de ar", "dor de cabeça", "tontura", "palpitação", 
  "desconforto abdominal", "cansaço", "inquietação", "angústia", 
  "irritabilidade", "memória alterada", "atenção e concentração alterada", 
  "orientação alterada de tempo e espaço", "presença de pensamento de morte"
];

export const ModalEdicaoTriagem: React.FC<ModalEdicaoTriagemProps> = ({ open, onOpenChange, record, onSuccess }) => {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({
    peso: "", altura: "", pressaoArterial: "", temperatura: "", frequenciaCardiaca: "", saturacaoOxigenio: "", glicemia: "",
    dor: 0, classificacaoRisco: "", queixaPrincipal: "", historicoQueixa: "", alergias: [], medicamentos: [], comorbidades: [], sintomas30Dias: [], observacoes: ""
  });
  const [customData, setCustomData] = useState<Record<string, any>>({});
  const [newAlergia, setNewAlergia] = useState("");
  const [newMedicamento, setNewMedicamento] = useState("");

  const { resolved: customConfig } = useCustomFields('triagem');

  useEffect(() => {
    if (record && open) {
      const cd = record.custom_data || {};
      setForm({
        peso: record.peso?.toString() || "",
        altura: record.altura?.toString() || "",
        pressaoArterial: record.pressao_arterial || "",
        temperatura: record.temperatura?.toString() || "",
        frequenciaCardiaca: record.frequencia_cardiaca?.toString() || "",
        saturacaoOxigenio: record.saturacao_oxigenio?.toString() || "",
        glicemia: record.glicemia?.toString() || "",
        dor: cd.dor || 0,
        classificacaoRisco: record.classificacao_risco || "",
        queixaPrincipal: record.queixa || "",
        historicoQueixa: cd.historico_queixa || "",
        alergias: record.alergias || [],
        medicamentos: record.medicamentos || [],
        comorbidades: cd.comorbidades || [],
        sintomas30Dias: cd.sintomas_30_dias || [],
        observacoes: record.observacoes || ""
      });
      
      const newCustomData = { ...cd };
      delete newCustomData.dor;
      delete newCustomData.historico_queixa;
      delete newCustomData.comorbidades;
      delete newCustomData.sintomas_30_dias;
      setCustomData(newCustomData);
    }
  }, [record, open]);

  const imc = useMemo(() => {
    const peso = parseFloat(form.peso);
    const altura = parseFloat(form.altura) / 100;
    if (isNaN(peso) || isNaN(altura) || altura === 0) return null;
    return (peso / (altura * altura)).toFixed(2);
  }, [form.peso, form.altura]);

  const handleSave = async () => {
    if (!form.classificacaoRisco) {
      toast.error("Selecione a Classificação de Risco.");
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        peso: form.peso ? parseFloat(form.peso) : null,
        altura: form.altura ? parseFloat(form.altura) : null,
        pressao_arterial: form.pressaoArterial || null,
        temperatura: form.temperatura ? parseFloat(form.temperatura) : null,
        frequencia_cardiaca: form.frequenciaCardiaca ? parseInt(form.frequenciaCardiaca) : null,
        saturacao_oxigenio: form.saturacaoOxigenio ? parseInt(form.saturacaoOxigenio) : null,
        glicemia: form.glicemia ? parseFloat(form.glicemia) : null,
        imc: imc ? parseFloat(imc) : null,
        alergias: form.alergias,
        medicamentos: form.medicamentos,
        queixa: form.queixaPrincipal || null,
        classificacao_risco: form.classificacaoRisco,
        observacoes: form.observacoes || "",
        custom_data: {
          ...customData,
          dor: form.dor,
          comorbidades: form.comorbidades,
          historico_queixa: form.historicoQueixa,
          sintomas_30_dias: form.sintomas30Dias,
          atualizado_em: new Date().toISOString()
        }
      };

      const { error } = await supabase
        .from("triage_records")
        .update(payload)
        .eq("id", record.id);

      if (error) throw error;

      toast.success("Triagem atualizada com sucesso!");
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao atualizar triagem:", error);
      toast.error("Erro ao salvar alterações.");
    } finally {
      setSaving(false);
    }
  };

  const addAlergia = () => {
    if (newAlergia.trim() && !form.alergias.includes(newAlergia.trim())) {
      setForm((p: any) => ({ ...p, alergias: [...p.alergias, newAlergia.trim()] }));
      setNewAlergia("");
    }
  };

  const addMedicamento = () => {
    if (newMedicamento.trim() && !form.medicamentos.includes(newMedicamento.trim())) {
      setForm((p: any) => ({ ...p, medicamentos: [...p.medicamentos, newMedicamento.trim()] }));
      setNewMedicamento("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Triagem — {record?.pacienteNome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <Label>Peso (kg)</Label>
              <Input type="number" step="0.01" value={form.peso} onChange={(e) => setForm((p: any) => ({ ...p, peso: e.target.value }))} />
            </div>
            <div>
              <Label>Altura (cm)</Label>
              <Input type="number" value={form.altura} onChange={(e) => setForm((p: any) => ({ ...p, altura: e.target.value }))} />
            </div>
            <div>
              <Label>IMC</Label>
              <div className="mt-1 rounded-lg bg-muted p-2 text-sm font-semibold">{imc || "—"}</div>
            </div>
            <div>
              <Label>Pressão Arterial</Label>
              <Input value={form.pressaoArterial} onChange={(e) => setForm((p: any) => ({ ...p, pressaoArterial: e.target.value }))} />
            </div>
            <div>
              <Label>Temperatura (°C)</Label>
              <Input type="number" step="0.1" value={form.temperatura} onChange={(e) => setForm((p: any) => ({ ...p, temperatura: e.target.value }))} />
            </div>
            <div>
              <Label>FC (bpm)</Label>
              <Input type="number" value={form.frequenciaCardiaca} onChange={(e) => setForm((p: any) => ({ ...p, frequenciaCardiaca: e.target.value }))} />
            </div>
            <div>
              <Label>SatO2 (%)</Label>
              <Input type="number" value={form.saturacaoOxigenio} onChange={(e) => setForm((p: any) => ({ ...p, saturacaoOxigenio: e.target.value }))} />
            </div>
            <div>
              <Label>Glicemia (mg/dL)</Label>
              <Input type="number" step="0.01" value={form.glicemia} onChange={(e) => setForm((p: any) => ({ ...p, glicemia: e.target.value }))} />
            </div>
          </div>

          <div>
            <Label className="text-sm font-semibold">Escala de Dor (0-10): {form.dor}</Label>
            <Slider value={[form.dor]} onValueChange={(v) => setForm((p: any) => ({ ...p, dor: v[0] }))} max={10} min={0} step={1} className="mt-2" />
          </div>

          <div>
            <Label className="text-sm font-semibold">Classificação de Risco (Manchester)</Label>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {MANCHESTER_LEVELS.map((m) => {
                const isSelected = form.classificacaoRisco === m.level;
                return (
                  <button
                    key={m.level}
                    type="button"
                    onClick={() => setForm((p: any) => ({ ...p, classificacaoRisco: m.level }))}
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 p-2 transition-all text-center ${isSelected ? 'border-[3px] shadow-sm' : 'border-muted hover:border-muted-foreground/30'}`}
                    style={{ borderColor: isSelected ? m.color : undefined, backgroundColor: isSelected ? `${m.color}15` : undefined }}
                  >
                    <span className="text-[10px] font-bold" style={{ color: m.color }}>{m.label}</span>
                    <span className="text-[9px] leading-tight">{m.subtitle}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label>Queixa Principal</Label>
              <Textarea rows={2} value={form.queixaPrincipal} onChange={(e) => setForm((p: any) => ({ ...p, queixaPrincipal: e.target.value }))} />
            </div>
            <div>
              <Label>Histórico (HDA)</Label>
              <Textarea rows={3} value={form.historicoQueixa} onChange={(e) => setForm((p: any) => ({ ...p, historicoQueixa: e.target.value }))} />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold mb-2 block">Sintomas (30 dias)</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {SINTOMAS_ACOLHIMENTO.map((s) => {
                const checked = form.sintomas30Dias.includes(s);
                return (
                  <label key={s} className={`flex items-center gap-2 rounded border px-2 py-1 text-[10px] cursor-pointer ${checked ? "border-primary bg-primary/5 text-primary" : "border-border"}`}>
                    <input type="checkbox" checked={checked} onChange={() => setForm((p: any) => ({ ...p, sintomas30Dias: checked ? p.sintomas30Dias.filter((x: any) => x !== s) : [...p.sintomas30Dias, s] }))} />
                    <span className="capitalize">{s}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Alergias</Label>
              <div className="mt-1 flex gap-2">
                <Input value={newAlergia} onChange={(e) => setNewAlergia(e.target.value)} placeholder="Nova..." onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAlergia())} />
                <Button variant="outline" size="icon" onClick={addAlergia}><Plus className="h-4 w-4" /></Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {form.alergias.map((a: string, i: number) => (
                  <Badge key={i} variant="destructive" className="text-[10px]">{a} <button onClick={() => setForm((p: any) => ({ ...p, alergias: p.alergias.filter((_: any, j: number) => j !== i) }))}><X className="ml-1 h-2 w-2" /></button></Badge>
                ))}
              </div>
            </div>
            <div>
              <Label>Medicamentos</Label>
              <div className="mt-1 flex gap-2">
                <Input value={newMedicamento} onChange={(e) => setNewMedicamento(e.target.value)} placeholder="Novo..." onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMedicamento())} />
                <Button variant="outline" size="icon" onClick={addMedicamento}><Plus className="h-4 w-4" /></Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {form.medicamentos.map((m: string, i: number) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">{m} <button onClick={() => setForm((p: any) => ({ ...p, medicamentos: p.medicamentos.filter((_: any, j: number) => j !== i) }))}><X className="ml-1 h-2 w-2" /></button></Badge>
                ))}
              </div>
            </div>
          </div>

          {customConfig.fields.length > 0 && (
            <CustomFieldsRenderer
              fields={customConfig.fields}
              values={customData}
              onChange={(field, value) => setCustomData(prev => ({ ...prev, [field]: value }))}
            />
          )}

          <div>
            <Label>Observações Gerais</Label>
            <Textarea rows={2} value={form.observacoes} onChange={(e) => setForm((p: any) => ({ ...p, observacoes: e.target.value }))} />
          </div>
        </div>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button className="bg-success text-white hover:bg-success/90" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar Alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};