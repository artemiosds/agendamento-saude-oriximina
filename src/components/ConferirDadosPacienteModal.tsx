import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Save, User, MapPin, Phone, Globe, Calendar, Stethoscope } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

// Máscaras simples
const maskCpf = (v: string) =>
  v.replace(/\D/g, "").slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
const maskTel = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
};
const maskCep = (v: string) =>
  v.replace(/\D/g, "").slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");

const MASKS: Record<string, (v: string) => string> = {
  cpf: maskCpf,
  telefone: maskTel,
  telefone_secundario: maskTel,
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
  const [saving, setSaving] = useState(false);
  const [confirmou, setConfirmou] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [paciente, setPaciente] = useState<any | null>(null);
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    if (!open || !pacienteId) return;
    setConfirmou(false);
    setDirty(false);
    setLoading(true);
    (async () => {
      const { data, error } = await (supabase as any)
        .from("pacientes")
        .select("*")
        .eq("id", pacienteId)
        .maybeSingle();
      if (error || !data) {
        toast.error("Paciente não encontrado.");
        onOpenChange(false);
        return;
      }
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
        sexo: data?.custom_data?.sexo || "",
        raca_cor: data?.custom_data?.raca_cor || "",
        etnia: data?.custom_data?.etnia || "",
        nacionalidade: data?.custom_data?.nacionalidade || "",
        tipo_logradouro_dne: data?.custom_data?.tipo_logradouro_dne || "",
        numero: data?.custom_data?.numero || "",
        complemento: data?.custom_data?.complemento || "",
        bairro: data?.custom_data?.bairro || "",
        uf: data?.custom_data?.uf || "",
        cep: data?.custom_data?.cep || "",
        telefone_secundario: data?.custom_data?.telefone_secundario || "",
      });
      setLoading(false);
    })();
  }, [open, pacienteId]);

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
        raca_cor: form.raca_cor,
        etnia: form.etnia,
        nacionalidade: form.nacionalidade,
        tipo_logradouro_dne: form.tipo_logradouro_dne,
        numero: form.numero,
        complemento: form.complemento,
        bairro: form.bairro,
        uf: form.uf,
        cep: form.cep,
        telefone_secundario: form.telefone_secundario,
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
      toast.success("Dados atualizados!");
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e?.message || "desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  const Field = ({
    label,
    name,
    type = "text",
    placeholder,
    inputMode,
  }: {
    label: string;
    name: string;
    type?: string;
    placeholder?: string;
    inputMode?: "text" | "tel" | "email" | "numeric";
  }) => (
    <div className="space-y-1.5">
      <Label htmlFor={`fld-${name}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
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

  const SectionTitle = ({ icon: Icon, children }: { icon: any; children: React.ReactNode }) => (
    <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b pb-1.5 mb-3">
      <Icon className="w-4 h-4 text-primary" />
      {children}
    </div>
  );

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
                        <Badge key={f} variant="outline" className="border-warning text-warning">
                          {f}
                        </Badge>
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
                  <Field label="Nome completo" name="nome" />
                  <Field label="Nome da mãe" name="nome_mae" />
                  <Field label="Data de nascimento" name="data_nascimento" type="date" />
                  <Field label="Sexo (M/F)" name="sexo" placeholder="M ou F" />
                  <Field label="CPF" name="cpf" inputMode="numeric" placeholder="000.000.000-00" />
                  <Field label="CNS" name="cns" inputMode="numeric" placeholder="15 dígitos" />
                </div>
              </div>

              {/* Sociais */}
              <div>
                <SectionTitle icon={Globe}>Dados Sociais</SectionTitle>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Field label="Raça/Cor" name="raca_cor" />
                  <Field label="Etnia" name="etnia" />
                  <Field label="Nacionalidade" name="nacionalidade" />
                </div>
              </div>

              {/* Endereço */}
              <div>
                <SectionTitle icon={MapPin}>Endereço</SectionTitle>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Tipo de logradouro (DNE)" name="tipo_logradouro_dne" />
                  <Field label="Logradouro" name="endereco" />
                  <Field label="Número" name="numero" inputMode="numeric" />
                  <Field label="Complemento" name="complemento" />
                  <Field label="Bairro" name="bairro" />
                  <Field label="Município" name="municipio" />
                  <Field label="UF" name="uf" placeholder="PA" />
                  <Field label="CEP" name="cep" inputMode="numeric" placeholder="00000-000" />
                </div>
              </div>

              {/* Contato */}
              <div>
                <SectionTitle icon={Phone}>Contato</SectionTitle>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Field label="Telefone principal" name="telefone" type="tel" inputMode="tel" placeholder="(00) 00000-0000" />
                  <Field label="Telefone secundário" name="telefone_secundario" type="tel" inputMode="tel" />
                  <Field label="E-mail" name="email" type="email" inputMode="email" />
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
                if (dirty) await handleSave();
                onConfirm();
                onOpenChange(false);
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
