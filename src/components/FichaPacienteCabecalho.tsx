import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Pencil, Save, X, Lock, Search, User, CreditCard, Heart, Activity,
  FileText, Stethoscope, MapPin, Users, Phone, Mail, AlertCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface TriagemVitals {
  pressao_arterial?: string;
  temperatura?: number;
  saturacao_oxigenio?: number;
  frequencia_cardiaca?: number;
  classificacao_risco?: string;
}

interface FichaPacienteCabecalhoProps {
  pacienteId: string;
  profissionalNome: string;
  profissionalId: string;
  agendamentoId?: string;
  triagem?: TriagemVitals | null;
  funcionarios: { id: string; nome: string; profissao: string; ativo: boolean | null }[];
  onPacienteUpdated?: () => void;
}

const RISCO_COLORS: Record<string, { bg: string; text: string; label: string; border: string }> = {
  nao_urgente: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", label: "Não urgente" },
  pouco_urgente: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", label: "Pouco urgente" },
  urgente: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", label: "Urgente" },
  muito_urgente: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", label: "Muito urgente" },
  emergencia: { bg: "bg-red-100", text: "text-red-800", border: "border-red-300", label: "Emergência" },
};

const RISCO_DOT: Record<string, string> = {
  nao_urgente: "bg-emerald-500",
  pouco_urgente: "bg-amber-500",
  urgente: "bg-orange-500",
  muito_urgente: "bg-red-500",
  emergencia: "bg-red-600",
};

const calcularIdade = (dataNasc: string): string => {
  if (!dataNasc) return "—";
  const nascimento = new Date(dataNasc + "T12:00:00");
  if (isNaN(nascimento.getTime())) return "—";
  const hoje = new Date();
  let anos = hoje.getFullYear() - nascimento.getFullYear();
  const m = hoje.getMonth() - nascimento.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nascimento.getDate())) anos--;
  if (anos < 1) {
    let meses = (hoje.getFullYear() - nascimento.getFullYear()) * 12 + (hoje.getMonth() - nascimento.getMonth());
    if (hoje.getDate() < nascimento.getDate()) meses--;
    return meses <= 0 ? "< 1 mês" : `${meses} mes(es)`;
  }
  return `${anos} ano(s)`;
};

// Validators
const validateCPF = (cpf: string): boolean => {
  if (!cpf) return true; // optional
  const clean = cpf.replace(/\D/g, "");
  return clean.length === 11;
};
const validateCNS = (cns: string): boolean => {
  if (!cns) return true;
  const clean = cns.replace(/\D/g, "");
  return clean.length === 0 || clean.length === 15;
};
const validateEmail = (email: string): boolean => {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};
const validatePhone = (phone: string): boolean => {
  if (!phone) return true;
  const clean = phone.replace(/\D/g, "");
  return clean.length === 0 || clean.length >= 10;
};

