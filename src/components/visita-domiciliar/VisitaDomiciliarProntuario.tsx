import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent } from "@/components/ui/card";
import { Printer, Save, Loader2, Home, User, Calendar, MapPin, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import MedidasCadeiraRodasForm from "./MedidasCadeiraRodasForm";
import { generateVisitaDomiciliarHtml } from "./VisitaDomiciliarPdf";
import { printViaIframe } from "@/lib/printLayout";

interface VisitaDomiciliarProntuarioProps {
  atendimento_id?: string;
  prontuario_id?: string;
  paciente: any;
  profissional: any;
  unidade: any;
  onClose?: () => void;
  onSaveSuccess?: () => void;
}

const VisitaDomiciliarProntuario: React.FC<VisitaDomiciliarProntuarioProps> = ({
  atendimento_id,
  prontuario_id,
  paciente,
  profissional,
  unidade,
  onClose,
  onSaveSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    evolucao_visita: "",
    conduta_orientacoes: "",
    observacoes: "",
    tipo_visita: "geral", 
    medidas: {
      diagnostico_condicao: "",
      motivo_solicitacao: "",
      controle_cervical: "",
      controle_tronco: "",
      equilibrio_sentado: "",
      mobilidade_membros_superiores: "",
      mobilidade_membros_inferiores: "",
      deformidades: "",
      contraturas: "",
      risco_lesao_pressao: "",
      tipo_cadeira_indicada: "",
      largura_assento: "",
      profundidade_assento: "",
      altura_encosto: "",
      altura_apoio_braco: "",
      altura_apoio_pes: "",
      altura_poplitea: "",
      comprimento_coxa: "",
      altura_tronco: "",
      adaptacoes_necessarias: "",
      justificativa_tecnica: "",
      orientacoes: "",
      parecer_profissional: "",
      observacoes_gerais: ""
    } as Record<string, string>
  });

  useEffect(() => {
    const loadData = async () => {
      if (!atendimento_id && !prontuario_id) return;
      setLoading(true);
      try {
        const query = supabase
          .from("prontuarios")
          .select("custom_data, evolucao, conduta, observacoes");
        
        if (prontuario_id) {
          query.eq("id", prontuario_id);
        } else {
          query.eq("agendamento_id", atendimento_id as string);
        }

        const { data, error } = await query.maybeSingle();

        if (data?.custom_data && typeof data.custom_data === 'object') {
          const custom = data.custom_data as any;
          if (custom.visita_domiciliar) {
            setFormData(custom.visita_domiciliar);
          }
        } else if (data) {
          setFormData(prev => ({
            ...prev,
            evolucao_visita: data.evolucao || "",
            conduta_orientacoes: data.conduta || "",
            observacoes: data.observacoes || ""
          }));
        }
      } catch (err) {
        console.error("Erro ao carregar visita domiciliar:", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [atendimento_id, prontuario_id]);

  const handleSave = async (silent = false) => {
    if (!atendimento_id && !prontuario_id) return;
    setSaving(true);
    try {
      const payload: any = {
        evolucao: formData.evolucao_visita,
        conduta: formData.conduta_orientacoes,
        observacoes: formData.observacoes,
        tipo_registro: "visita_domiciliar",
        custom_data: {
          visita_domiciliar: formData
        }
      };

      let result;
      if (prontuario_id) {
        result = await supabase
          .from("prontuarios")
          .update(payload)
          .eq("id", prontuario_id);
      } else {
        const { data: existing } = await supabase
          .from("prontuarios")
          .select("id")
          .eq("agendamento_id", atendimento_id as string)
          .maybeSingle();

        if (existing) {
          result = await supabase
            .from("prontuarios")
            .update(payload)
            .eq("id", existing.id);
        } else {
          result = await supabase
            .from("prontuarios")
            .insert({
              ...payload,
              agendamento_id: atendimento_id,
              paciente_id: paciente.id,
              profissional_id: profissional.id,
              unidade_id: unidade.id,
              data_atendimento: new Date().toISOString().split("T")[0],
              hora_atendimento: new Date().toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })
            });
        }
      }

      if (result.error) throw result.error;
      if (!silent) toast.success("Visita domiciliar salva com sucesso!");
      onSaveSuccess?.();
    } catch (err) {
      console.error("Erro ao salvar visita:", err);
      toast.error("Erro ao salvar visita domiciliar.");
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = async () => {
    const dataForPdf = {
      ...formData,
      paciente_nome: paciente.nome,
      paciente_cpf: paciente.cpf,
      paciente_cns: paciente.cns,
      paciente_data_nascimento: paciente.data_nascimento,
      paciente_sexo: paciente.sexo,
      profissional_id: profissional.id,
      profissional_nome: profissional.nome,
      profissional_conselho: profissional.numero_conselho,
      profissional_tipo_conselho: profissional.tipo_conselho,
      profissional_uf_conselho: profissional.uf_conselho,
      profissional_profissao: profissional.profissao || profissional.cargo,
      unidade_nome: unidade.nome,
      data_atendimento: new Date().toISOString().split("T")[0]
    };

    try {
      const html = await generateVisitaDomiciliarHtml(dataForPdf);
      printViaIframe(html);
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
      toast.error("Erro ao gerar PDF da visita.");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground italic">Carregando prontuário de visita...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-1">
      <Card className="border-primary/20 shadow-sm">
        <CardContent className="p-4 bg-muted/5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Paciente</p>
                <p className="text-sm font-semibold truncate">{paciente.nome}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Data da Visita</p>
                <p className="text-sm font-semibold">{new Date().toLocaleDateString("pt-BR")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Profissional</p>
                <p className="text-sm font-semibold truncate">{profissional.nome}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Unidade</p>
                <p className="text-sm font-semibold truncate">{unidade.nome}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label className="font-bold flex items-center gap-2">
              <Home className="w-4 h-4 text-primary" /> Evolução da visita
            </Label>
            <Textarea 
              placeholder="Descreva como foi a visita, estado do paciente no domicílio, intercorrências..."
              className="min-h-[120px]"
              value={formData.evolucao_visita}
              onChange={(e) => setFormData(p => ({ ...p, evolucao_visita: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label className="font-bold">Conduta / Orientações</Label>
            <Textarea 
              placeholder="Orientações passadas ao paciente/cuidador, condutas tomadas..."
              className="min-h-[100px]"
              value={formData.conduta_orientacoes}
              onChange={(e) => setFormData(p => ({ ...p, conduta_orientacoes: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label className="font-bold">Observações</Label>
            <Textarea 
              placeholder="Outras informações relevantes..."
              className="min-h-[80px]"
              value={formData.observacoes}
              onChange={(e) => setFormData(p => ({ ...p, observacoes: e.target.value }))}
            />
          </div>
        </div>

        <div className="space-y-4 border-t pt-4">
          <Label className="font-bold block mb-2 text-lg">Tipo de atendimento da visita</Label>
          <RadioGroup 
            value={formData.tipo_visita} 
            onValueChange={(v) => setFormData(p => ({ ...p, tipo_visita: v }))}
            className="flex flex-col space-y-2"
          >
            <div className="flex items-center space-x-2 p-2 rounded hover:bg-muted/50 cursor-pointer">
              <RadioGroupItem value="geral" id="v-geral" />
              <Label htmlFor="v-geral" className="cursor-pointer font-medium">Atendimento domiciliar geral</Label>
            </div>
            <div className="flex items-center space-x-2 p-2 rounded hover:bg-muted/50 cursor-pointer">
              <RadioGroupItem value="medidas_cadeira_rodas" id="v-medidas" />
              <Label htmlFor="v-medidas" className="cursor-pointer font-medium">Medidas para cadeira de rodas</Label>
            </div>
          </RadioGroup>
        </div>

        {formData.tipo_visita === "medidas_cadeira_rodas" && (
          <div className="space-y-6 mt-6 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/30 p-4 rounded-lg">
              <div className="space-y-2">
                <Label>Diagnóstico / Condição funcional</Label>
                <Input 
                  value={formData.medidas.diagnostico_condicao}
                  onChange={(e) => setFormData(p => ({ ...p, medidas: { ...p.medidas, diagnostico_condicao: e.target.value } }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Motivo da solicitação</Label>
                <Textarea 
                   value={formData.medidas.motivo_solicitacao}
                   onChange={(e) => setFormData(p => ({ ...p, medidas: { ...p.medidas, motivo_solicitacao: e.target.value } }))}
                   rows={1}
                />
              </div>
            </div>

            <MedidasCadeiraRodasForm 
              medidas={formData.medidas}
              onChange={(m) => setFormData(p => ({ ...p, medidas: { ...p.medidas, ...m } }))}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Justificativa técnica</Label>
                <Textarea 
                  value={formData.medidas.justificativa_tecnica}
                  onChange={(e) => setFormData(p => ({ ...p, medidas: { ...p.medidas, justificativa_tecnica: e.target.value } }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Parecer do profissional</Label>
                <Textarea 
                  value={formData.medidas.parecer_profissional}
                  onChange={(e) => setFormData(p => ({ ...p, medidas: { ...p.medidas, parecer_profissional: e.target.value } }))}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pt-6 border-t mt-8 sticky bottom-0 bg-background/80 backdrop-blur-sm p-4 -mx-4 rounded-b-lg">
        <Button 
          variant="outline" 
          onClick={handlePrint}
          className="flex-1"
        >
          <Printer className="w-4 h-4 mr-2" /> Imprimir PDF
        </Button>
        <Button 
          onClick={() => handleSave()}
          disabled={saving}
          className="flex-1 gradient-primary text-primary-foreground"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar Visita
        </Button>
      </div>
    </div>
  );
};

export default VisitaDomiciliarProntuario;
