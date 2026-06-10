import React, { useState, useEffect, useRef } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { User, MapPin, Phone, FileHeart, Upload, Loader2, Building2, Stethoscope, Loader, CheckCircle2, FileIcon, Eye, Download, Trash2, Loader2 as Spinner, AlertCircle, History, Shield } from "lucide-react";
import PatientAttachmentManager from "@/components/PatientAttachmentManager";
import PatientReferralHistory, { type PatientReferralHistoryHandle } from "@/components/Pacientes/PatientReferralHistory";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { applyPhoneMask, formatPhoneForDisplay } from "@/lib/phoneUtils";
import CustomFieldsRenderer from "@/components/CustomFieldsRenderer";
import { useCustomFields } from "@/hooks/useCustomFields";
import { useAuth } from "@/contexts/AuthContext";
import LogradouroDneAutocomplete from "@/components/LogradouroDneAutocomplete";
import MunicipioCombobox from "@/components/MunicipioCombobox";
import { maskCNS } from "@/lib/cnsUtils";

const ESPECIALIDADES_DESTINO = [
  { value: "fisioterapia", label: "Fisioterapia" },
  { value: "fonoaudiologia", label: "Fonoaudiologia" },
  { value: "nutricao", label: "Nutrição" },
  { value: "psicologia", label: "Psicologia" },
  { value: "terapia_ocupacional", label: "Terapia Ocupacional" },
  { value: "outros", label: "Outros" },
];

const MUNICIPIOS = [
  "Oriximiná", "Óbidos", "Terra Santa", "Faro", "Juruti", "Nhamundá",
  "Parintins", "Santarém", "Alenquer", "Monte Alegre", "Outro",
];

const UBS_LIST = [
  "UBS Dr. Lauro Corrêa Pinto", "UBS Penta", "UBS Corino Guerreiro",
  "UBS Santa Luzia", "UBS Tânia Siqueira da Fonseca", "UBS Antônio Miléo",
  "Hospital Municipal de Oriximiná", "UBS Nossa Sra. das Graças",
  "UBS Fluvial Manoel Andrade", "UBS Ribeirinho", "Hospital Regional Menino Jesus",
];

const EQUIPAMENTOS_OPTIONS = ["Cadeira de rodas", "Andador", "Muleta", "Órtese", "Prótese", "Sonda", "Outro"];

// Tipos de logradouro agora vêm da tabela DNE (logradouros_dne) via LogradouroDneAutocomplete

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
];

const RACA_COR_OPTIONS = [
  { value: "branca", label: "Branca" },
  { value: "preta", label: "Preta" },
  { value: "parda", label: "Parda" },
  { value: "amarela", label: "Amarela" },
  { value: "indigena", label: "Indígena" },
  { value: "nao_declarado", label: "Não declarado" },
];

