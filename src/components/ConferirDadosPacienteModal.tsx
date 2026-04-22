import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, Save, User, MapPin, Phone, Globe, Calendar, Stethoscope } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import LogradouroDneAutocomplete from "@/components/LogradouroDneAutocomplete";
import { applyPhoneMask } from "@/lib/phoneUtils";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/queries/queryKeys";

export interface ConferirDadosPacienteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pacienteId: string;
  agendamentoId?: string;
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
  onConfirm: () => Promise<void> | void;
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
  { value: "nao_declarado", label: "Não declarado" },
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
  if (!p?.endereco) faltando.push("Endereço");
  return { incompleto: faltando.length > 0, faltando };
}

// Máscaras
const maskCpf = (v: string) =>
  v.replace(/\D/g, "").slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
const maskCns = (v: string) =>
  v.replace(/\D/g, "").slice(0, 15).replace(/(\d{4})(?=\d)/g, "$1 ").trim();
const maskCep = (v: string) =>
  v.replace(/\D/g, "").slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");

const MASKS: Record<string, (v: string) => string> = {
  cpf: maskCpf,
  cns: maskCns,
  telefone: applyPhoneMask,
  telefone_secundario: applyPhoneMask,
  cep: maskCep,
};

export function ConferirDadosPacienteModal({
  open,
  onOpenChange,
  pacienteId,
  agendamentoId,
  agendamento,
  modo,
  onConfirm,
  confirmLabel,
}: ConferirDadosPacienteModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmou, setConfirmou] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [paciente, setPaciente] = useState<any | null>(null);
  const [form, setForm] = useState<any>({});
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open || !pacienteId) return;

    let cancelled = false;
    setConfirmou(false);
    setDirty(false);
    setLoadError(null);
    setLoading(true);

    console.log(`Abrindo Conferir Dados do Paciente para agendamento ID: ${agendamentoId || "novo"}`);
    console.log(`Buscando dados do paciente ID: ${pacienteId}`);

    (async () => {
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error("Tempo limite excedido ao carregar os dados do paciente.")), 10000);
        });

        const queryPromise = (supabase as any)
          .from("pacientes")
          .select("*")
          .eq("id", pacienteId)
          .maybeSingle();

        const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

        if (error) throw error;
        if (!data) throw new Error("Paciente não encontrado.");
        if (cancelled) return;

        const cd = data.custom_data || {};
        setPaciente(data);
        setForm({
          nome: data.nome || "",
          nome_mae: data.nome_mae || "",
          data_nascimento: data.data_nascimento || "",
          cpf: data.cpf || "",
          cns: data.cns || "",
          telefone: data.telefone || "",
          email: data.email || "",
          endereco: data.endereco || "",
          municipio: data.municipio || "",
          sexo: cd.sexo || "",
          raca_cor: cd.racaCor || cd.raca_cor || "",
          etnia: cd.etnia || "",
          etnia_outra: cd.etniaOutra || "",
          nacionalidade: cd.nacionalidade || "brasileiro",
          pais_nascimento: cd.paisNascimento || "",
          tipo_logradouro_dne: cd.tipoLogradouroDne || cd.tipo_logradouro_dne || "",
          tipo_logradouro_codigo: cd.tipoLogradouroCodigo || cd.tipo_logradouro_codigo || "",
          numero: cd.numero || "",
          complemento: cd.complemento || "",
          bairro: cd.bairro || "",
          uf: cd.uf || "PA",
          cep: cd.cep || "",
          telefone_secundario: cd.telefoneSecundario || cd.telefone_secundario || "",
        });
        console.log("Dados carregados com sucesso");
      } catch (e: any) {
        if (cancelled) return;
        const message = e?.message || "Não foi possível carregar os dados do paciente.";
        console.error("Erro ao carregar:", e);
        setLoadError(message);
        toast.error(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, pacienteId, agendamentoId, reloadKey]);

  const validacao = useMemo(() => {
    if (!paciente) return { incompleto: false, faltando: [] as string[] };
    return isCadastroIncompleto({
      sexo: form.sexo,
      telefone: form.telefone,
      endereco: form.endereco,
      municipio: form.municipio,
      cpf: form.cpf,
      cns: form.cns,
      data_nascimento: form.data_nascimento,
    });
  }, [paciente, form]);

  const updateField = (name: string, value: string) => {
    const masked = MASKS[name] ? MASKS[name](value) : value;
    setForm((p: any) => ({ ...p, [name]: masked }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!paciente) return;
    setSaving(true);
    try {
      const customData = {
        ...(paciente.custom_data || {}),
        sexo: form.sexo,
        // Persistir Raça/Cor em ambas as chaves (compat com BPA)
        racaCor: form.raca_cor,
        raca_cor: form.raca_cor,
        etnia: form.etnia,
        etniaOutra: form.etnia_outra,
        nacionalidade: form.nacionalidade,
        paisNascimento: form.pais_nascimento,
        // Tipo de logradouro DNE: salvar código + descrição
        tipoLogradouroDne: form.tipo_logradouro_dne,
        tipoLogradouroCodigo: form.tipo_logradouro_codigo,
        numero: form.numero,
        complemento: form.complemento,
        bairro: form.bairro,
        uf: form.uf,
        cep: form.cep,
        telefoneSecundario: form.telefone_secundario,
        data_ultima_validacao_cadastro: new Date().toISOString(),
      };
      const { error } = await (supabase as any)
        .from("pacientes")
        .update({
          nome: form.nome,
          nome_mae: form.nome_mae,
          data_nascimento: form.data_nascimento || null,
          cpf: form.cpf,
          cns: form.cns,
          telefone: form.telefone,
          email: form.email,
          endereco: form.endereco,
          municipio: form.municipio,
          custom_data: customData,
        })
        .eq("id", paciente.id);
      if (error) throw error;
      setPaciente({ ...paciente, ...form, custom_data: customData });
      setDirty(false);
      // CRÍTICO: invalidar caches para refletir em prontuário, agendamento, BPA, etc.
      queryClient.invalidateQueries({ queryKey: queryKeys.pacientes.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.pacientes.detail(paciente.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agendamentos.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.prontuarios.byPaciente(paciente.id) });
      toast.success("Dados atualizados!");
      return;
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e?.message || "desconhecido"));
      throw e;
    } finally {
      setSaving(false);
    }
  };

  // ───────── Componentes inline ─────────
  const FieldText = ({
    label, name, type = "text", placeholder, inputMode,
  }: {
    label: string; name: string; type?: string;
    placeholder?: string; inputMode?: "text" | "tel" | "email" | "numeric";
  }) => (
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
  );

  const FieldSelect = ({
    label, name, options, placeholder = "Selecione",
  }: {
    label: string; name: string;
    options: { value: string; label: string }[]; placeholder?: string;
  }) => (
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
  );

  const SectionTitle = ({ icon: Icon, children }: { icon: any; children: React.ReactNode }) => (
    <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b pb-1.5 mb-3">
      <Icon className="w-4 h-4 text-primary" />
      {children}
    </div>
  );

  const isIndigena = form.raca_cor === "indigena";
  const isEstrangeiro = form.nacionalidade === "estrangeiro";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 max-w-3xl w-[calc(100vw-1rem)] sm:w-full max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden"
      >
        <DialogHeader className="px-4 sm:px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 font-display text-base sm:text-lg pr-6">
            {modo === "chegada" ? "Confirmar Chegada — Conferência" : "Conferir Dados do Paciente"}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-10 text-sm text-muted-foreground">
            Carregando dados do paciente…
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
                    <SectionTitle icon={Calendar}>Agendamento</SectionTitle>
                    <div className="space-y-1 text-sm">
                      <div><span className="text-muted-foreground">Data:</span> <strong>{agendamento.data}</strong></div>
                      <div><span className="text-muted-foreground">Hora:</span> <strong>{agendamento.hora}</strong></div>
                      <div><span className="text-muted-foreground">Tipo:</span> <strong>{agendamento.tipo}</strong></div>
                    </div>
                  </div>
                  <div>
                    <SectionTitle icon={Stethoscope}>Profissional</SectionTitle>
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
                <SectionTitle icon={User}>Identificação</SectionTitle>
                <div className="grid sm:grid-cols-2 gap-3">
                  <FieldText label="Nome completo" name="nome" />
                  <FieldText label="Nome da mãe" name="nome_mae" />
                  <FieldText label="Data de nascimento" name="data_nascimento" type="date" />
                  <FieldSelect label="Sexo" name="sexo" options={SEXO_OPTIONS} />
                  <FieldText label="CPF" name="cpf" inputMode="numeric" placeholder="000.000.000-00" />
                  <FieldText label="CNS" name="cns" inputMode="numeric" placeholder="000 0000 0000 0000" />
                </div>
              </div>

              {/* Sociais (padrão SUS / IBGE) */}
              <div>
                <SectionTitle icon={Globe}>Dados Sociais (SUS/IBGE)</SectionTitle>
                <div className="grid sm:grid-cols-3 gap-3">
                  <FieldSelect label="Nacionalidade" name="nacionalidade" options={NACIONALIDADE_OPTIONS} />
                  <FieldSelect label="Raça/Cor (IBGE)" name="raca_cor" options={RACA_COR_OPTIONS} />
                  {isIndigena && (
                    <FieldSelect label="Etnia (povo indígena)" name="etnia" options={ETNIA_OPTIONS} />
                  )}
                  {isIndigena && form.etnia === "X999" && (
                    <FieldText label="Especificar etnia" name="etnia_outra" />
                  )}
                  {isEstrangeiro && (
                    <FieldText label="País de nascimento" name="pais_nascimento" placeholder="Ex: VENEZUELA" />
                  )}
                </div>
              </div>

              {/* Endereço */}
              <div>
                <SectionTitle icon={MapPin}>Endereço</SectionTitle>
                <div className="grid sm:grid-cols-2 gap-3">
                  {/* Tipo de Logradouro: SELECT DNE oficial (código + descrição) */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs text-muted-foreground">Tipo de logradouro (DNE)</Label>
                    <LogradouroDneAutocomplete
                      value={form.tipo_logradouro_dne}
                      codigo={form.tipo_logradouro_codigo}
                      onChange={(descricao, codigo) => {
                        setForm((p: any) => ({
                          ...p,
                          tipo_logradouro_dne: descricao,
                          tipo_logradouro_codigo: codigo,
                        }));
                        setDirty(true);
                      }}
                    />
                  </div>
                  <FieldText label="Logradouro" name="endereco" />
                  <FieldText label="Número" name="numero" inputMode="numeric" />
                  <FieldText label="Complemento" name="complemento" />
                  <FieldText label="Bairro" name="bairro" />
                  <FieldSelect
                    label="Município"
                    name="municipio"
                    options={MUNICIPIOS.map((m) => ({ value: m, label: m }))}
                  />
                  <FieldSelect
                    label="UF"
                    name="uf"
                    options={UFS.map((u) => ({ value: u, label: u }))}
                  />
                  <FieldText label="CEP" name="cep" inputMode="numeric" placeholder="00000-000" />
                </div>
              </div>

              {/* Contato */}
              <div>
                <SectionTitle icon={Phone}>Contato</SectionTitle>
                <div className="grid sm:grid-cols-3 gap-3">
                  <FieldText label="Telefone principal" name="telefone" type="tel" inputMode="tel" placeholder="(00) 00000-0000" />
                  <FieldText label="Telefone secundário" name="telefone_secundario" type="tel" inputMode="tel" placeholder="(00) 00000-0000" />
                  <FieldText label="E-mail" name="email" type="email" inputMode="email" placeholder="email@exemplo.com" />
                </div>
              </div>

              {/* Botão salvar (quando houver alterações) */}
              {dirty && (
                <div className="flex justify-end pt-1">
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    <Save className="w-3.5 h-3.5 mr-1.5" />
                    {saving ? "Salvando…" : "Salvar alterações"}
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
                  if (dirty) await handleSave();
                  await Promise.resolve(onConfirm());
                  toast.success(modo === "chegada" ? "Chegada confirmada!" : "Dados conferidos!");
                  onOpenChange(false);
                } catch (e: any) {
                  toast.error("Erro ao confirmar: " + (e?.message || "tente novamente"));
                }
              }}
              disabled={!confirmou || loading || saving}
              className="gradient-primary text-primary-foreground flex-1 sm:flex-none"
            >
              {confirmLabel || (modo === "chegada" ? "Confirmar Chegada" : "Confirmar e continuar")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
