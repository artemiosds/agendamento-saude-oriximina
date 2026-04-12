import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Save, X, Lock, Search, User, Calendar, CreditCard, Heart, Activity, FileText, Stethoscope } from "lucide-react";
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

const FichaPacienteCabecalho: React.FC<FichaPacienteCabecalhoProps> = ({
  pacienteId, profissionalNome, profissionalId, agendamentoId,
  triagem, funcionarios, onPacienteUpdated,
}) => {
  const [paciente, setPaciente] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState({ nome: "", data_nascimento: "", cns: "", cid: "", profissionalId: "" });
  const [errors, setErrors] = useState<Record<string, boolean>>({});

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
    setEditData({
      nome: paciente.nome || "",
      data_nascimento: paciente.data_nascimento || "",
      cns: paciente.cns || "",
      cid: paciente.cid || "",
      profissionalId: profissionalId,
    });
    setCidSearch(paciente.cid || "");
    setErrors({});
    setEditing(true);
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
    const newErrors: Record<string, boolean> = {};
    if (!editData.nome.trim()) newErrors.nome = true;
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

    setSaving(true);
    try {
      const { error } = await supabase.from("pacientes").update({
        nome: editData.nome.trim(),
        data_nascimento: editData.data_nascimento,
        cns: editData.cns,
        cid: editData.cid,
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

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-3">
              <InfoField
                icon={<CreditCard className="w-3.5 h-3.5" />}
                label="Cartão SUS (CNS)"
                value={paciente.cns || "—"}
                mono
              />
              <InfoField
                icon={<CreditCard className="w-3.5 h-3.5" />}
                label="CPF"
                value={paciente.cpf || "—"}
                mono
              />
              <InfoField
                icon={<Activity className="w-3.5 h-3.5" />}
                label="CID-10"
                value={cidDisplay}
              />
              <InfoField
                icon={<Stethoscope className="w-3.5 h-3.5" />}
                label="Profissional responsável"
                value={profissionalNome || "—"}
              />
            </div>
          </div>
        ) : (
          /* ── EDIT MODE ── */
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div className="col-span-2 sm:col-span-1">
              <Label className="text-xs font-medium text-muted-foreground">Nome completo <span className="text-destructive">*</span></Label>
              <Input
                value={editData.nome}
                onChange={e => { setEditData(d => ({ ...d, nome: e.target.value })); setErrors(e2 => ({ ...e2, nome: false })); }}
                className={`mt-1 ${errors.nome ? "border-destructive" : ""}`}
              />
              {errors.nome && <p className="text-xs text-destructive mt-0.5">Nome é obrigatório</p>}
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">Nº Prontuário <Lock className="w-3 h-3" /></Label>
              <Input value={`#${paciente.id?.slice(-6) || ""}`} disabled className="opacity-50 mt-1" />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Data de nascimento</Label>
              <Input
                type="date"
                value={editData.data_nascimento}
                onChange={e => setEditData(d => ({ ...d, data_nascimento: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">Idade <Lock className="w-3 h-3" /></Label>
              <Input value={calcularIdade(editData.data_nascimento)} disabled className="opacity-50 mt-1" />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Cartão SUS (CNS)</Label>
              <Input
                value={editData.cns}
                onChange={e => setEditData(d => ({ ...d, cns: e.target.value }))}
                placeholder="000 0000 0000 0000"
                className="mt-1"
              />
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
                    <CommandInput
                      placeholder="Código ou nome da doença..."
                      value={cidSearch}
                      onValueChange={setCidSearch}
                    />
                    <CommandList>
                      {cidLoading && <div className="p-3 text-xs text-muted-foreground text-center">Buscando...</div>}
                      <CommandEmpty>{cidSearch.length < 2 ? "Digite pelo menos 2 caracteres" : "Nenhum CID encontrado"}</CommandEmpty>
                      <CommandGroup>
                        {cidResults.map(c => (
                          <CommandItem
                            key={c.codigo}
                            value={c.codigo}
                            onSelect={() => {
                              setEditData(d => ({ ...d, cid: `${c.codigo} — ${c.descricao}` }));
                              setCidOpen(false);
                            }}
                          >
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
            <div className="col-span-2">
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
        )}
      </div>

      {/* Vital signs section */}
      {triagem && (triagem.pressao_arterial || triagem.temperatura || triagem.saturacao_oxigenio || triagem.frequencia_cardiaca) && (
        <div className="px-5 py-3 bg-muted/20 border-t border-border/40">
          <div className="flex items-center gap-2 mb-2.5">
            <Heart className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Sinais Vitais
            </span>
            {riscoData && (
              <Badge
                variant="outline"
                className={`${riscoData.bg} ${riscoData.text} ${riscoData.border} text-[10px] font-medium px-2 py-0 h-5 rounded-full`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${riscoDot} mr-1 inline-block`} />
                {riscoData.label}
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {triagem.pressao_arterial && (
              <VitalCard label="Pressão" value={triagem.pressao_arterial} unit="mmHg" />
            )}
            {triagem.temperatura && (
              <VitalCard label="Temperatura" value={String(triagem.temperatura)} unit="°C" />
            )}
            {triagem.saturacao_oxigenio && (
              <VitalCard label="Saturação" value={String(triagem.saturacao_oxigenio)} unit="%" />
            )}
            {triagem.frequencia_cardiaca && (
              <VitalCard label="Freq. Cardíaca" value={String(triagem.frequencia_cardiaca)} unit="bpm" />
            )}
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
      <p className={`text-sm text-foreground leading-tight truncate ${mono ? "font-mono" : "font-medium"}`}>{value}</p>
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
