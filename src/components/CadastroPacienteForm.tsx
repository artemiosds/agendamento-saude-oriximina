import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { User, Building2, Stethoscope, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const ESPECIALIDADES_DESTINO = [
  { value: "fisioterapia", label: "Fisioterapia" },
  { value: "fonoaudiologia", label: "Fonoaudiologia" },
  { value: "nutricao", label: "Nutrição" },
  { value: "psicologia", label: "Psicologia" },
  { value: "terapia_ocupacional", label: "Terapia Ocupacional" },
  { value: "outros", label: "Outros" },
];

const MUNICIPIOS = [
  "Oriximiná",
  "Óbidos",
  "Terra Santa",
  "Faro",
  "Juruti",
  "Nhamundá",
  "Parintins",
  "Santarém",
  "Alenquer",
  "Monte Alegre",
  "Outro",
];

const UBS_LIST = [
  "UBS Dr. Lauro Corrêa Pinto",
  "UBS Penta",
  "UBS Corino Guerreiro",
  "UBS Santa Luzia",
  "UBS Tânia Siqueira da Fonseca",
  "UBS Antônio Miléo",
  "Hospital Municipal de Oriximiná",
  "UBS Nossa Sra. das Graças",
  "UBS Fluvial Manoel Andrade"
  "UBS Ribeirinho"
  "Hospital Regional Menino Jesus"
];

const EQUIPAMENTOS_OPTIONS = ["Cadeira de rodas", "Andador", "Muleta", "Órtese", "Prótese", "Sonda", "Outro"];

export interface PacienteFormData {
  // Bloco 1 - Identificação
  nome: string;
  dataNascimento: string;
  cpf: string;
  cns: string;
  telefone: string;
  municipio: string;
  menorIdade: boolean;
  nomeResponsavel: string;
  cpfResponsavel: string;
  // Bloco 2 - Encaminhamento
  especialidadeDestino: string;
  ubsOrigem: string;
  profissionalSolicitante: string;
  tipoEncaminhamento: string;
  cid: string;
  diagnosticoResumido: string;
  justificativa: string;
  dataEncaminhamento: string;
  documentoUrl: string;
  // Bloco 3 - Clínico
  tipoCondicao: string;
  mobilidade: string;
  usaDispositivo: boolean;
  tipoDispositivo: string;
  comunicacao: string;
  comportamento: string;
  usaEquipamentos: boolean;
  equipamentos: string[];
  observacaoEquipamentos: string;
  outroServicoSus: boolean;
  transporte: string;
  turnoPreferido: string;
  // Legacy
  email: string;
  endereco: string;
  nomeMae: string;
  descricaoClinica: string;
}

export const emptyPacienteForm: PacienteFormData = {
  nome: "",
  dataNascimento: "",
  cpf: "",
  cns: "",
  telefone: "",
  municipio: "",
  menorIdade: false,
  nomeResponsavel: "",
  cpfResponsavel: "",
  especialidadeDestino: "",
  ubsOrigem: "",
  profissionalSolicitante: "",
  tipoEncaminhamento: "",
  cid: "",
  diagnosticoResumido: "",
  justificativa: "",
  dataEncaminhamento: "",
  documentoUrl: "",
  tipoCondicao: "",
  mobilidade: "",
  usaDispositivo: false,
  tipoDispositivo: "",
  comunicacao: "",
  comportamento: "",
  usaEquipamentos: false,
  equipamentos: [],
  observacaoEquipamentos: "",
  outroServicoSus: false,
  transporte: "",
  turnoPreferido: "",
  email: "",
  endereco: "",
  nomeMae: "",
  descricaoClinica: "",
};

interface Props {
  form: PacienteFormData;
  onChange: (form: PacienteFormData) => void;
  onSave: () => void;
  saving: boolean;
  isEdit: boolean;
  errors: Record<string, string>;
}

const CadastroPacienteForm: React.FC<Props> = ({ form, onChange, onSave, saving, isEdit, errors }) => {
  const set = (field: keyof PacienteFormData, value: any) => onChange({ ...form, [field]: value });
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Arquivo máximo: 5MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `documentos/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("sms").upload(path, file);
      if (error) throw error;
      set("documentoUrl", path);
      toast.success("Documento enviado!");
    } catch {
      toast.error("Erro ao enviar documento.");
    } finally {
      setUploading(false);
    }
  };

  const toggleEquipamento = (eq: string) => {
    const current = form.equipamentos;
    set("equipamentos", current.includes(eq) ? current.filter((e: string) => e !== eq) : [...current, eq]);
  };

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      {/* ═══ BLOCO 1 — IDENTIFICAÇÃO ═══ */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <User className="w-4 h-4" /> Identificação
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label>Nome completo *</Label>
            <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Nome do paciente" />
            {errors.nome && <p className="text-xs text-destructive mt-1">{errors.nome}</p>}
          </div>
          <div>
            <Label>Data nasc.</Label>
            <Input type="date" value={form.dataNascimento} onChange={(e) => set("dataNascimento", e.target.value)} />
          </div>
          <div>
            <Label>CPF</Label>
            <Input value={form.cpf} onChange={(e) => set("cpf", e.target.value)} placeholder="000.000.000-00" />
            {errors.cpf && <p className="text-xs text-destructive mt-1">{errors.cpf}</p>}
          </div>
          <div>
            <Label>CNS</Label>
            <Input value={form.cns} onChange={(e) => set("cns", e.target.value)} placeholder="Nº Cartão SUS" />
            {errors.cns && <p className="text-xs text-destructive mt-1">{errors.cns}</p>}
          </div>
          <div>
            <Label>Telefone</Label>
            <Input
              value={form.telefone}
              onChange={(e) => set("telefone", e.target.value)}
              placeholder="(93) 99999-0000"
            />
            {errors.telefone && <p className="text-xs text-destructive mt-1">{errors.telefone}</p>}
          </div>
          <div>
            <Label>Nome da Mãe</Label>
            <Input value={form.nomeMae} onChange={(e) => set("nomeMae", e.target.value)} placeholder="Nome da mãe" />
            {errors.nomeMae && <p className="text-xs text-destructive mt-1">{errors.nomeMae}</p>}
          </div>
          <div>
            <Label>Município</Label>
            <Select value={form.municipio || ""} onValueChange={(v) => set("municipio", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {MUNICIPIOS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.municipio && <p className="text-xs text-destructive mt-1">{errors.municipio}</p>}
          </div>
        </div>

        {/* Menor de idade toggle */}
        <div className="flex items-center gap-3 p-2 rounded-md bg-muted/40">
          <Switch checked={form.menorIdade} onCheckedChange={(v) => set("menorIdade", v)} id="menor" />
          <Label htmlFor="menor" className="text-sm cursor-pointer">
            Menor de idade?
          </Label>
        </div>
        {form.menorIdade && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-2 border-l-2 border-primary/20">
            <div>
              <Label>Nome responsável *</Label>
              <Input value={form.nomeResponsavel} onChange={(e) => set("nomeResponsavel", e.target.value)} />
              {errors.nomeResponsavel && <p className="text-xs text-destructive mt-1">{errors.nomeResponsavel}</p>}
            </div>
            <div>
              <Label>CPF responsável *</Label>
              <Input
                value={form.cpfResponsavel}
                onChange={(e) => set("cpfResponsavel", e.target.value)}
                placeholder="000.000.000-00"
              />
              {errors.cpfResponsavel && <p className="text-xs text-destructive mt-1">{errors.cpfResponsavel}</p>}
            </div>
          </div>
        )}
      </div>

      {/* ═══ BLOCO 2 — ENCAMINHAMENTO ═══ */}
      <div className="space-y-3 border-t pt-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Building2 className="w-4 h-4" /> Encaminhamento (UBS)
        </div>

        {/* ESPECIALIDADE DESTINO — OBRIGATÓRIO */}
        <div className="p-3 rounded-lg border-2 border-primary/30 bg-primary/5">
          <Label className="text-base font-semibold text-primary">Especialidade Destino</Label>
          <p className="text-xs text-muted-foreground mb-2">Define todo o fluxo do paciente no sistema</p>
          <Select value={form.especialidadeDestino || ""} onValueChange={(v) => set("especialidadeDestino", v)}>
            <SelectTrigger className="border-primary/30">
              <SelectValue placeholder="Selecione a especialidade" />
            </SelectTrigger>
            <SelectContent>
              {ESPECIALIDADES_DESTINO.map((e) => (
                <SelectItem key={e.value} value={e.value}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.especialidadeDestino && (
            <p className="text-xs text-destructive mt-1">{errors.especialidadeDestino}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>UBS origem</Label>
            <Select value={form.ubsOrigem || ""} onValueChange={(v) => set("ubsOrigem", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a UBS" />
              </SelectTrigger>
              <SelectContent>
                {UBS_LIST.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.ubsOrigem && <p className="text-xs text-destructive mt-1">{errors.ubsOrigem}</p>}
          </div>
          <div>
            <Label>Profissional solicitante</Label>
            <Input
              value={form.profissionalSolicitante}
              onChange={(e) => set("profissionalSolicitante", e.target.value)}
              placeholder="Nome do profissional"
            />
            {errors.profissionalSolicitante && (
              <p className="text-xs text-destructive mt-1">{errors.profissionalSolicitante}</p>
            )}
          </div>
          <div>
            <Label>Tipo encaminhamento</Label>
            <Select value={form.tipoEncaminhamento || ""} onValueChange={(v) => set("tipoEncaminhamento", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ubs">UBS</SelectItem>
                <SelectItem value="hospital">Hospital</SelectItem>
                <SelectItem value="caps">CAPS</SelectItem>
                <SelectItem value="espontaneo">Espontâneo</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>CID-10</Label>
            <Input value={form.cid} onChange={(e) => set("cid", e.target.value)} placeholder="Ex: G80.0" />
            {errors.cid && <p className="text-xs text-destructive mt-1">{errors.cid}</p>}
          </div>
          <div className="sm:col-span-2">
            <Label>Diagnóstico resumido</Label>
            <Input
              value={form.diagnosticoResumido}
              onChange={(e) => set("diagnosticoResumido", e.target.value)}
              placeholder="Resumo em uma linha"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Justificativa</Label>
            <Textarea
              value={form.justificativa}
              onChange={(e) => set("justificativa", e.target.value)}
              placeholder="Justificativa clínica para encaminhamento"
              className="min-h-[60px]"
            />
            {errors.justificativa && <p className="text-xs text-destructive mt-1">{errors.justificativa}</p>}
          </div>
          <div>
            <Label>Data encaminhamento</Label>
            <Input
              type="date"
              value={form.dataEncaminhamento}
              onChange={(e) => set("dataEncaminhamento", e.target.value)}
            />
          </div>
          <div>
            <Label>Documento</Label>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-md border border-input bg-background text-sm hover:bg-accent transition-colors">
                <Upload className="w-4 h-4" />
                {uploading ? "Enviando..." : form.documentoUrl ? "Arquivo enviado ✓" : "Enviar arquivo"}
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </label>
            </div>
            {errors.documentoUrl && <p className="text-xs text-destructive mt-1">{errors.documentoUrl}</p>}
          </div>
        </div>
      </div>

      {/* ═══ BLOCO 3 — CLÍNICO ESSENCIAL ═══ */}
      <div className="space-y-3 border-t pt-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Stethoscope className="w-4 h-4" /> Informações Clínicas
        </div>

        <div>
          <Label className="mb-2 block">Tipo de condição</Label>
          <RadioGroup
            value={form.tipoCondicao}
            onValueChange={(v) => set("tipoCondicao", v)}
            className="flex flex-wrap gap-4"
          >
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="fisica" id="cond-fisica" />
              <Label htmlFor="cond-fisica" className="cursor-pointer text-sm">
                Física
              </Label>
            </div>
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="intelectual" id="cond-intelectual" />
              <Label htmlFor="cond-intelectual" className="cursor-pointer text-sm">
                Intelectual
              </Label>
            </div>
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="tea" id="cond-tea" />
              <Label htmlFor="cond-tea" className="cursor-pointer text-sm">
                TEA
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Conditional: Física */}
        {form.tipoCondicao === "fisica" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-2 border-l-2 border-primary/20">
            <div>
              <Label>Mobilidade</Label>
              <Select value={form.mobilidade || ""} onValueChange={(v) => set("mobilidade", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deambula">Deambula</SelectItem>
                  <SelectItem value="cadeira_rodas">Cadeira de rodas</SelectItem>
                  <SelectItem value="acamado">Acamado</SelectItem>
                  <SelectItem value="muleta_andador">Muleta/Andador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.usaDispositivo}
                onCheckedChange={(v) => set("usaDispositivo", v)}
                id="dispositivo"
              />
              <Label htmlFor="dispositivo" className="text-sm cursor-pointer">
                Usa dispositivo?
              </Label>
            </div>
            {form.usaDispositivo && (
              <div>
                <Label>Tipo de dispositivo</Label>
                <Input
                  value={form.tipoDispositivo}
                  onChange={(e) => set("tipoDispositivo", e.target.value)}
                  placeholder="Descreva"
                />
              </div>
            )}
          </div>
        )}

        {/* Conditional: Intelectual / TEA */}
        {(form.tipoCondicao === "intelectual" || form.tipoCondicao === "tea") && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-2 border-l-2 border-primary/20">
            <div>
              <Label>Comunicação</Label>
              <Select value={form.comunicacao || ""} onValueChange={(v) => set("comunicacao", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="verbal">Verbal</SelectItem>
                  <SelectItem value="nao_verbal">Não verbal</SelectItem>
                  <SelectItem value="verbal_limitada">Verbal limitada</SelectItem>
                  <SelectItem value="caa">Usa CAA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Comportamento</Label>
              <Select value={form.comportamento || ""} onValueChange={(v) => set("comportamento", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="adequado">Adequado</SelectItem>
                  <SelectItem value="agitacao">Agitação</SelectItem>
                  <SelectItem value="autolesao">Autolesão</SelectItem>
                  <SelectItem value="fuga">Fuga</SelectItem>
                  <SelectItem value="agressividade">Agressividade</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* ═══ BLOCO EXTRA (Accordion) ═══ */}
      <Accordion type="single" collapsible>
        <AccordionItem value="extra">
          <AccordionTrigger className="text-sm font-semibold text-primary">Dados adicionais</AccordionTrigger>
          <AccordionContent className="space-y-3">
            {/* Equipamentos */}
            <div className="flex items-center gap-3 p-2 rounded-md bg-muted/40">
              <Switch checked={form.usaEquipamentos} onCheckedChange={(v) => set("usaEquipamentos", v)} id="equip" />
              <Label htmlFor="equip" className="text-sm cursor-pointer">
                Usa equipamentos?
              </Label>
            </div>
            {form.usaEquipamentos && (
              <div className="space-y-2 pl-2 border-l-2 border-primary/20">
                <div className="flex flex-wrap gap-2">
                  {EQUIPAMENTOS_OPTIONS.map((eq) => (
                    <Button
                      key={eq}
                      size="sm"
                      variant={form.equipamentos.includes(eq) ? "default" : "outline"}
                      onClick={() => toggleEquipamento(eq)}
                      className="text-xs"
                    >
                      {eq}
                    </Button>
                  ))}
                </div>
                <Textarea
                  value={form.observacaoEquipamentos}
                  onChange={(e) => set("observacaoEquipamentos", e.target.value)}
                  placeholder="Observações sobre equipamentos"
                  className="min-h-[40px]"
                />
              </div>
            )}

            {/* Transporte + Turno */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Transporte</Label>
                <Select value={form.transporte || ""} onValueChange={(v) => set("transporte", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="proprio">Próprio</SelectItem>
                    <SelectItem value="familiar">Familiar</SelectItem>
                    <SelectItem value="transporte_municipal">Municipal</SelectItem>
                    <SelectItem value="samu">SAMU</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Turno preferido</Label>
                <Select value={form.turnoPreferido || ""} onValueChange={(v) => set("turnoPreferido", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manha">Manhã</SelectItem>
                    <SelectItem value="tarde">Tarde</SelectItem>
                    <SelectItem value="indiferente">Indiferente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Email + Endereço */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>E-mail</Label>
                <Input
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div>
                <Label>Endereço</Label>
                <Input
                  value={form.endereco}
                  onChange={(e) => set("endereco", e.target.value)}
                  placeholder="Rua, nº, bairro"
                />
              </div>
            </div>

            {/* Outro serviço SUS */}
            <div className="flex items-center gap-3 p-2 rounded-md bg-muted/40">
              <Switch
                checked={form.outroServicoSus}
                onCheckedChange={(v) => set("outroServicoSus", v)}
                id="outro-sus"
              />
              <Label htmlFor="outro-sus" className="text-sm cursor-pointer">
                Paciente em outro serviço SUS?
              </Label>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Save button */}
      <Button className="w-full" onClick={onSave} disabled={saving}>
        {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
        {isEdit ? "Atualizar Paciente" : "Cadastrar Paciente"}
      </Button>
    </div>
  );
};

export default CadastroPacienteForm;