const FichaPacienteCabecalho: React.FC<FichaPacienteCabecalhoProps> = ({
  pacienteId, profissionalNome, profissionalId, agendamentoId,
  triagem, funcionarios, onPacienteUpdated,
}) => {
  const [paciente, setPaciente] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editData, setEditData] = useState({
    nome: "",
    data_nascimento: "",
    cpf: "",
    cns: "",
    cid: "",
    nome_mae: "",
    endereco: "",
    telefone: "",
    email: "",
    contato_emergencia_nome: "",
    contato_emergencia_telefone: "",
    profissionalId: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [cidSearch, setCidSearch] = useState("");
  const [cidResults, setCidResults] = useState<{ codigo: string; descricao: string }[]>([]);
  const [cidOpen, setCidOpen] = useState(false);
  const [cidLoading, setCidLoading] = useState(false);

  useEffect(() => {
    if (!pacienteId) return;
    const load = async () => {
      const { data } = await supabase.from("pacientes").select("*").eq("id", pacienteId).single();
      if (data) setPaciente(data);
    };
    load();
  }, [pacienteId]);

  const startEdit = () => {
    if (!paciente) return;
    const cd = (paciente.custom_data || {}) as Record<string, any>;
    setEditData({
      nome: paciente.nome || "",
      data_nascimento: paciente.data_nascimento || "",
      cpf: paciente.cpf || "",
      cns: paciente.cns || "",
      cid: paciente.cid || "",
      nome_mae: paciente.nome_mae || "",
      endereco: paciente.endereco || "",
      telefone: paciente.telefone || "",
      email: paciente.email || "",
      contato_emergencia_nome: cd.contato_emergencia_nome || "",
      contato_emergencia_telefone: cd.contato_emergencia_telefone || "",
      profissionalId: profissionalId,
    });
    setCidSearch(paciente.cid || "");
    setErrors({});
    setEditing(true);
    setExpanded(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setErrors({});
  };

  useEffect(() => {
    if (!cidSearch || cidSearch.length < 2) { setCidResults([]); return; }
    const timer = setTimeout(async () => {
      setCidLoading(true);
      const { data } = await supabase.from("cid10_codigos").select("codigo, descricao")
        .or(`codigo.ilike.%${cidSearch}%,descricao.ilike.%${cidSearch}%`)
        .limit(15);
      setCidResults(data || []);
      setCidLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [cidSearch]);

  const handleSave = async () => {
    const newErrors: Record<string, string> = {};
    if (!editData.nome.trim()) newErrors.nome = "Nome é obrigatório";
    if (!validateCPF(editData.cpf)) newErrors.cpf = "CPF inválido (11 dígitos)";
    if (!validateCNS(editData.cns)) newErrors.cns = "CNS inválido (15 dígitos)";
    if (!validateEmail(editData.email)) newErrors.email = "E-mail inválido";
    if (!validatePhone(editData.telefone)) newErrors.telefone = "Telefone inválido";
    if (!validatePhone(editData.contato_emergencia_telefone)) newErrors.contato_emergencia_telefone = "Telefone inválido";
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.error("Corrija os campos destacados antes de salvar");
      return;
    }

    setSaving(true);
    try {
      const prevCustom = (paciente.custom_data || {}) as Record<string, any>;
      const newCustom = {
        ...prevCustom,
        contato_emergencia_nome: editData.contato_emergencia_nome.trim(),
        contato_emergencia_telefone: editData.contato_emergencia_telefone.trim(),
      };

      const { error } = await supabase.from("pacientes").update({
        nome: editData.nome.trim(),
        data_nascimento: editData.data_nascimento,
        cpf: editData.cpf,
        cns: editData.cns,
        cid: editData.cid,
        nome_mae: editData.nome_mae,
        endereco: editData.endereco,
        telefone: editData.telefone,
        email: editData.email,
        custom_data: newCustom,
      }).eq("id", pacienteId);

      if (error) throw error;

      if (agendamentoId && editData.profissionalId !== profissionalId) {
        const profFunc = funcionarios.find(f => f.id === editData.profissionalId);
        await supabase.from("agendamentos").update({
          profissional_id: editData.profissionalId,
          profissional_nome: profFunc?.nome || "",
        }).eq("id", agendamentoId);
      }

      const { data } = await supabase.from("pacientes").select("*").eq("id", pacienteId).single();
      if (data) setPaciente(data);

      toast.success("Dados do paciente atualizados");
      setEditing(false);
      onPacienteUpdated?.();
    } catch (err) {
      console.error("[salvarFichaPaciente]", err);
      toast.error("Erro ao salvar — tente novamente");
    }
    setSaving(false);
  };

  if (!paciente) return null;

  const idade = calcularIdade(paciente.data_nascimento);
  const riscoData = triagem?.classificacao_risco ? RISCO_COLORS[triagem.classificacao_risco] : null;
  const riscoDot = triagem?.classificacao_risco ? RISCO_DOT[triagem.classificacao_risco] : null;
  const activeProfessionals = funcionarios.filter(f => f.ativo && f.profissao);
  const cidDisplay = paciente.cid || "—";
  const customData = (paciente.custom_data || {}) as Record<string, any>;

  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-muted/40 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <FileText className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold font-display text-foreground tracking-wide">
              Ficha do Paciente
            </h3>
            <span className="text-[10px] text-muted-foreground font-mono">
              Nº {paciente.id?.slice(-6) || "000000"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {!editing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(e => !e)}
              className="h-8 text-xs gap-1.5 rounded-lg"
            >
              {expanded ? <><ChevronUp className="w-3 h-3" /> Recolher</> : <><ChevronDown className="w-3 h-3" /> Ver tudo</>}
            </Button>
          )}
          {!editing ? (
            <Button variant="outline" size="sm" onClick={startEdit} className="h-8 text-xs gap-1.5 rounded-lg border-border/60 hover:bg-accent/50">
              <Pencil className="w-3 h-3" /> Editar
            </Button>
          ) : (
            <div className="flex gap-1.5">
              <Button size="sm" onClick={handleSave} disabled={saving} className="h-8 text-xs gap-1.5 rounded-lg">
                <Save className="w-3 h-3" /> {saving ? "Salvando..." : "Salvar"}
              </Button>
              <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving} className="h-8 text-xs gap-1.5 rounded-lg">
                <X className="w-3 h-3" /> Cancelar
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {!editing ? (
          /* ── READ MODE ── */
          <div className="space-y-4">
            {/* Patient name row */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/8 border border-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="w-5 h-5 text-primary/70" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-foreground leading-tight truncate">
                  {paciente.nome}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {paciente.data_nascimento
                    ? `${new Date(paciente.data_nascimento + "T12:00:00").toLocaleDateString("pt-BR")} · ${idade}`
                    : "Data de nascimento não informada"}
                </p>
              </div>
            </div>

            {/* Compact info grid (always visible) */}
            <div className="grid grid-cols-2 gap-3">
              <InfoField icon={<CreditCard className="w-3.5 h-3.5" />} label="Cartão SUS (CNS)" value={formatCNS(paciente.cns) || "—"} mono />
              <InfoField icon={<CreditCard className="w-3.5 h-3.5" />} label="CPF" value={paciente.cpf || "—"} mono />
              <InfoField icon={<Activity className="w-3.5 h-3.5" />} label="CID-10" value={cidDisplay} />
              <InfoField icon={<Stethoscope className="w-3.5 h-3.5" />} label="Profissional responsável" value={profissionalNome || "—"} />
            </div>

            {/* Expanded info */}
            {expanded && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/40">
                <InfoField icon={<Users className="w-3.5 h-3.5" />} label="Nome da mãe" value={paciente.nome_mae || "—"} />
                <InfoField icon={<Phone className="w-3.5 h-3.5" />} label="Telefone" value={paciente.telefone || "—"} mono />
                <InfoField icon={<Mail className="w-3.5 h-3.5" />} label="E-mail" value={paciente.email || "—"} />
                <InfoField icon={<MapPin className="w-3.5 h-3.5" />} label="Endereço" value={paciente.endereco || "—"} />
                <InfoField
                  icon={<User className="w-3.5 h-3.5" />}
                  label="Raça/Cor (IBGE)"
                  value={
                    customData.racaCor || customData.raca_cor
                      ? String(customData.racaCor || customData.raca_cor).replace(/_/g, " ")
                      : "—"
                  }
                />
                <InfoField
                  icon={<User className="w-3.5 h-3.5" />}
                  label="Nacionalidade"
                  value={customData.nacionalidade ? String(customData.nacionalidade) : "—"}
                />
                {(customData.racaCor === "indigena" || customData.raca_cor === "indigena") && (
                  <InfoField
                    icon={<User className="w-3.5 h-3.5" />}
                    label="Etnia"
                    value={customData.etnia === "X999" ? (customData.etniaOutra || "—") : (customData.etnia || "—")}
                  />
                )}
                {customData.nacionalidade === "estrangeiro" && (
                  <InfoField
                    icon={<MapPin className="w-3.5 h-3.5" />}
                    label="País de nascimento"
                    value={customData.paisNascimento || "—"}
                  />
                )}
                <InfoField
                  icon={<AlertCircle className="w-3.5 h-3.5" />}
                  label="Contato de emergência"
                  value={
                    customData.contato_emergencia_nome
                      ? `${customData.contato_emergencia_nome}${customData.contato_emergencia_telefone ? ` · ${customData.contato_emergencia_telefone}` : ""}`
                      : "—"
                  }
                />
              </div>
            )}
          </div>
        ) : (
          /* ── EDIT MODE ── */
          <div className="space-y-4">
            {/* Identificação */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Identificação</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs font-medium text-muted-foreground">Nome completo <span className="text-destructive">*</span></Label>
                  <Input
                    value={editData.nome}
                    onChange={e => { setEditData(d => ({ ...d, nome: e.target.value })); setErrors(er => ({ ...er, nome: "" })); }}
                    className={`mt-1 ${errors.nome ? "border-destructive" : ""}`}
                  />
                  {errors.nome && <p className="text-xs text-destructive mt-0.5">{errors.nome}</p>}
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">Nº Prontuário <Lock className="w-3 h-3" /></Label>
                  <Input value={`#${paciente.id?.slice(-6) || ""}`} disabled className="opacity-50 mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Data de nascimento</Label>
                  <Input type="date" value={editData.data_nascimento} onChange={e => setEditData(d => ({ ...d, data_nascimento: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">Idade <Lock className="w-3 h-3" /></Label>
                  <Input value={calcularIdade(editData.data_nascimento)} disabled className="opacity-50 mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">CPF</Label>
                  <Input
                    value={editData.cpf}
                    onChange={e => { setEditData(d => ({ ...d, cpf: e.target.value })); setErrors(er => ({ ...er, cpf: "" })); }}
                    placeholder="000.000.000-00"
                    className={`mt-1 ${errors.cpf ? "border-destructive" : ""}`}
                  />
                  {errors.cpf && <p className="text-xs text-destructive mt-0.5">{errors.cpf}</p>}
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Cartão SUS (CNS)</Label>
                  <Input
                    value={editData.cns}
                    onChange={e => { setEditData(d => ({ ...d, cns: maskCNS(e.target.value) })); setErrors(er => ({ ...er, cns: "" })); }}
                    placeholder="000 0000 0000 0000"
                    className={`mt-1 ${errors.cns ? "border-destructive" : ""}`}
                  />
                  {errors.cns && <p className="text-xs text-destructive mt-0.5">{errors.cns}</p>}
                </div>
                <div className="col-span-2">
                  <Label className="text-xs font-medium text-muted-foreground">Nome da mãe</Label>
                  <Input value={editData.nome_mae} onChange={e => setEditData(d => ({ ...d, nome_mae: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">CID-10</Label>
                  <Popover open={cidOpen} onOpenChange={setCidOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal h-10 text-sm mt-1">
                        <Search className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                        {editData.cid || "Buscar CID..."}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[320px] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput placeholder="Código ou nome da doença..." value={cidSearch} onValueChange={setCidSearch} />
                        <CommandList>
                          {cidLoading && <div className="p-3 text-xs text-muted-foreground text-center">Buscando...</div>}
                          <CommandEmpty>{cidSearch.length < 2 ? "Digite pelo menos 2 caracteres" : "Nenhum CID encontrado"}</CommandEmpty>
                          <CommandGroup>
                            {cidResults.map(c => (
                              <CommandItem key={c.codigo} value={c.codigo} onSelect={() => {
                                setEditData(d => ({ ...d, cid: `${c.codigo} — ${c.descricao}` }));
                                setCidOpen(false);
                              }}>
                                <span className="font-mono text-xs mr-2">{c.codigo}</span>
                                <span className="text-xs truncate">{c.descricao}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Profissional responsável</Label>
                  <Select value={editData.profissionalId} onValueChange={v => setEditData(d => ({ ...d, profissionalId: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {activeProfessionals.map(f => (
                        <SelectItem key={f.id} value={f.id}>{f.nome} — {f.profissao}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Contato e Endereço */}
            <div className="pt-3 border-t border-border/40">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Contato e Endereço</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Telefone</Label>
                  <Input
                    value={editData.telefone}
                    onChange={e => { setEditData(d => ({ ...d, telefone: e.target.value })); setErrors(er => ({ ...er, telefone: "" })); }}
                    placeholder="(00) 00000-0000"
                    className={`mt-1 ${errors.telefone ? "border-destructive" : ""}`}
                  />
                  {errors.telefone && <p className="text-xs text-destructive mt-0.5">{errors.telefone}</p>}
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">E-mail</Label>
                  <Input
                    type="email"
                    value={editData.email}
                    onChange={e => { setEditData(d => ({ ...d, email: e.target.value })); setErrors(er => ({ ...er, email: "" })); }}
                    placeholder="paciente@email.com"
                    className={`mt-1 ${errors.email ? "border-destructive" : ""}`}
                  />
                  {errors.email && <p className="text-xs text-destructive mt-0.5">{errors.email}</p>}
                </div>
                <div className="col-span-2">
                  <Label className="text-xs font-medium text-muted-foreground">Endereço completo</Label>
                  <Input
                    value={editData.endereco}
                    onChange={e => setEditData(d => ({ ...d, endereco: e.target.value }))}
                    placeholder="Rua, número, bairro, cidade — UF"
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Contato de Emergência */}
            <div className="pt-3 border-t border-border/40">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Contato de Emergência
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Nome</Label>
                  <Input
                    value={editData.contato_emergencia_nome}
                    onChange={e => setEditData(d => ({ ...d, contato_emergencia_nome: e.target.value }))}
                    placeholder="Nome do contato"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Telefone</Label>
                  <Input
                    value={editData.contato_emergencia_telefone}
                    onChange={e => { setEditData(d => ({ ...d, contato_emergencia_telefone: e.target.value })); setErrors(er => ({ ...er, contato_emergencia_telefone: "" })); }}
                    placeholder="(00) 00000-0000"
                    className={`mt-1 ${errors.contato_emergencia_telefone ? "border-destructive" : ""}`}
                  />
                  {errors.contato_emergencia_telefone && <p className="text-xs text-destructive mt-0.5">{errors.contato_emergencia_telefone}</p>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Vital signs section */}
      {triagem && (triagem.pressao_arterial || triagem.temperatura || triagem.saturacao_oxigenio || triagem.frequencia_cardiaca) && (
        <div className="px-5 py-3 bg-muted/20 border-t border-border/40">
          <div className="flex items-center gap-2 mb-2.5">
            <Heart className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Sinais Vitais</span>
            {riscoData && (
              <Badge variant="outline" className={`${riscoData.bg} ${riscoData.text} ${riscoData.border} text-[10px] font-medium px-2 py-0 h-5 rounded-full`}>
                <span className={`w-1.5 h-1.5 rounded-full ${riscoDot} mr-1 inline-block`} />
                {riscoData.label}
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {triagem.pressao_arterial && <VitalCard label="Pressão" value={triagem.pressao_arterial} unit="mmHg" />}
            {triagem.temperatura && <VitalCard label="Temperatura" value={String(triagem.temperatura)} unit="°C" />}
            {triagem.saturacao_oxigenio && <VitalCard label="Saturação" value={String(triagem.saturacao_oxigenio)} unit="%" />}
            {triagem.frequencia_cardiaca && <VitalCard label="Freq. Cardíaca" value={String(triagem.frequencia_cardiaca)} unit="bpm" />}
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Sub-components ── */

const InfoField = ({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) => (
  <div className="flex items-start gap-2.5 rounded-lg bg-muted/30 px-3 py-2.5 border border-border/30">
    <div className="text-muted-foreground mt-0.5 flex-shrink-0">{icon}</div>
    <div className="min-w-0 flex-1">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium leading-none mb-1">{label}</p>
      <p className={`text-sm text-foreground leading-tight truncate ${mono ? "font-mono" : "font-medium"}`} title={value}>{value}</p>
    </div>
  </div>
);

const VitalCard = ({ label, value, unit }: { label: string; value: string; unit: string }) => (
  <div className="text-center rounded-lg bg-card border border-border/40 px-2 py-2">
    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
    <p className="text-sm font-semibold text-foreground font-mono">
      {value}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">{unit}</span>
    </p>
  </div>
);

export default FichaPacienteCabecalho;
