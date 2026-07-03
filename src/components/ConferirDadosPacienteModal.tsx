import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, Save, User, MapPin, Phone, Globe, Calendar, Stethoscope, Paperclip } from "lucide-react";
import PatientAttachmentManager from "@/components/PatientAttachmentManager";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import LogradouroDneAutocomplete from "@/components/LogradouroDneAutocomplete";
import MunicipioCombobox from "@/components/MunicipioCombobox";
import { applyPhoneMask } from "@/lib/phoneUtils";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { usePacientes } from '@/contexts/PacientesContext';
import { useAuth } from "@/contexts/AuthContext";
import { auditService } from "@/services/auditService";
import { patientService } from "@/services/patientService";
import { maskCNS as maskCnsUtil } from "@/lib/cnsUtils";

export interface ConferirDadosPacienteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pacienteId: string;
  /** Se fornecido, exibe os blocos de Agendamento + Profissional (modo Confirmar Chegada). */
  agendamento?: {
    data: string;
    hora: string;
    tipo: string;
    profissionalNome: string;
    profissionalEspecialidade?: string;
    profissionalCbo?: string;
    unidadeNome?: string;
  };
  modo: "agendamento" | "chegada";
  /** Chamado após o usuário confirmar (com checkbox marcado). */
  onConfirm: () => void;
  confirmLabel?: string;
}

// ───────── Listas oficiais (mesmas do CadastroPacienteForm) ─────────
const SEXO_OPTIONS = [
  { value: "M", label: "Masculino" },
  { value: "F", label: "Feminino" },
  { value: "I", label: "Ignorado" },
];

const RACA_COR_OPTIONS = [
  { value: "branca", label: "Branca" },
  { value: "preta", label: "Preta" },
  { value: "parda", label: "Parda" },
  { value: "amarela", label: "Amarela" },
  { value: "indigena", label: "Indígena" },
  
];

const NACIONALIDADE_OPTIONS = [
  { value: "brasileiro", label: "Brasileiro(a)" },
  { value: "naturalizado", label: "Naturalizado(a)" },
  { value: "estrangeiro", label: "Estrangeiro(a)" },
];

const ETNIA_OPTIONS = [
  { value: "X101", label: "X101 — Apalai" },
  { value: "X117", label: "X117 — Arara do Pará" },
  { value: "X238", label: "X238 — Mundurukú" },
  { value: "X298", label: "X298 — Wai-Wai" },
  { value: "X305", label: "X305 — Tiriyó" },
  { value: "X313", label: "X313 — Yanomami" },
  { value: "X999", label: "X999 — Outra (especificar)" },
];

const MUNICIPIOS = [
  "Oriximiná", "Óbidos", "Terra Santa", "Faro", "Juruti", "Nhamundá",
  "Parintins", "Santarém", "Alenquer", "Monte Alegre", "Outro",
];

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
];

function isCadastroIncompleto(p: any): { incompleto: boolean; faltando: string[] } {
  const faltando: string[] = [];
  const cpf = (p?.cpf || "").replace(/\D/g, "");
  const cns = (p?.cns || "").replace(/\D/g, "");
  if (cpf.length !== 11 && cns.length !== 15) faltando.push("CPF ou CNS");
  if (!p?.data_nascimento) faltando.push("Data de nascimento");
  if (!p?.sexo) faltando.push("Sexo");
  if (!p?.municipio) faltando.push("Município");
  if (!p?.telefone) faltando.push("Telefone");
  if (!p?.logradouro && !p?.endereco) faltando.push("Endereço");
  return { incompleto: faltando.length > 0, faltando };
}

// Máscaras
const maskCpf = (v: string) =>
  v.replace(/\D/g, "").slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
const maskCns = maskCnsUtil;
const maskCep = (v: string) =>
  v.replace(/\D/g, "").slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");

const MASKS: Record<string, (v: string) => string> = {
  cpf: maskCpf,
  cns: maskCns,
  telefone: applyPhoneMask,
  telefone_principal: applyPhoneMask,
  telefone_secundario: applyPhoneMask,
  cep: maskCep,
};