// Sanitização: uppercase + remove acentos
const sanitizeUpper = (v: string): string =>
  (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

// Máscara CPF
const maskCPF = (v: string): string => {
  const d = (v || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

// Máscara CNS (15 dígitos: 000 0000 0000 0000) — ver src/lib/cnsUtils.ts

// Máscara CEP
const maskCEP = (v: string): string => {
  const d = (v || "").replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
};

export interface PacienteFormData {
  // Bloco 1 - Identificação
  nome: string;
  dataNascimento: string;
  cpf: string;
  cns: string;
  telefone: string;
  municipio: string;
  naturalidade: string;
  naturalidadeUf: string;
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
  // Legacy / contato / endereço
  email: string;
  endereco: string;
  nomeMae: string;
  descricaoClinica: string;
  // Prioridade especial
  isGestante: boolean;
  isPne: boolean;
  isAutista: boolean;
  patientProcedures?: any[];
  customData?: Record<string, any>;
  sexo: string;
}

export const emptyPacienteForm: PacienteFormData = {
  nome: "", dataNascimento: "", cpf: "", cns: "", telefone: "", municipio: "",
  naturalidade: "", naturalidadeUf: "",
  menorIdade: false, nomeResponsavel: "", cpfResponsavel: "",
  especialidadeDestino: "", ubsOrigem: "", profissionalSolicitante: "",
  tipoEncaminhamento: "", cid: "", diagnosticoResumido: "", justificativa: "",
  dataEncaminhamento: "", documentoUrl: "",
  tipoCondicao: "", mobilidade: "", usaDispositivo: false, tipoDispositivo: "",
  comunicacao: "", comportamento: "", usaEquipamentos: false, equipamentos: [],
  observacaoEquipamentos: "", outroServicoSus: false, transporte: "", turnoPreferido: "",
  email: "", endereco: "", nomeMae: "", descricaoClinica: "",
  isGestante: false, isPne: false, isAutista: false,
  patientProcedures: [],
  customData: {},
};


interface Props {
  pacienteId?: string | null;
  form: PacienteFormData;
  onChange: (form: PacienteFormData) => void;
  onSave: () => void;
  saving: boolean;
  isEdit: boolean;
  errors: Record<string, string>;
}

const CadastroPacienteForm: React.FC<Props> = ({ pacienteId, form, onChange, onSave, saving, isEdit, errors }) => {
  const set = (field: keyof PacienteFormData, value: any) => onChange({ ...form, [field]: value });
  const setCustom = (key: string, value: any) =>
    onChange({ ...form, customData: { ...(form.customData || {}), [key]: value } });
  const cd = form.customData || {};

  // Persiste valor default de Nacionalidade exibido no Select (evita erro de validação quando o usuário não interage)
  useEffect(() => {
    if (!cd.nacionalidade) {
      onChange({ ...form, customData: { ...(form.customData || {}), nacionalidade: "brasileiro" } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [uploading, setUploading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("identificacao");
  // Removido estado de autosave para evitar fechamento indesejado da modal
  const { user } = useAuth();
  const { resolved: customConfig, getNativeLabel, isNativeHidden } = useCustomFields("paciente", user?.unidadeId);
  const L = (name: string, fallback: string) => getNativeLabel(name, fallback);
  const H = (name: string) => isNativeHidden(name);

  // Ref to PatientReferralHistory so the parent can flush pending referrals after patient creation
  const referralRef = useRef<PatientReferralHistoryHandle>(null);
  useEffect(() => {
    (window as any).__patientReferralRef = referralRef;
    return () => { if ((window as any).__patientReferralRef === referralRef) (window as any).__patientReferralRef = null; };
  }, []);

  // ---- MIGRAÇÃO: legado endereço string -> logradouro estruturado ----
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current) return;
    if (isEdit && form.endereco && !cd.logradouro && !cd.numero && !cd.bairro) {
      // Tenta detectar "Logradouro, nº, bairro"
      const parts = form.endereco.split(",").map((p) => p.trim()).filter(Boolean);
      const update: Record<string, any> = { ...cd };
      if (parts[0]) update.logradouro = parts[0];
      if (parts[1]) update.numero = parts[1].replace(/[^\d]/g, "") || parts[1];
      if (parts[2]) update.bairro = parts[2];
      if (Object.keys(update).length > Object.keys(cd).length) {
        onChange({ ...form, customData: update });
      }
    }
    migratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit]);

  // Carregar procedimentos vinculados se for edição
  useEffect(() => {
    if (isEdit && pacienteId) {
      (async () => {
        const { data, error } = await supabase
          .from("patient_procedures")
          .select("*")
          .eq("patient_id", pacienteId);
        if (!error && data) {
          set("patientProcedures", data);
        }
      })();
    }
  }, [isEdit, pacienteId]);

  const addProcedure = () => {
    const newList = [...(form.patientProcedures || []), { sigtap_codigo: "", procedimento_nome: "", cid: "" }];
    set("patientProcedures", newList);
  };

  const updateProcedure = (index: number, field: string, value: string) => {
    const newList = [...(form.patientProcedures || [])];
    newList[index] = { ...newList[index], [field]: value };
    set("patientProcedures", newList);
  };

  const removeProcedure = (index: number) => {
    const newList = (form.patientProcedures || []).filter((_, i) => i !== index);
    set("patientProcedures", newList);
  };

  // ---- ViaCEP ----
  const handleCepBlur = async () => {
    const cep = (cd.cep || "").replace(/\D/g, "");
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data?.erro) {
        toast.error("CEP não encontrado.");
      } else {
        const update = {
          ...cd,
          logradouro: data.logradouro ? sanitizeUpper(data.logradouro) : cd.logradouro,
          bairro: data.bairro ? sanitizeUpper(data.bairro) : cd.bairro,
          uf: data.uf || cd.uf,
        };
        const novoMunicipio = data.localidade || form.municipio;
        const municipioMatch = MUNICIPIOS.find((m) =>
          sanitizeUpper(m) === sanitizeUpper(novoMunicipio)
        );
        onChange({
          ...form,
          municipio: municipioMatch || form.municipio,
          customData: update,
        });
        toast.success("Endereço preenchido pelo CEP");
      }
    } catch {
      toast.error("Erro ao buscar CEP.");
    } finally {
      setCepLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Arquivo máximo: 5MB"); return; }
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

  // Validação visual por aba (badge se erro)
  const tabHasError = {
    identificacao: !!(errors.nome || errors.cpf || errors.cns || errors.nomeMae || errors.dataNascimento || errors.naturalidade || errors.nomeResponsavel || errors.cpfResponsavel),
    endereco: !!(errors.cep || errors.logradouro || errors.numero || errors.bairro || errors.municipio || errors.uf),
    contato: !!(errors.telefone || errors.email),
    complementares: !!(errors.nacionalidade || errors.racaCor || errors.especialidadeDestino || errors.ubsOrigem || errors.cid || errors.justificativa),
  };

  return (
    <div className="flex flex-col h-full">
      {/* Status autosave removido */}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        {/* Tabs scrolláveis no mobile */}
        <div className="overflow-x-auto -mx-1 px-1 pb-2">
          <TabsList className="inline-flex w-auto min-w-full sm:grid sm:grid-cols-4 sm:w-full">
            <TabsTrigger value="identificacao" className="flex items-center gap-1.5 whitespace-nowrap relative">
              <User className="w-3.5 h-3.5" />
              <span>Identificação</span>
              {tabHasError.identificacao && <span className="w-1.5 h-1.5 rounded-full bg-destructive" />}
            </TabsTrigger>
            <TabsTrigger value="endereco" className="flex items-center gap-1.5 whitespace-nowrap relative">
              <MapPin className="w-3.5 h-3.5" />
              <span>Endereço</span>
              {tabHasError.endereco && <span className="w-1.5 h-1.5 rounded-full bg-destructive" />}
            </TabsTrigger>
            <TabsTrigger value="contato" className="flex items-center gap-1.5 whitespace-nowrap relative">
              <Phone className="w-3.5 h-3.5" />
              <span>Contato</span>
              {tabHasError.contato && <span className="w-1.5 h-1.5 rounded-full bg-destructive" />}
            </TabsTrigger>
            <TabsTrigger value="complementares" className="flex items-center gap-1.5 whitespace-nowrap relative">
              <FileHeart className="w-3.5 h-3.5" />
              <span>Complementares</span>
              {tabHasError.complementares && <span className="w-1.5 h-1.5 rounded-full bg-destructive" />}
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 max-h-[60vh]">
          {/* ═══ ABA 1 — IDENTIFICAÇÃO ═══ */}
          <TabsContent value="identificacao" className="space-y-4 mt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {!H("nome") && (
                <div className="md:col-span-2">
                  <Label className="after:content-['*'] after:ml-0.5 after:text-destructive">{L("nome", "Nome completo")}</Label>
                  <Input
                    value={form.nome}
                    onChange={(e) => set("nome", sanitizeUpper(e.target.value))}
                    placeholder="NOME DO PACIENTE"
                  />
                  {errors.nome && <p className="text-xs text-destructive mt-1">{errors.nome}</p>}
                </div>
              )}

              {!H("nomeMae") && (
                <div className="md:col-span-2">
                  <Label className="after:content-['*'] after:ml-0.5 after:text-destructive">{L("nomeMae", "Nome da Mãe")}</Label>
                  <Input
                    value={form.nomeMae}
                    onChange={(e) => set("nomeMae", sanitizeUpper(e.target.value))}
                    placeholder="NOME DA MAE"
                  />
                  {errors.nomeMae && <p className="text-xs text-destructive mt-1">{errors.nomeMae}</p>}
                </div>
              )}

              {!H("nomePai") && (
                <div className="md:col-span-2">
                  <Label>{L("nomePai", "Nome do Pai")}</Label>
                  <Input
                    value={cd.nome_pai || ""}
                    onChange={(e) => setCustom("nome_pai", sanitizeUpper(e.target.value))}
                    placeholder="NOME DO PAI"
                  />
                </div>
              )}

              {!H("dataNascimento") && (
                <div>
                  <Label className="after:content-['*'] after:ml-0.5 after:text-destructive">{L("dataNascimento", "Data de Nascimento")}</Label>
                  <Input type="date" value={form.dataNascimento} onChange={(e) => set("dataNascimento", e.target.value)} />
                  {errors.dataNascimento && <p className="text-xs text-destructive mt-1">{errors.dataNascimento}</p>}
                </div>
              )}

              {!H("sexo") && (
                <div>
                  <Label className="after:content-['*'] after:ml-0.5 after:text-destructive">{L("sexo", "Sexo")}</Label>
                  <Select value={cd.sexo || ""} onValueChange={(v) => setCustom("sexo", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="feminino">Feminino</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.sexo && <p className="text-xs text-destructive mt-1">{errors.sexo}</p>}
                </div>
              )}

              {!H("cpf") && (
                <div>
                  <Label>{L("cpf", "CPF")}</Label>
                  <Input
                    value={form.cpf}
                    onChange={(e) => set("cpf", maskCPF(e.target.value))}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                  />
                  {errors.cpf && <p className="text-xs text-destructive mt-1">{errors.cpf}</p>}
                </div>
              )}

              {!H("cns") && (
                <div>
                  <Label className="after:content-['*'] after:ml-0.5 after:text-destructive">{L("cns", "CNS")}</Label>
                  <Input
                    value={maskCNS(form.cns)}
                    onChange={(e) => set("cns", maskCNS(e.target.value))}
                    placeholder="000 0000 0000 0000"
                    inputMode="numeric"
                    maxLength={18}
                  />
                  {errors.cns && <p className="text-xs text-destructive mt-1">{errors.cns}</p>}
                </div>
              )}

              {!H("naturalidade") && (
                <div className="md:col-span-2">
                  <Label className="after:content-['*'] after:ml-0.5 after:text-destructive">{L("naturalidade", "Naturalidade")}</Label>
                  <MunicipioCombobox
                    value={form.naturalidade}
                    uf={form.naturalidadeUf}
                    onChange={(cidade, uf) => onChange({ ...form, naturalidade: cidade, naturalidadeUf: uf })}
                    placeholder="Selecione o município de naturalidade"
                  />
                  {errors.naturalidade && <p className="text-xs text-destructive mt-1">{errors.naturalidade}</p>}
                </div>
              )}

              <div className="flex items-center gap-3 p-2 rounded-md bg-muted/40 md:col-span-2">
                <Switch
                  id="situacao-rua"
                  checked={!!cd.situacaoRua}
                  onCheckedChange={(v) => setCustom("situacaoRua", v)}
                />
                <Label htmlFor="situacao-rua" className="text-sm cursor-pointer">
                  Pessoa em situação de rua?
                </Label>
              </div>
            </div>

            {/* Menor de idade */}
            <div className="flex items-center gap-3 p-2 rounded-md bg-muted/40">
              <Switch checked={form.menorIdade} onCheckedChange={(v) => set("menorIdade", v)} id="menor" />
              <Label htmlFor="menor" className="text-sm cursor-pointer">Menor de idade?</Label>
            </div>
            {form.menorIdade && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-2 border-l-2 border-primary/20">
                <div>
                  <Label>Nome responsável *</Label>
                  <Input
                    value={form.nomeResponsavel}
                    onChange={(e) => set("nomeResponsavel", sanitizeUpper(e.target.value))}
                  />
                  {errors.nomeResponsavel && <p className="text-xs text-destructive mt-1">{errors.nomeResponsavel}</p>}
                </div>
                <div>
                  <Label>CPF responsável *</Label>
                  <Input
                    value={form.cpfResponsavel}
                    onChange={(e) => set("cpfResponsavel", maskCPF(e.target.value))}
                    placeholder="000.000.000-00"
                  />
                  {errors.cpfResponsavel && <p className="text-xs text-destructive mt-1">{errors.cpfResponsavel}</p>}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ═══ ABA 2 — ENDEREÇO ═══ */}
          <TabsContent value="endereco" className="space-y-4 mt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="after:content-['*'] after:ml-0.5 after:text-destructive">CEP</Label>
                <div className="relative">
                  <Input
                    value={cd.cep || ""}
                    onChange={(e) => setCustom("cep", maskCEP(e.target.value))}
                    onBlur={handleCepBlur}
                    placeholder="00000-000"
                    inputMode="numeric"
                  />
                  {cepLoading && (
                    <Loader2 className="w-4 h-4 animate-spin absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  )}
                </div>
                {errors.cep && <p className="text-xs text-destructive mt-1">{errors.cep}</p>}
              </div>

              <div>
                <Label>
                  Tipo de Logradouro (DNE) <span className="text-destructive">*</span>
                </Label>
                <LogradouroDneAutocomplete
                  value={cd.tipoLogradouro || ""}
                  codigo={cd.tipoLogradouroCodigo || ""}
                  onChange={(descricao, codigo) => {
                    const update = {
                      ...(form.customData || {}),
                      tipoLogradouro: descricao,
                      tipoLogradouroCodigo: codigo,
                      tipoLogradouroDne: descricao, // Redundância para garantir persistência
                    };
                    onChange({
                      ...form,
                      customData: update,
                    });
                  }}
                  required
                />
              </div>

              <div className="md:col-span-2">
                <Label className="after:content-['*'] after:ml-0.5 after:text-destructive">Logradouro</Label>
                <Input
                  value={cd.logradouro || ""}
                  onChange={(e) => setCustom("logradouro", sanitizeUpper(e.target.value))}
                  placeholder="NOME DA RUA / AVENIDA"
                />
                {errors.logradouro && <p className="text-xs text-destructive mt-1">{errors.logradouro}</p>}
              </div>

              <div>
                <Label className="after:content-['*'] after:ml-0.5 after:text-destructive">Número</Label>
                <Input
                  value={cd.numero || ""}
                  onChange={(e) => setCustom("numero", e.target.value.replace(/[^\dA-Za-z\/\-]/g, "").toUpperCase())}
                  placeholder="Nº"
                  inputMode="numeric"
                />
                {errors.numero && <p className="text-xs text-destructive mt-1">{errors.numero}</p>}
              </div>

              <div>
                <Label>Complemento</Label>
                <Input
                  value={cd.complemento || ""}
                  onChange={(e) => setCustom("complemento", sanitizeUpper(e.target.value))}
                  placeholder="APTO, BLOCO, ETC"
                />
              </div>

              <div>
                <Label className="after:content-['*'] after:ml-0.5 after:text-destructive">Bairro</Label>
                <Input
                  value={cd.bairro || ""}
                  onChange={(e) => setCustom("bairro", sanitizeUpper(e.target.value))}
                  placeholder="BAIRRO"
                />
                {errors.bairro && <p className="text-xs text-destructive mt-1">{errors.bairro}</p>}
              </div>

              {!H("municipio") && (
                <div>
                  <Label className="after:content-['*'] after:ml-0.5 after:text-destructive">{L("municipio", "Município")}</Label>
                  <Select value={form.municipio || ""} onValueChange={(v) => set("municipio", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {MUNICIPIOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {errors.municipio && <p className="text-xs text-destructive mt-1">{errors.municipio}</p>}
                </div>
              )}

              <div>
                <Label className="after:content-['*'] after:ml-0.5 after:text-destructive">UF</Label>
                <Select value={cd.uf || ""} onValueChange={(v) => setCustom("uf", v)}>
                  <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>
                    {UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
                {errors.uf && <p className="text-xs text-destructive mt-1">{errors.uf}</p>}
              </div>

              {/* Mantém endereco legacy (oculto, sincroniza para retrocompat) */}
              {!H("endereco") && (
                <div className="md:col-span-2">
                  <Label className="text-xs text-muted-foreground">Endereço completo (legado / referência)</Label>
                  <Input
                    value={form.endereco}
                    onChange={(e) => set("endereco", e.target.value)}
                    placeholder="Texto livre opcional"
                  />
                </div>
              )}
            </div>
          </TabsContent>

          {/* ═══ ABA 3 — CONTATO ═══ */}
          <TabsContent value="contato" className="space-y-4 mt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {!H("telefone") && (
                <div>
                  <Label className="after:content-['*'] after:ml-0.5 after:text-destructive">{L("telefone", "Telefone Principal")}</Label>
                  <Input
                    value={form.telefone.length > 0 && !/[()-]/.test(form.telefone) ? formatPhoneForDisplay(form.telefone) : form.telefone}
                    onChange={(e) => set("telefone", applyPhoneMask(e.target.value))}
                    placeholder="(99) 99999-9999"
                    inputMode="numeric"
                  />
                  {errors.telefone && <p className="text-xs text-destructive mt-1">{errors.telefone}</p>}
                </div>
              )}

              <div>
                <Label>Telefone Secundário</Label>
                <Input
                  value={cd.telefoneSecundario || ""}
                  onChange={(e) => setCustom("telefoneSecundario", applyPhoneMask(e.target.value))}
                  placeholder="(99) 99999-9999"
                  inputMode="numeric"
                />
              </div>

              {!H("email") && (
                <div className="md:col-span-2">
                  <Label>{L("email", "E-mail")}</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value.toLowerCase())}
                    placeholder="email@exemplo.com"
                  />
                  {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
                </div>
              )}
            </div>

          </TabsContent>


          {/* ═══ ABA 4 — DADOS COMPLEMENTARES E CLÍNICOS ═══ */}
          <TabsContent value="complementares" className="space-y-4 mt-2">
            {/* ── Bloco SUS / BPA-I ── */}
            <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-3 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <FileHeart className="w-4 h-4" /> Dados SUS (obrigatórios para BPA)
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="after:content-['*'] after:ml-0.5 after:text-destructive">Nacionalidade</Label>
                  <Select
                    value={cd.nacionalidade || "brasileiro"}
                    onValueChange={(v) => setCustom("nacionalidade", v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="brasileiro">Brasileiro(a)</SelectItem>
                      <SelectItem value="naturalizado">Naturalizado(a)</SelectItem>
                      <SelectItem value="estrangeiro">Estrangeiro(a)</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.nacionalidade && <p className="text-xs text-destructive mt-1">{errors.nacionalidade}</p>}
                </div>

                <div>
                  <Label className="after:content-['*'] after:ml-0.5 after:text-destructive">Raça/Cor (IBGE)</Label>
                  <Select
                    value={cd.racaCor || cd.raca_cor || ""}
                    onValueChange={(v) => {
                      // Persistir em todas as chaves possíveis para compatibilidade total
                      onChange({
                        ...form,
                        customData: { 
                          ...(form.customData || {}), 
                          racaCor: v, 
                          raca_cor: v 
                        },
                      });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {RACA_COR_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.racaCor && <p className="text-xs text-destructive mt-1">{errors.racaCor}</p>}
                </div>

                {/* Etnia: obrigatória apenas se Raça/Cor = Indígena */}
                {(cd.racaCor === "indigena" || cd.raca_cor === "indigena") && (
                  <div className="md:col-span-2">
                    <Label>Etnia (povo indígena) *</Label>
                    <Select value={cd.etnia || ""} onValueChange={(v) => setCustom("etnia", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione a etnia" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="X101">X101 — Apalai</SelectItem>
                        <SelectItem value="X117">X117 — Arara do Pará</SelectItem>
                        <SelectItem value="X238">X238 — Mundurukú</SelectItem>
                        <SelectItem value="X298">X298 — Wai-Wai</SelectItem>
                        <SelectItem value="X305">X305 — Tiriyó</SelectItem>
                        <SelectItem value="X313">X313 — Yanomami</SelectItem>
                        <SelectItem value="X999">X999 — Outra (especificar)</SelectItem>
                      </SelectContent>
                    </Select>
                    {cd.etnia === "X999" && (
                      <Input
                        className="mt-2"
                        placeholder="Especifique a etnia"
                        value={cd.etniaOutra || ""}
                        onChange={(e) => setCustom("etniaOutra", sanitizeUpper(e.target.value))}
                      />
                    )}
                  </div>
                )}

                {/* País de nascimento: obrigatório se estrangeiro */}
                {cd.nacionalidade === "estrangeiro" && (
                  <div className="md:col-span-2">
                    <Label>País de nascimento *</Label>
                    <Input
                      value={cd.paisNascimento || ""}
                      onChange={(e) => setCustom("paisNascimento", sanitizeUpper(e.target.value))}
                      placeholder="EX: VENEZUELA"
                    />
                  </div>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground">
                Esses campos são exigidos pelo SIA/SUS na geração do arquivo BPA-I mensal.
              </p>
            </div>

            {/* Encaminhamento (UBS) - Histórico e Anexos */}
            <div className="space-y-4 border-t pt-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Building2 className="w-4 h-4" /> Encaminhamento (UBS)
              </div>

              <PatientReferralHistory
                ref={referralRef}
                patientId={isEdit ? pacienteId : null}
                patientData={form}
                unidadeId={user?.unidadeId}
                professionalId={user?.id}
              />

              {/* Patient Attachment Manager (Documentação Geral) */}
              <div className="space-y-3 border-t pt-3">
                <Label className="text-base font-semibold">Documentação Geral do Paciente</Label>
                {isEdit && pacienteId ? (
                  <PatientAttachmentManager pacienteId={pacienteId} unidadeId={user?.unidadeId} />
                ) : (
                  <div className="p-4 border-2 border-dashed rounded-lg bg-muted/50 text-center space-y-1">
                    <FileIcon className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                    <p className="text-xs text-muted-foreground">
                      Documentação geral (RG, CPF, comprovantes) ficará disponível após salvar o cadastro. Anexos de encaminhamento podem ser adicionados acima e serão enviados automaticamente.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Clínico */}
            <div className="space-y-3 border-t pt-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Stethoscope className="w-4 h-4" /> Tipo de Condição
              </div>

              <RadioGroup
                value={form.tipoCondicao}
                onValueChange={(v) => set("tipoCondicao", v)}
                className="flex flex-wrap gap-4"
              >
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="fisica" id="cond-fisica" />
                  <Label htmlFor="cond-fisica" className="cursor-pointer text-sm">Física</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="intelectual" id="cond-intelectual" />
                  <Label htmlFor="cond-intelectual" className="cursor-pointer text-sm">Intelectual</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="tea" id="cond-tea" />
                  <Label htmlFor="cond-tea" className="cursor-pointer text-sm">TEA</Label>
                </div>
              </RadioGroup>

              {form.tipoCondicao === "fisica" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-2 border-l-2 border-primary/20">
                  <div>
                    <Label>Mobilidade</Label>
                    <Select value={form.mobilidade || ""} onValueChange={(v) => set("mobilidade", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
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
                    <Label htmlFor="dispositivo" className="text-sm cursor-pointer">Usa dispositivo?</Label>
                  </div>
                  {form.usaDispositivo && (
                    <div>
                      <Label>Tipo de dispositivo</Label>
                      <Input value={form.tipoDispositivo} onChange={(e) => set("tipoDispositivo", e.target.value)} placeholder="Descreva" />
                    </div>
                  )}
                </div>
              )}

              {(form.tipoCondicao === "intelectual" || form.tipoCondicao === "tea") && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-2 border-l-2 border-primary/20">
                  <div>
                    <Label>Comunicação</Label>
                    <Select value={form.comunicacao || ""} onValueChange={(v) => set("comunicacao", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
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
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
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

            {/* Prioridade Especial */}
            <div className="space-y-3 border-t pt-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                ⚡ Prioridade Especial
              </div>
              <p className="text-xs text-muted-foreground">
                Marque as condições aplicáveis. Idoso (≥60) é calculado automaticamente.
              </p>
              <div className="flex flex-wrap gap-4">
                {!H("isGestante") && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={form.isGestante} onCheckedChange={(v) => set("isGestante", !!v)} />
                    <span className="text-sm">{L("isGestante", "Gestante")}</span>
                  </label>
                )}
                {!H("isPne") && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={form.isPne} onCheckedChange={(v) => set("isPne", !!v)} />
                    <span className="text-sm">{L("isPne", "PNE")}</span>
                  </label>
                )}
                {!H("isAutista") && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={form.isAutista} onCheckedChange={(v) => set("isAutista", !!v)} />
                    <span className="text-sm">{L("isAutista", "Autista (TEA)")}</span>
                  </label>
                )}
              </div>
            </div>

            {/* Dados adicionais (accordion) */}
            <Accordion type="single" collapsible>
              <AccordionItem value="extra">
                <AccordionTrigger className="text-sm font-semibold text-primary">
                  Dados adicionais (equipamentos, transporte, turno)
                </AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <div className="flex items-center gap-3 p-2 rounded-md bg-muted/40">
                    <Switch checked={form.usaEquipamentos} onCheckedChange={(v) => set("usaEquipamentos", v)} id="equip" />
                    <Label htmlFor="equip" className="text-sm cursor-pointer">Usa equipamentos?</Label>
                  </div>
                  {form.usaEquipamentos && (
                    <div className="space-y-2 pl-2 border-l-2 border-primary/20">
                      <div className="flex flex-wrap gap-2">
                        {EQUIPAMENTOS_OPTIONS.map((eq) => (
                          <Button
                            key={eq}
                            size="sm"
                            type="button"
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label>Transporte</Label>
                      <Select value={form.transporte || ""} onValueChange={(v) => set("transporte", v)}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
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
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manha">Manhã</SelectItem>
                          <SelectItem value="tarde">Tarde</SelectItem>
                          <SelectItem value="indiferente">Indiferente</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2 rounded-md bg-muted/40">
                    <Switch
                      checked={form.outroServicoSus}
                      onCheckedChange={(v) => set("outroServicoSus", v)}
                      id="outro-sus"
                    />
                    <Label htmlFor="outro-sus" className="text-sm cursor-pointer">Paciente em outro serviço SUS?</Label>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Procedimentos Vinculados ao Paciente */}
            <div className="space-y-4 border-t pt-4 mt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <Stethoscope className="w-4 h-4" />
                  Procedimentos vinculados ao paciente
                </div>
                <Button type="button" size="sm" variant="outline" onClick={addProcedure} className="h-7 text-xs">
                  Adicionar
                </Button>
              </div>
              
              <div className="space-y-3">
                {(form.patientProcedures || []).length === 0 && (
                  <p className="text-xs text-muted-foreground italic text-center py-2">
                    Nenhum procedimento vinculado persistente.
                  </p>
                )}
                
                {(form.patientProcedures || []).map((proc, idx) => (
                  <div key={idx} className="p-3 border rounded-md bg-muted/20 relative group">
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon" 
                      className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeProcedure(idx)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[10px] uppercase">Cód. SIGTAP</Label>
                        <Input 
                          value={proc.sigtap_codigo || ""}
                          onChange={(e) => updateProcedure(idx, "sigtap_codigo", e.target.value.replace(/\D/g, ""))}
                          className="h-8 text-xs font-mono"
                          placeholder="0000000000"
                          maxLength={10}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase">Nome Procedimento</Label>
                        <Input 
                          value={proc.procedimento_nome || ""}
                          onChange={(e) => updateProcedure(idx, "procedimento_nome", sanitizeUpper(e.target.value))}
                          className="h-8 text-xs"
                          placeholder="DESCRIÇÃO"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase">CID</Label>
                        <Input 
                          value={proc.cid || ""}
                          onChange={(e) => updateProcedure(idx, "cid", sanitizeUpper(e.target.value))}
                          className="h-8 text-xs font-mono"
                          placeholder="X00.0"
                          maxLength={5}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Condições administrativas / Exceção de bloqueio */}
            <div className="p-4 border rounded-lg bg-blue-50/40 border-blue-200">
              <h4 className="font-semibold text-blue-900 mb-3 text-sm">
                Condições administrativas / Exceção de bloqueio por faltas
              </h4>
              <p className="text-xs text-muted-foreground mb-3">
                Pacientes marcados como TFD ou com Ordem Judicial ficam isentos de bloqueio por excesso de faltas.
                O histórico de faltas continua preservado.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-start gap-2 cursor-pointer p-2 rounded hover:bg-blue-100/50">
                  <input
                    type="checkbox"
                    checked={cd.is_tfd === true}
                    onChange={(e) => setCustom('is_tfd', e.target.checked)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-medium">Paciente TFD</div>
                    <div className="text-xs text-muted-foreground">Tratamento Fora do Domicílio</div>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-pointer p-2 rounded hover:bg-blue-100/50">
                  <input
                    type="checkbox"
                    checked={cd.possui_ordem_judicial === true}
                    onChange={(e) => setCustom('possui_ordem_judicial', e.target.checked)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-medium">Paciente com Ordem Judicial</div>
                    <div className="text-xs text-muted-foreground">Atendimento garantido judicialmente</div>
                  </div>
                </label>
              </div>
              {(cd.is_tfd === true || cd.possui_ordem_judicial === true) && (
                <div className="mt-3 space-y-2">
                  <div>
                    <label className="text-xs font-medium">Motivo da exceção *</label>
                    <input
                      type="text"
                      className="w-full mt-1 px-2 py-1.5 text-sm border rounded"
                      value={cd.motivo_excecao_bloqueio || ''}
                      onChange={(e) => setCustom('motivo_excecao_bloqueio', e.target.value)}
                      placeholder="Ex.: processo judicial nº 12345 / TFD para hemodiálise"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Observação</label>
                    <textarea
                      className="w-full mt-1 px-2 py-1.5 text-sm border rounded"
                      rows={2}
                      value={cd.observacao_tfd_ordem_judicial || ''}
                      onChange={(e) => setCustom('observacao_tfd_ordem_judicial', e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Custom Fields */}
            {customConfig.fields.length > 0 && (
              <div className="p-4 border rounded-lg bg-card">
                <CustomFieldsRenderer
                  fields={customConfig.fields}
                  values={form.customData || {}}
                  onChange={(fieldName, value) =>
                    onChange({ ...form, customData: { ...(form.customData || {}), [fieldName]: value } })
                  }
                />
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>

      {/* Footer fixo com botão */}
      <div className="border-t pt-3 mt-2">
        <Button className="w-full" onClick={onSave} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          {isEdit ? "Atualizar Paciente" : "Cadastrar Paciente"}
        </Button>
      </div>
    </div>
  );
};

export default CadastroPacienteForm;
