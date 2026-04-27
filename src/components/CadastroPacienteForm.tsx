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
import { User, MapPin, Phone, FileHeart, Upload, Loader2, Building2, Stethoscope, Loader, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { applyPhoneMask, formatPhoneForDisplay } from "@/lib/phoneUtils";
import CustomFieldsRenderer from "@/components/CustomFieldsRenderer";
import { useCustomFields } from "@/hooks/useCustomFields";
import { useAuth } from "@/contexts/AuthContext";
import LogradouroDneAutocomplete from "@/components/LogradouroDneAutocomplete";

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

// Máscara CNS (15 dígitos: 0000 0000 0000 0000)
const maskCNS = (v: string): string => {
  const d = (v || "").replace(/\D/g, "").slice(0, 15);
  return d.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
};

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
  customData?: Record<string, any>;
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
  customData: {},
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
  const setCustom = (key: string, value: any) =>
    onChange({ ...form, customData: { ...(form.customData || {}), [key]: value } });
  const cd = form.customData || {};

  const [uploading, setUploading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("identificacao");
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const { user } = useAuth();
  const { resolved: customConfig, getNativeLabel, isNativeHidden } = useCustomFields("paciente", user?.unidadeId);
  const L = (name: string, fallback: string) => getNativeLabel(name, fallback);
  const H = (name: string) => isNativeHidden(name);

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

  // ---- AUTOSAVE: indicador visual (debounce 1.5s) ----
  const firstRunRef = useRef(true);
  useEffect(() => {
    if (firstRunRef.current) { firstRunRef.current = false; return; }
    if (!isEdit) return; // Só autosave em edição
    setAutoSaveStatus("saving");
    const t = setTimeout(() => {
      setAutoSaveStatus("saved");
      const t2 = setTimeout(() => setAutoSaveStatus("idle"), 1500);
      return () => clearTimeout(t2);
    }, 1500);
    return () => clearTimeout(t);
  }, [form, isEdit]);

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
    identificacao: !!(errors.nome || errors.cpf || errors.cns || errors.nomeResponsavel || errors.cpfResponsavel || errors.nomeMae),
    endereco: !!(errors.cep || errors.municipio),
    contato: !!(errors.telefone || errors.email),
    complementares: !!(errors.especialidadeDestino || errors.ubsOrigem || errors.cid || errors.justificativa),
  };

  return (
    <div className="flex flex-col h-full">
      {/* Status autosave */}
      {isEdit && autoSaveStatus !== "idle" && (
        <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground px-1 pb-2">
          {autoSaveStatus === "saving" ? (
            <><Loader className="w-3 h-3 animate-spin" /> Salvando...</>
          ) : (
            <><CheckCircle2 className="w-3 h-3 text-success" /> Salvo automaticamente</>
          )}
        </div>
      )}

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
                  <Label>{L("nome", "Nome completo")} *</Label>
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
                  <Label>{L("nomeMae", "Nome da Mãe")}</Label>
                  <Input
                    value={form.nomeMae}
                    onChange={(e) => set("nomeMae", sanitizeUpper(e.target.value))}
                    placeholder="NOME DA MAE"
                  />
                  {errors.nomeMae && <p className="text-xs text-destructive mt-1">{errors.nomeMae}</p>}
                </div>
              )}

              {!H("dataNascimento") && (
                <div>
                  <Label>{L("dataNascimento", "Data de Nascimento")}</Label>
                  <Input type="date" value={form.dataNascimento} onChange={(e) => set("dataNascimento", e.target.value)} />
                </div>
              )}

              {!H("sexo") && (
                <div>
                  <Label>{L("sexo", "Sexo")}</Label>
                  <Select value={cd.sexo || ""} onValueChange={(v) => setCustom("sexo", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="feminino">Feminino</SelectItem>
                    </SelectContent>
                  </Select>
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
                  <Label>{L("cns", "CNS")}</Label>
                  <Input
                    value={form.cns}
                    onChange={(e) => set("cns", maskCNS(e.target.value))}
                    placeholder="0000 0000 0000 0000"
                    inputMode="numeric"
                  />
                  {errors.cns && <p className="text-xs text-destructive mt-1">{errors.cns}</p>}
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
                <Label>CEP</Label>
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
              </div>

              <div>
                <Label>
                  Tipo de Logradouro (DNE) <span className="text-destructive">*</span>
                </Label>
                <LogradouroDneAutocomplete
                  value={cd.tipoLogradouro || ""}
                  codigo={cd.tipoLogradouroCodigo || ""}
                  onChange={(descricao, codigo) => {
                    onChange({
                      ...form,
                      customData: {
                        ...(form.customData || {}),
                        tipoLogradouro: descricao,
                        tipoLogradouroCodigo: codigo,
                      },
                    });
                  }}
                  required
                />
              </div>

              <div className="md:col-span-2">
                <Label>Logradouro</Label>
                <Input
                  value={cd.logradouro || ""}
                  onChange={(e) => setCustom("logradouro", sanitizeUpper(e.target.value))}
                  placeholder="NOME DA RUA / AVENIDA"
                />
              </div>

              <div>
                <Label>Número</Label>
                <Input
                  value={cd.numero || ""}
                  onChange={(e) => setCustom("numero", e.target.value.replace(/[^\dA-Za-z\/\-]/g, "").toUpperCase())}
                  placeholder="Nº"
                  inputMode="numeric"
                />
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
                <Label>Bairro</Label>
                <Input
                  value={cd.bairro || ""}
                  onChange={(e) => setCustom("bairro", sanitizeUpper(e.target.value))}
                  placeholder="BAIRRO"
                />
              </div>

              {!H("municipio") && (
                <div>
                  <Label>{L("municipio", "Município")}</Label>
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
                <Label>UF</Label>
                <Select value={cd.uf || ""} onValueChange={(v) => setCustom("uf", v)}>
                  <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>
                    {UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
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
                  <Label>{L("telefone", "Telefone Principal")} *</Label>
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
                  <Label>Nacionalidade *</Label>
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
                </div>

                <div>
                  <Label>Raça/Cor (IBGE) *</Label>
                  <Select
                    value={cd.racaCor || cd.raca_cor || ""}
                    onValueChange={(v) => {
                      // Persistir em ambas as chaves para compat com BPA
                      onChange({
                        ...form,
                        customData: { ...(form.customData || {}), racaCor: v, raca_cor: v },
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

            {/* Encaminhamento (preservado) */}
            <div className="space-y-3 border-t pt-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Building2 className="w-4 h-4" /> Encaminhamento (UBS)
              </div>

              <div className="p-3 rounded-lg border-2 border-primary/30 bg-primary/5">
                <Label className="text-base font-semibold text-primary">Especialidade Destino</Label>
                <p className="text-xs text-muted-foreground mb-2">Define todo o fluxo do paciente no sistema</p>
                <Select value={form.especialidadeDestino || ""} onValueChange={(v) => set("especialidadeDestino", v)}>
                  <SelectTrigger className="border-primary/30">
                    <SelectValue placeholder="Selecione a especialidade" />
                  </SelectTrigger>
                  <SelectContent>
                    {ESPECIALIDADES_DESTINO.map((e) => (
                      <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.especialidadeDestino && (
                  <p className="text-xs text-destructive mt-1">{errors.especialidadeDestino}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>UBS origem</Label>
                  <Select value={form.ubsOrigem || ""} onValueChange={(v) => set("ubsOrigem", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione a UBS" /></SelectTrigger>
                    <SelectContent>
                      {UBS_LIST.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {errors.ubsOrigem && <p className="text-xs text-destructive mt-1">{errors.ubsOrigem}</p>}
                </div>
                <div>
                  <Label>Profissional solicitante</Label>
                  <Input
                    value={form.profissionalSolicitante}
                    onChange={(e) => set("profissionalSolicitante", sanitizeUpper(e.target.value))}
                    placeholder="NOME DO PROFISSIONAL"
                  />
                </div>
                <div>
                  <Label>Tipo encaminhamento</Label>
                  <Select value={form.tipoEncaminhamento || ""} onValueChange={(v) => set("tipoEncaminhamento", v)}>
                    <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
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
                  <Input value={form.cid} onChange={(e) => set("cid", e.target.value.toUpperCase())} placeholder="Ex: G80.0" />
                  {errors.cid && <p className="text-xs text-destructive mt-1">{errors.cid}</p>}
                </div>
                <div className="md:col-span-2">
                  <Label>Diagnóstico resumido</Label>
                  <Input
                    value={form.diagnosticoResumido}
                    onChange={(e) => set("diagnosticoResumido", e.target.value)}
                    placeholder="Resumo em uma linha"
                  />
                </div>
                <div className="md:col-span-2">
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