export function ConferirDadosPacienteModal({
  open,
  onOpenChange,
  pacienteId,
  agendamento,
  modo,
  onConfirm,
  confirmLabel,
}: ConferirDadosPacienteModalProps) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmou, setConfirmou] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [paciente, setPaciente] = useState<any | null>(null);
  const [form, setForm] = useState<any>({});
  const [lastSavedJson, setLastSavedJson] = useState<string>("");
  const formRef = useRef<any>({});
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const queryClient = useQueryClient();
  const { refreshPacientes } = usePacientes();
  const { user } = useAuth();

  const fetchPaciente = useCallback(async (id: string) => {
    console.log("[ConferirDados] Buscando paciente ID:", id);
    setLoading(true);
    setLoadError(null);
    try {
      const data = await patientService.getById(id);
      if (!data) throw new Error("Paciente não encontrado");
      
      console.log("[ConferirDados] Dados carregados com sucesso");
      const mappedForm = patientService.mapPacienteDbToForm(data);
      
      setPaciente(data);
      setForm(mappedForm);
      setLastSavedJson(JSON.stringify(mappedForm));
    } catch (err: any) {
      console.error("[ConferirDados] Erro ao carregar:", err);
      setLoadError(err?.message || "Erro ao carregar dados do paciente");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !pacienteId) return;
    setConfirmou(false);
    setDirty(false);
    setPaciente(null);
    setLoadError(null);
    fetchPaciente(pacienteId);
  }, [open, pacienteId, fetchPaciente]);

  const validacao = useMemo(() => {
    if (!paciente) return { incompleto: false, faltando: [] as string[] };
    return isCadastroIncompleto({
      sexo: form.sexo,
      telefone: form.telefone_principal,
      endereco: form.logradouro || form.endereco,
      municipio: form.municipio,
      cpf: form.cpf,
      cns: form.cns,
      data_nascimento: form.data_nascimento,
    });
  }, [paciente, form]);

  const updateField = (name: string, value: string) => {
    const masked = MASKS[name] ? MASKS[name](value) : value;
    const newForm = { ...form, [name]: masked };
    setForm(newForm);
    setDirty(true);
    setSaveStatus("idle");

    // Autosave pausado temporariamente para estabilidade. 
    // O salvamento ocorrerá ao clicar em Salvar ou ao Confirmar.
    /*
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      if (paciente) {
        handleSave(true, newForm).catch((err) => {
          console.error("[ConferirDados] Erro no autosave:", err);
        });
      }
    }, 1200);
    */
  };

  const handleSave = async (silent = false, currentForm?: any) => {
    if (!paciente) return;
    const formToSave = currentForm || form;

    const currentJson = JSON.stringify(formToSave);
    if (silent && currentJson === lastSavedJson) return;

    setSaving(true);
    setSaveStatus("saving");
    setSaveErrorMsg(null);
    
    try {
      const data = await patientService.savePacienteCadastro(
        paciente.id, 
        formToSave, 
        modo === "chegada" ? "Confirmar Chegada" : "Novo Agendamento"
      );

      setLastSavedJson(currentJson);
      setDirty(false);
      setSaveStatus("saved");
      setPaciente(data);

      queryClient.invalidateQueries({ queryKey: queryKeys.pacientes.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.pacientes.detail(paciente.id) });
      queryClient.invalidateQueries({ queryKey: ['paciente_by_id', paciente.id] });
      queryClient.invalidateQueries({ queryKey: ['conferir_dados_paciente', paciente.id] });
      queryClient.invalidateQueries({ queryKey: queryKeys.agendamentos.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.atendimentos.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.fila.all });
      queryClient.invalidateQueries({ queryKey: ['prontuario', paciente.id] });
      queryClient.invalidateQueries({ queryKey: ['ficha_cadastral', paciente.id] });
      
      try { await refreshPacientes(); } catch {}

      if (!silent) toast.success("Dados salvos com sucesso!");
    } catch (e: any) {
      const msg = e?.message || e?.details || e?.hint || "Erro desconhecido ao salvar";
      console.error("[Agenda/Pacientes] Erro real no fluxo", {
        etapa: "salvamento_paciente",
        origem: modo === "chegada" ? "Confirmar Chegada" : "Novo Agendamento",
        pacienteId: paciente.id,
        errorMessage: e?.message,
        errorDetails: e?.details,
        errorHint: e?.hint,
        errorCode: e?.code
      });
      setSaveStatus("error");
      setSaveErrorMsg(msg);
      if (!silent) toast.error("Erro ao salvar: " + msg);
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const renderFieldText = useCallback((
    label: string, name: string, type = "text", placeholder?: string,
    inputMode?: "text" | "tel" | "email" | "numeric",
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`fld-${name}`} className="text-xs text-muted-foreground">{label}</Label>
      <Input
        id={`fld-${name}`}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        value={form[name] ?? ""}
        onChange={(e) => updateField(name, e.target.value)}
        className="h-11 sm:h-10 text-base sm:text-sm"
      />
    </div>
  ), [form, updateField]);

  const renderFieldSelect = useCallback((
    label: string, name: string,
    options: { value: string; label: string }[], placeholder = "Selecione",
  ) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={form[name] || ""} onValueChange={(v) => updateField(name, v)}>
        <SelectTrigger className="h-11 sm:h-10 text-base sm:text-sm">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ), [form, updateField]);

  const isIndigena = form.raca_cor === "indigena";
  const isEstrangeiro = form.nacionalidade === "estrangeiro";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 max-w-3xl w-[calc(100vw-1rem)] sm:w-full max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden"
      >
        <DialogHeader className="px-4 sm:px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex flex-col gap-1 pr-6 font-display">
            <span className="text-base sm:text-lg">
              {modo === "chegada" ? "Confirmar Chegada — Conferência" : "Conferir Dados do Paciente"}
            </span>
            <div className="flex items-center gap-1.5 h-4">
              {saveStatus === "saving" && (
                <span className="flex items-center gap-1 text-[11px] font-normal text-muted-foreground animate-pulse">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" />
                  Salvando automaticamente...
                </span>
              )}
              {saveStatus === "saved" && (
                <span className="flex items-center gap-1 text-[11px] font-normal text-success">
                  <CheckCircle2 className="w-3 h-3" />
                  Salvo automaticamente
                </span>
              )}
              {saveStatus === "error" && (
                <span className="flex items-center gap-1 text-[11px] font-normal text-destructive" title={saveErrorMsg || ""}>
                  <AlertTriangle className="w-3 h-3" />
                  {saveErrorMsg ? `Erro ao salvar: ${saveErrorMsg.slice(0, 80)}` : "Erro ao salvar"}
                </span>
              )}
              {saveStatus === "idle" && dirty && (
                <span className="text-[11px] font-normal text-muted-foreground italic">
                  Alterações pendentes...
                </span>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-10 text-sm text-muted-foreground gap-3">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            Carregando dados do paciente…
          </div>
        ) : loadError ? (
          <div className="flex-1 flex flex-col items-center justify-center py-10 gap-3">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-destructive font-medium">{loadError}</p>
            <Button size="sm" variant="outline" onClick={() => fetchPaciente(pacienteId)}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <div
            className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div className="space-y-5 pb-4">
              {/* Alerta cadastro incompleto / completo */}
              {validacao.incompleto ? (
                <Alert variant="destructive" className="border-warning bg-warning/10">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <AlertTitle className="text-warning">Cadastro incompleto</AlertTitle>
                  <AlertDescription className="text-foreground/80">
                    Atualize os dados para evitar problemas na produção (BPA/e-SUS). A confirmação não está bloqueada.
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {validacao.faltando.map((f) => (
                        <Badge key={f} variant="outline" className="border-warning text-warning">{f}</Badge>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert className="border-success bg-success/10">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <AlertTitle className="text-success">Cadastro completo</AlertTitle>
                  <AlertDescription className="text-foreground/80">
                    Todos os dados obrigatórios estão preenchidos.
                  </AlertDescription>
                </Alert>
              )}

              {/* Bloco: dados do agendamento + profissional (modo chegada) */}
              {modo === "chegada" && agendamento && (
                <div className="grid sm:grid-cols-2 gap-4 p-4 rounded-lg bg-muted/30 border">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b pb-1.5 mb-3">
                      <Calendar className="w-4 h-4 text-primary" />Agendamento
                    </div>
                    <div className="space-y-1 text-sm">
                      <div><span className="text-muted-foreground">Data:</span> <strong>{agendamento.data}</strong></div>
                      <div><span className="text-muted-foreground">Hora:</span> <strong>{agendamento.hora}</strong></div>
                      <div><span className="text-muted-foreground">Tipo:</span> <strong>{agendamento.tipo}</strong></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b pb-1.5 mb-3">
                      <Stethoscope className="w-4 h-4 text-primary" />Profissional
                    </div>
                    <div className="space-y-1 text-sm">
                      <div><strong>{agendamento.profissionalNome}</strong></div>
                      {agendamento.profissionalEspecialidade && (
                        <div><span className="text-muted-foreground">Especialidade:</span> {agendamento.profissionalEspecialidade}</div>
                      )}
                      {agendamento.profissionalCbo && (
                        <div><span className="text-muted-foreground">CBO:</span> {agendamento.profissionalCbo}</div>
                      )}
                      {agendamento.unidadeNome && (
                        <div><span className="text-muted-foreground">Unidade:</span> {agendamento.unidadeNome}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Identificação */}
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b pb-1.5 mb-3">
                  <User className="w-4 h-4 text-primary" />Identificação
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {renderFieldText("Nome completo", "nome")}
                  {renderFieldText("Nome da mãe", "nome_mae")}
                  {renderFieldText("Data de nascimento", "data_nascimento", "date")}
                  {renderFieldSelect("Sexo", "sexo", SEXO_OPTIONS)}
                  {renderFieldText("CPF", "cpf", "text", "000.000.000-00", "numeric")}
                  {renderFieldText("CNS", "cns", "text", "000 0000 0000 0000", "numeric")}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs text-muted-foreground">Naturalidade</Label>
                    <MunicipioCombobox
                      value={form.naturalidade}
                      uf={form.naturalidade_uf}
                      onChange={(cidade, uf) => {
                        const newFormData = { ...form, naturalidade: cidade, naturalidade_uf: uf };
                        setForm(newFormData);
                        setDirty(true);
                        setSaveStatus("idle");
                        // Autosave pausado
                        /*
                        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
                        autoSaveTimerRef.current = setTimeout(() => {
                          handleSave(true, newFormData).catch(err => {
                            console.error("[ConferirDados] Erro no autosave:", err);
                            setSaveStatus("error");
                          });
                        }, 1200);
                        */
                      }}
                      placeholder="Selecione o município de naturalidade"
                    />
                  </div>
                </div>
              </div>

              {/* Sociais (padrão SUS / IBGE) */}
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b pb-1.5 mb-3">
                  <Globe className="w-4 h-4 text-primary" />Dados Sociais (SUS/IBGE)
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  {renderFieldSelect("Nacionalidade", "nacionalidade", NACIONALIDADE_OPTIONS)}
                  {renderFieldSelect("Raça/Cor (IBGE)", "raca_cor", RACA_COR_OPTIONS)}
                  {isIndigena && renderFieldSelect("Etnia (povo indígena)", "etnia", ETNIA_OPTIONS)}
                  {isIndigena && form.etnia === "X999" && renderFieldText("Especificar etnia", "etnia_outra")}
                  {isEstrangeiro && renderFieldText("País de nascimento", "pais_nascimento", "text", "Ex: VENEZUELA")}
                </div>
              </div>

              {/* Endereço */}
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b pb-1.5 mb-3">
                  <MapPin className="w-4 h-4 text-primary" />Endereço
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {/* Tipo de Logradouro: SELECT DNE oficial (código + descrição) */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs text-muted-foreground">Tipo de logradouro (DNE)</Label>
                    <LogradouroDneAutocomplete
                      value={form.tipo_logradouro_dne}
                      codigo={form.tipo_logradouro_codigo}
                      onChange={(descricao, codigo) => {
                        const newFormData = {
                          ...form,
                          tipo_logradouro_dne: descricao,
                          tipo_logradouro_codigo: codigo,
                        };
                        setForm(newFormData);
                        setDirty(true);
                        setSaveStatus("idle");
                        // Autosave pausado
                        /*
                        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
                        autoSaveTimerRef.current = setTimeout(() => {
                          handleSave(true, newFormData).catch(err => {
                            console.error("[ConferirDados] Erro no autosave:", err);
                            setSaveStatus("error");
                          });
                        }, 1200);
                        */
                      }}
                    />
                  </div>
                  {renderFieldText("Logradouro", "logradouro")}
                  {renderFieldText("Número", "numero", "text", undefined, "numeric")}
                  {renderFieldText("Complemento", "complemento")}
                  {renderFieldText("Bairro", "bairro")}
                  {renderFieldSelect("Município", "municipio", MUNICIPIOS.map((m) => ({ value: m, label: m })))}
                  {renderFieldSelect("UF", "uf", UFS.map((u) => ({ value: u, label: u })))}
                  {renderFieldText("CEP", "cep", "text", "00000-000", "numeric")}
                </div>
              </div>

              {/* Documentos e Anexos */}
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b pb-1.5 mb-3">
                  <Paperclip className="w-4 h-4 text-primary" />Documentos e Anexos
                </div>
                <PatientAttachmentManager pacienteId={pacienteId} unidadeId={user?.unidadeId} />
              </div>

              {/* Contato */}
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b pb-1.5 mb-3">
                  <Phone className="w-4 h-4 text-primary" />Contato
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  {renderFieldText("Telefone principal", "telefone_principal", "tel", "(00) 00000-0000", "tel")}
                  {renderFieldText("Telefone secundário", "telefone_secundario", "tel", "(00) 00000-0000", "tel")}
                  {renderFieldText("E-mail", "email", "email", "email@exemplo.com", "email")}
                </div>
              </div>

              {/* Botão salvar (fallback discreto) */}
              {dirty && (
                <div className="flex justify-end pt-1">
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="text-[11px] h-7 text-muted-foreground hover:text-foreground"
                    onClick={() => { handleSave().catch(() => {}); }} 
                    disabled={saving}
                  >
                    <Save className="w-3 h-3 mr-1.5" />
                    {saving ? "Salvando…" : "Salvar agora"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-3 border-t px-4 sm:px-6 py-3 shrink-0 bg-background">
          <label className="flex items-center gap-2 text-sm cursor-pointer flex-1 min-w-0">
            <Checkbox
              checked={confirmou}
              onCheckedChange={(c) => setConfirmou(c === true)}
              className="h-5 w-5"
            />
            <span className="font-medium">
              {modo === "chegada" ? "Dados conferidos" : "Confirmo que os dados foram conferidos"}
            </span>
          </label>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                try {
                  setConfirming(true);
                  console.log("[ConferirDados] Confirmando operação…");
                  
                  if (autoSaveTimerRef.current) {
                    clearTimeout(autoSaveTimerRef.current);
                    autoSaveTimerRef.current = null;
                  }

                  // Sempre tenta (re)salvar se houver alterações pendentes ou erro anterior
                  if (dirty || saveStatus === "error") {
                    try {
                      await handleSave(true);
                    } catch (saveErr: any) {
                      // handleSave já notificou o erro real; bloqueia o avanço
                      return;
                    }
                  }

                  await Promise.resolve(onConfirm());
                  console.log("[ConferirDados] Operação concluída com sucesso");
                  toast.success(modo === "chegada" ? "Chegada confirmada!" : "Dados conferidos com sucesso!");
                  onOpenChange(false);
                } catch (e: any) {
                  console.error("[ConferirDados] Erro ao confirmar:", e);
                  toast.error("Erro ao confirmar: " + (e?.message || "tente novamente"));
                } finally {
                  setConfirming(false);
                }
              }}
              disabled={!confirmou || loading || saving || confirming || !!loadError}
              className="gradient-primary text-primary-foreground flex-1 sm:flex-none"
            >
              {confirming ? "Processando…" : (confirmLabel || (modo === "chegada" ? "Confirmar Chegada" : "Confirmar e continuar"))}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
