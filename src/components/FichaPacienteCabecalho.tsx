import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Save, X, Lock, Search } from "lucide-react";
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

const RISCO_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  nao_urgente: { bg: "bg-green-100", text: "text-green-800", label: "🟢 Não urgente" },
  pouco_urgente: { bg: "bg-yellow-100", text: "text-yellow-800", label: "🟡 Pouco urgente" },
  urgente: { bg: "bg-orange-100", text: "text-orange-800", label: "🟠 Urgente" },
  muito_urgente: { bg: "bg-red-100", text: "text-red-800", label: "🔴 Muito urgente" },
  emergencia: { bg: "bg-red-200", text: "text-red-900", label: "🔴 Emergência" },
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

  // CID autocomplete
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

  // Debounced CID search
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

      // Update professional on appointment if changed
      if (agendamentoId && editData.profissionalId !== profissionalId) {
        const profFunc = funcionarios.find(f => f.id === editData.profissionalId);
        await supabase.from("agendamentos").update({
          profissional_id: editData.profissionalId,
          profissional_nome: profFunc?.nome || "",
        }).eq("id", agendamentoId);
      }

      // Reload patient data
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
  const activeProfessionals = funcionarios.filter(f => f.ativo && f.profissao);

  const cidDisplay = paciente.cid
    ? paciente.cid
    : "—";

  return (
    <div className="bg-muted/30 border rounded-lg p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold font-display uppercase tracking-wide text-foreground">
          Ficha do Paciente
        </h3>
        {!editing ? (
          <Button variant="ghost" size="sm" onClick={startEdit}>
            <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
          </Button>
        ) : (
          <div className="flex gap-1">
            <Button variant="default" size="sm" onClick={handleSave} disabled={saving}>
              <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Salvando..." : "Salvar"}
            </Button>
            <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
              <X className="w-3.5 h-3.5 mr-1" /> Cancelar
            </Button>
          </div>
        )}
      </div>

      {/* Data grid */}
      {!editing ? (
        /* READ MODE */
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="text-muted-foreground text-xs">Nome completo</span>
            <p className="font-medium text-foreground">{paciente.nome}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs flex items-center gap-1">Nº Prontuário <Lock className="w-3 h-3" /></span>
            <p className="font-mono text-foreground">#{paciente.id?.slice(-6) || "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Data de nascimento</span>
            <p className="text-foreground">
              {paciente.data_nascimento
                ? new Date(paciente.data_nascimento + "T12:00:00").toLocaleDateString("pt-BR")
                : "—"}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Idade</span>
            <p className="text-foreground">{idade}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Cartão SUS (CNS)</span>
            <p className="font-mono text-foreground">{paciente.cns || "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">CPF</span>
            <p className="font-mono text-foreground">{paciente.cpf || "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">CID</span>
            <p className="text-foreground">{cidDisplay}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Profissional responsável</span>
            <p className="text-foreground">{profissionalNome || "—"}</p>
          </div>
        </div>
      ) : (
        /* EDIT MODE */
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <Label className="text-xs">Nome completo <span className="text-destructive">*</span></Label>
            <Input
              value={editData.nome}
              onChange={e => { setEditData(d => ({ ...d, nome: e.target.value })); setErrors(e2 => ({ ...e2, nome: false })); }}
              className={errors.nome ? "border-destructive" : ""}
            />
            {errors.nome && <p className="text-xs text-destructive mt-0.5">Nome é obrigatório</p>}
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1">Nº Prontuário <Lock className="w-3 h-3 text-muted-foreground" /></Label>
            <Input value={`#${paciente.id?.slice(-6) || ""}`} disabled className="opacity-60" />
          </div>
          <div>
            <Label className="text-xs">Data de nascimento</Label>
            <Input
              type="date"
              value={editData.data_nascimento}
              onChange={e => setEditData(d => ({ ...d, data_nascimento: e.target.value }))}
            />
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1">Idade <Lock className="w-3 h-3 text-muted-foreground" /></Label>
            <Input value={calcularIdade(editData.data_nascimento)} disabled className="opacity-60" />
          </div>
          <div>
            <Label className="text-xs">Cartão SUS (CNS)</Label>
            <Input
              value={editData.cns}
              onChange={e => setEditData(d => ({ ...d, cns: e.target.value }))}
              placeholder="000 0000 0000 0000"
            />
          </div>
          <div>
            <Label className="text-xs">CID</Label>
            <Popover open={cidOpen} onOpenChange={setCidOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal h-10 text-sm">
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
            <Label className="text-xs">Profissional responsável</Label>
            <Select value={editData.profissionalId} onValueChange={v => setEditData(d => ({ ...d, profissionalId: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {activeProfessionals.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.nome} — {f.profissao}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Vital signs from triage (read-only) */}
      {triagem && (triagem.pressao_arterial || triagem.temperatura || triagem.saturacao_oxigenio || triagem.frequencia_cardiaca) && (
        <div className="border-t pt-3 mt-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              Sinais Vitais (Triagem) <Lock className="w-3 h-3" />
            </span>
            {riscoData && (
              <Badge variant="outline" className={`${riscoData.bg} ${riscoData.text} text-xs border-0`}>
                {riscoData.label}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-mono text-foreground">
            {triagem.pressao_arterial && <span>PA: <strong>{triagem.pressao_arterial}</strong></span>}
            {triagem.temperatura && <span>Temp: <strong>{triagem.temperatura}°C</strong></span>}
            {triagem.saturacao_oxigenio && <span>Sat: <strong>{triagem.saturacao_oxigenio}%</strong></span>}
            {triagem.frequencia_cardiaca && <span>FC: <strong>{triagem.frequencia_cardiaca}bpm</strong></span>}
          </div>
        </div>
      )}
    </div>
  );
};

export default FichaPacienteCabecalho;
