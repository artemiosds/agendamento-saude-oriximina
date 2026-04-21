import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, CheckCircle2, Pencil, Save, User, MapPin, Phone, Globe, Calendar, Stethoscope } from "lucide-react";
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

const REQUIRED_FIELDS = ["cpfOuCns", "data_nascimento", "sexo", "municipio", "telefone", "endereco"] as const;

function isCadastroIncompleto(p: any): { incompleto: boolean; faltando: string[] } {
  const faltando: string[] = [];
  const cpf = (p?.cpf || "").replace(/\D/g, "");
  const cns = (p?.cns || "").replace(/\D/g, "");
  if (cpf.length !== 11 && cns.length !== 15) faltando.push("CPF ou CNS");
  if (!p?.data_nascimento) faltando.push("Data de nascimento");
  if (!p?.custom_data?.sexo) faltando.push("Sexo");
  if (!p?.municipio) faltando.push("Município");
  if (!p?.telefone) faltando.push("Telefone");
  if (!p?.endereco) faltando.push("Endereço");
  return { incompleto: faltando.length > 0, faltando };
}

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
  const [editing, setEditing] = useState(false);
  const [confirmou, setConfirmou] = useState(false);
  const [paciente, setPaciente] = useState<any | null>(null);
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    if (!open || !pacienteId) return;
    setConfirmou(false);
    setEditing(false);
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
      ...paciente,
      custom_data: {
        ...(paciente.custom_data || {}),
        sexo: form.sexo,
      },
      telefone: form.telefone,
      endereco: form.endereco,
      municipio: form.municipio,
      cpf: form.cpf,
      cns: form.cns,
      data_nascimento: form.data_nascimento,
    });
  }, [paciente, form]);

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
          data_nascimento: form.data_nascimento,
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
      setEditing(false);
      toast.success("Dados atualizados!");
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e?.message || "desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ label, value, name, type = "text" }: { label: string; value: string; name: string; type?: string }) => (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {editing ? (
        <Input
          type={type}
          value={form[name] ?? ""}
          onChange={(e) => setForm((p: any) => ({ ...p, [name]: e.target.value }))}
          className="h-8 text-sm"
        />
      ) : (
        <div className="text-sm font-medium text-foreground min-h-[2rem] py-1">
          {value || <span className="text-muted-foreground italic">Não informado</span>}
        </div>
      )}
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
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            {modo === "chegada" ? "Confirmar Chegada — Conferência" : "Conferir Dados do Paciente"}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-10 text-sm text-muted-foreground">
            Carregando dados do paciente…
          </div>
        ) : (
          <ScrollArea className="flex-1 pr-3 -mr-3">
            <div className="space-y-5 pb-2">
              {/* Alerta cadastro incompleto */}
              {validacao.incompleto && (
                <Alert variant="destructive" className="border-warning bg-warning/10 text-warning-foreground">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <AlertTitle className="text-warning">Cadastro incompleto</AlertTitle>
                  <AlertDescription className="text-foreground/80">
                    Atualize os dados para evitar problemas na produção (BPA/e-SUS).
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {validacao.faltando.map((f) => (
                        <Badge key={f} variant="outline" className="border-warning text-warning">
                          {f}
                        </Badge>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {!validacao.incompleto && (
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

              {/* Botão editar */}
              <div className="flex justify-end">
                {!editing ? (
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                    <Pencil className="w-3.5 h-3.5 mr-1.5" /> Atualizar dados do paciente
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                      Cancelar
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                      <Save className="w-3.5 h-3.5 mr-1.5" /> {saving ? "Salvando…" : "Salvar atualização"}
                    </Button>
                  </div>
                )}
              </div>

              {/* Identificação */}
              <div>
                <SectionTitle icon={User}>Identificação</SectionTitle>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Nome completo" name="nome" value={form.nome} />
                  <Field label="Nome da mãe" name="nome_mae" value={form.nome_mae} />
                  <Field label="Data de nascimento" name="data_nascimento" type="date" value={form.data_nascimento} />
                  <Field label="Sexo" name="sexo" value={form.sexo} />
                  <Field label="CPF" name="cpf" value={form.cpf} />
                  <Field label="CNS" name="cns" value={form.cns} />
                </div>
              </div>

              {/* Sociais */}
              <div>
                <SectionTitle icon={Globe}>Dados Sociais</SectionTitle>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Field label="Raça/Cor" name="raca_cor" value={form.raca_cor} />
                  <Field label="Etnia" name="etnia" value={form.etnia} />
                  <Field label="Nacionalidade" name="nacionalidade" value={form.nacionalidade} />
                </div>
              </div>

              {/* Endereço */}
              <div>
                <SectionTitle icon={MapPin}>Endereço</SectionTitle>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Tipo de logradouro (DNE)" name="tipo_logradouro_dne" value={form.tipo_logradouro_dne} />
                  <Field label="Logradouro" name="endereco" value={form.endereco} />
                  <Field label="Número" name="numero" value={form.numero} />
                  <Field label="Complemento" name="complemento" value={form.complemento} />
                  <Field label="Bairro" name="bairro" value={form.bairro} />
                  <Field label="Município" name="municipio" value={form.municipio} />
                  <Field label="UF" name="uf" value={form.uf} />
                  <Field label="CEP" name="cep" value={form.cep} />
                </div>
              </div>

              {/* Contato */}
              <div>
                <SectionTitle icon={Phone}>Contato</SectionTitle>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Field label="Telefone principal" name="telefone" value={form.telefone} />
                  <Field label="Telefone secundário" name="telefone_secundario" value={form.telefone_secundario} />
                  <Field label="E-mail" name="email" type="email" value={form.email} />
                </div>
              </div>
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-3 border-t pt-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer flex-1">
            <Checkbox
              checked={confirmou}
              onCheckedChange={(c) => setConfirmou(c === true)}
            />
            <span className="font-medium">
              {modo === "chegada" ? "Dados conferidos" : "Confirmo que os dados foram conferidos"}
            </span>
          </label>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
              disabled={!confirmou || editing || loading}
              className="gradient-primary text-primary-foreground"
            >
              {confirmLabel || (modo === "chegada" ? "Confirmar Chegada" : "Confirmar e continuar")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
