import React, { useState, useEffect, useCallback, useMemo } from "react";
import { formatCNS, maskCNS } from '@/lib/cnsUtils';
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { LogOut, Search, Plus, CalendarDays, Clock, User, Loader2, CheckCircle, X, Pencil, Building2, AlertCircle, CalendarCheck, BarChart3 } from "lucide-react";
import { format } from "date-fns";
import { CalendarioDisponibilidade, type DayInfo } from "@/components/CalendarioDisponibilidade";
import { todayLocalStr } from "@/lib/utils";

interface ExternalUser {
  id: string;
  nome: string;
  email: string;
  unidade_id: string;
}

interface Quota {
  id: string;
  profissional_externo_id: string;
  profissional_interno_id: string;
  unidade_id: string;
  vagas_total: number;
  vagas_usadas: number;
  periodo_inicio: string;
  periodo_fim: string;
}

interface Professional {
  id: string;
  nome: string;
  profissao: string;
  tempo_atendimento: number;
  unidade_id: string;
}

const AgendamentoExterno: React.FC = () => {
  const navigate = useNavigate();
  const [extUser, setExtUser] = useState<ExternalUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Data
  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [disponibilidades, setDisponibilidades] = useState<any[]>([]);
  const [agendamentos, setAgendamentos] = useState<any[]>([]);

  // Selection
  const [selectedUnidade, setSelectedUnidade] = useState("");
  const [selectedProfissional, setSelectedProfissional] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedHora, setSelectedHora] = useState("");

  // Patient
  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [patientDialogOpen, setPatientDialogOpen] = useState(false);
  const [patientForm, setPatientForm] = useState({
    nome: "", cpf: "", cns: "", data_nascimento: "", telefone: "", email: "", endereco: "",
    nome_mae: "", municipio: "", observacoes: "",
  });
  const [isEditingPatient, setIsEditingPatient] = useState(false);
  const [savingPatient, setSavingPatient] = useState(false);

  // Scheduling
  const [scheduling, setScheduling] = useState(false);
  const [myAppointments, setMyAppointments] = useState<any[]>([]);

  // ── Auth check ──
  useEffect(() => {
    const stored = sessionStorage.getItem("external_professional");
    if (!stored) {
      navigate("/externo");
      return;
    }
    setExtUser(JSON.parse(stored));
  }, [navigate]);

  // ── Load data ──
  const loadData = useCallback(async () => {
    if (!extUser) return;
    setLoading(true);
    try {
      const [quotasRes, unidadesRes, funcsRes, dispRes] = await Promise.all([
        supabase.from("quotas_externas").select("*").eq("profissional_externo_id", extUser.id),
        supabase.from("unidades").select("*").eq("ativo", true),
        supabase.from("funcionarios").select("id, nome, profissao, tempo_atendimento, unidade_id").eq("ativo", true).eq("role", "profissional"),
        supabase.from("disponibilidades").select("*"),
      ]);
      setQuotas(quotasRes.data || []);
      setUnidades(unidadesRes.data || []);
      setProfessionals(funcsRes.data || []);
      setDisponibilidades(dispRes.data || []);

      const { data: appts } = await supabase.from("agendamentos").select("*")
        .eq("agendado_por_externo", extUser.id)
        .in("status", ["pendente", "confirmado", "confirmado_chegada"])
        .order("data", { ascending: true });
      setMyAppointments(appts || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [extUser]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-select unidade if only one available via quotas
  useEffect(() => {
    if (!selectedUnidade && quotas.length > 0 && unidades.length > 0) {
      const quotaUnidades = [...new Set(quotas.map(q => q.unidade_id))];
      if (quotaUnidades.length === 1) {
        setSelectedUnidade(quotaUnidades[0]);
      }
    }
  }, [quotas, unidades, selectedUnidade]);

  // ── Active quotas (with remaining slots) ──
  const activeQuotas = useMemo(() => {
    return quotas.filter(q => q.vagas_usadas < q.vagas_total);
  }, [quotas]);

  // All quotas for display (including exhausted)
  const filteredQuotas = useMemo(() => {
    if (!selectedUnidade) return quotas;
    return quotas.filter(q => !q.unidade_id || q.unidade_id === selectedUnidade);
  }, [quotas, selectedUnidade]);

  const availableProfessionals = useMemo(() => {
    return activeQuotas
      .filter(q => {
        if (selectedUnidade && q.unidade_id && q.unidade_id !== selectedUnidade) return false;
        return true;
      })
      .map(q => {
        const prof = professionals.find(p => p.id === q.profissional_interno_id);
        return prof ? { ...prof, quota: q } : null;
      })
      .filter(Boolean) as (Professional & { quota: Quota })[];
  }, [activeQuotas, selectedUnidade, professionals]);

  // ── Available dates for selected professional ──
  const { availableDates, dayInfoMap } = useMemo(() => {
    if (!selectedProfissional) return { availableDates: [] as string[], dayInfoMap: {} as Record<string, DayInfo> };

    const today = todayLocalStr();
    const dates: string[] = [];
    const infoMap: Record<string, DayInfo> = {};

    // Look 90 days ahead
    const startDate = new Date();
    for (let i = 0; i < 90; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      if (dateStr < today) continue;

      const dayOfWeek = d.getDay();
      const matching = disponibilidades.filter(disp =>
        disp.profissional_id === selectedProfissional &&
        dateStr >= disp.data_inicio && dateStr <= disp.data_fim &&
        disp.dias_semana?.includes(dayOfWeek)
      );

      if (matching.length > 0) {
        dates.push(dateStr);
        infoMap[dateStr] = {
          dateStr,
          status: dateStr === selectedDate ? 'selected' : 'available',
          label: 'Disponível',
        };
      }
    }

    return { availableDates: dates, dayInfoMap: infoMap };
  }, [selectedProfissional, disponibilidades, selectedDate]);

  // ── Generate slots for selected date ──
  const availableSlots = useMemo(() => {
    if (!selectedProfissional || !selectedDate) return [];
    const dateObj = new Date(selectedDate + "T12:00:00");
    const dayOfWeek = dateObj.getDay();

    const matching = disponibilidades.filter(d =>
      d.profissional_id === selectedProfissional &&
      selectedDate >= d.data_inicio && selectedDate <= d.data_fim &&
      d.dias_semana?.includes(dayOfWeek)
    );

    if (!matching.length) return [];
    const d = matching[0];

    // Turno mode (vagas_por_hora === 0): show turno label instead of individual slots
    if (d.vagas_por_hora === 0) {
      return [`${d.hora_inicio}`];
    }

    const slots: string[] = [];
    const [startH, startM] = d.hora_inicio.split(":").map(Number);
    const [endH, endM] = d.hora_fim.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const duration = d.duracao_consulta || 30;

    for (let m = startMinutes; m + duration <= endMinutes; m += duration) {
      const h = String(Math.floor(m / 60)).padStart(2, "0");
      const min = String(m % 60).padStart(2, "0");
      slots.push(`${h}:${min}`);
    }

    // Filter booked
    const bookedSlots = agendamentos
      .filter(a => a.profissional_id === selectedProfissional && a.data === selectedDate && !["cancelado", "falta"].includes(a.status))
      .map(a => a.hora);

    return slots.filter(s => !bookedSlots.includes(s));
  }, [selectedProfissional, selectedDate, disponibilidades, agendamentos]);

  // Load agendamentos when profissional/date changes
  useEffect(() => {
    if (!selectedProfissional || !selectedDate) return;
    supabase.from("agendamentos").select("hora, status, profissional_id, data")
      .eq("profissional_id", selectedProfissional).eq("data", selectedDate)
      .then(({ data }) => setAgendamentos(data || []));
  }, [selectedProfissional, selectedDate]);

  // ── Patient search ──
  const handlePatientSearch = async () => {
    if (!patientSearch.trim()) return;
    const { data } = await supabase.from("pacientes").select("*")
      .or(`nome.ilike.%${patientSearch}%,cpf.ilike.%${patientSearch}%,cns.ilike.%${patientSearch}%`)
      .limit(20);
    setPatientResults(data || []);
  };

  const openNewPatient = () => {
    setPatientForm({ nome: "", cpf: "", cns: "", data_nascimento: "", telefone: "", email: "", endereco: "", nome_mae: "", municipio: "", observacoes: "" });
    setIsEditingPatient(false);
    setPatientDialogOpen(true);
  };

  const openEditPatient = (p: any) => {
    setPatientForm({
      nome: p.nome || "", cpf: p.cpf || "", cns: p.cns || "", data_nascimento: p.data_nascimento || "",
      telefone: p.telefone || "", email: p.email || "", endereco: p.endereco || "",
      nome_mae: p.nome_mae || "", municipio: p.municipio || "", observacoes: p.observacoes || "",
    });
    setIsEditingPatient(true);
    setPatientDialogOpen(true);
  };

  const handleSavePatient = async () => {
    if (!patientForm.nome.trim()) { toast.error("Nome é obrigatório."); return; }
    setSavingPatient(true);
    try {
      if (isEditingPatient && selectedPatient) {
        const { error } = await supabase.from("pacientes").update({
          nome: patientForm.nome, cpf: patientForm.cpf, cns: patientForm.cns,
          data_nascimento: patientForm.data_nascimento, telefone: patientForm.telefone,
          email: patientForm.email, endereco: patientForm.endereco, nome_mae: patientForm.nome_mae,
          municipio: patientForm.municipio, observacoes: patientForm.observacoes,
        }).eq("id", selectedPatient.id);
        if (error) throw error;
        setSelectedPatient({ ...selectedPatient, ...patientForm });
        toast.success("Paciente atualizado!");
      } else {
        const id = `pac_${Date.now()}`;
        const { data, error } = await supabase.from("pacientes").insert({
          id, nome: patientForm.nome, cpf: patientForm.cpf, cns: patientForm.cns,
          data_nascimento: patientForm.data_nascimento, telefone: patientForm.telefone,
          email: patientForm.email, endereco: patientForm.endereco, nome_mae: patientForm.nome_mae,
          municipio: patientForm.municipio, observacoes: patientForm.observacoes,
        }).select().single();
        if (error) throw error;
        setSelectedPatient(data);
        toast.success("Paciente cadastrado!");
      }
      setPatientDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar paciente.");
    }
    setSavingPatient(false);
  };

  // ── Schedule appointment ──
  const handleSchedule = async () => {
    if (!selectedPatient || !selectedProfissional || !selectedDate || !selectedHora) {
      toast.error("Selecione paciente, profissional, data e horário.");
      return;
    }

    const quota = availableProfessionals.find(p => p.id === selectedProfissional)?.quota;
    if (!quota || quota.vagas_usadas >= quota.vagas_total) {
      toast.error("Quota esgotada para este profissional.");
      return;
    }

    setScheduling(true);
    try {
      const prof = professionals.find(p => p.id === selectedProfissional);
      const agendamentoId = `ag_${Date.now()}`;

      const { error: agErr } = await supabase.from("agendamentos").insert({
        id: agendamentoId,
        paciente_id: selectedPatient.id,
        paciente_nome: selectedPatient.nome,
        profissional_id: selectedProfissional,
        profissional_nome: prof?.nome || "",
        unidade_id: selectedUnidade || extUser?.unidade_id || "",
        data: selectedDate,
        hora: selectedHora,
        tipo: "Consulta",
        status: "pendente",
        origem: "externo",
        criado_por: extUser?.id || "",
        agendado_por_externo: extUser?.id || "",
        observacoes: `Agendado por ${extUser?.nome || "externo"}`,
      });
      if (agErr) throw agErr;

      const { error: qErr } = await supabase.from("quotas_externas")
        .update({ vagas_usadas: quota.vagas_usadas + 1 })
        .eq("id", quota.id);
      if (qErr) console.error("Quota update error:", qErr);

      toast.success("Agendamento realizado com sucesso!");
      setSelectedHora("");
      setSelectedDate("");
      setSelectedPatient(null);
      setPatientSearch("");
      setPatientResults([]);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao agendar.");
    }
    setScheduling(false);
  };

  // ── Cancel appointment ──
  const handleCancel = async (agId: string) => {
    try {
      const appt = myAppointments.find(a => a.id === agId);
      const { error } = await supabase.from("agendamentos").update({ status: "cancelado" }).eq("id", agId);
      if (error) throw error;

      if (appt) {
        const quota = quotas.find(q =>
          q.profissional_interno_id === appt.profissional_id &&
          q.profissional_externo_id === extUser?.id
        );
        if (quota && quota.vagas_usadas > 0) {
          await supabase.from("quotas_externas")
            .update({ vagas_usadas: quota.vagas_usadas - 1 })
            .eq("id", quota.id);
        }
      }

      toast.success("Agendamento cancelado. Vaga devolvida.");
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao cancelar.");
    }
  };

  const handleLogout = async () => {
    sessionStorage.removeItem("external_professional");
    await supabase.auth.signOut();
    navigate("/externo");
  };

  if (!extUser) return null;

  const selectedProf = availableProfessionals.find(p => p.id === selectedProfissional);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="border-b bg-card shadow-sm px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Olá, {extUser.nome}</h1>
              <p className="text-xs text-muted-foreground">Portal de Agendamento Externo</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} className="gap-1.5">
            <LogOut className="w-4 h-4" /> Sair
          </Button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <Tabs defaultValue="agendar">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="agendar" className="gap-1.5">
              <CalendarDays className="w-4 h-4" /> Novo Agendamento
            </TabsTrigger>
            <TabsTrigger value="meus" className="gap-1.5">
              <CalendarCheck className="w-4 h-4" /> Meus Agendamentos
              {myAppointments.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{myAppointments.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ═══════════ TAB: Novo Agendamento ═══════════ */}
          <TabsContent value="agendar" className="space-y-4 mt-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Carregando dados...</p>
              </div>
            ) : (
              <>
                {/* Step 1: Unidade & Professional */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</div>
                      Profissional e Unidade
                    </CardTitle>
                    <CardDescription>Selecione a unidade e o profissional para agendar</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="flex items-center gap-1.5 mb-1.5"><Building2 className="w-3.5 h-3.5" /> Unidade</Label>
                      <Select value={selectedUnidade} onValueChange={v => { setSelectedUnidade(v); setSelectedProfissional(""); setSelectedDate(""); setSelectedHora(""); }}>
                        <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                        <SelectContent>
                          {unidades.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedUnidade && (
                      <>
                        <Separator />
                        <div>
                          <Label className="flex items-center gap-1.5 mb-2"><User className="w-3.5 h-3.5" /> Profissionais com vagas disponíveis</Label>
                          {availableProfessionals.length === 0 ? (
                            <div className="flex items-center gap-3 p-4 rounded-lg border border-dashed bg-muted/30 text-muted-foreground">
                              <AlertCircle className="w-5 h-5 shrink-0" />
                              <div>
                                <p className="text-sm font-medium">Nenhum profissional com vagas disponíveis</p>
                                <p className="text-xs">Entre em contato com o administrador para solicitar mais quotas.</p>
                              </div>
                            </div>
                          ) : (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {availableProfessionals.map(p => {
                                const remaining = p.quota.vagas_total - p.quota.vagas_usadas;
                                const isSelected = selectedProfissional === p.id;
                                return (
                                  <button
                                    key={p.id}
                                    onClick={() => { setSelectedProfissional(p.id); setSelectedDate(""); setSelectedHora(""); }}
                                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                                      isSelected
                                        ? "border-primary bg-primary/5 shadow-sm"
                                        : "border-border hover:border-primary/40 hover:shadow-sm"
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="font-semibold text-foreground truncate">{p.nome}</p>
                                        <p className="text-sm text-muted-foreground">{p.profissao}</p>
                                      </div>
                                      <Badge
                                        variant={remaining <= 2 ? "destructive" : "default"}
                                        className="shrink-0"
                                      >
                                        {remaining} {remaining === 1 ? 'vaga' : 'vagas'}
                                      </Badge>
                                    </div>
                                    {/* Progress bar */}
                                    <div className="mt-3 w-full bg-muted rounded-full h-1.5">
                                      <div
                                        className="bg-primary h-1.5 rounded-full transition-all"
                                        style={{ width: `${((p.quota.vagas_total - remaining) / p.quota.vagas_total) * 100}%` }}
                                      />
                                    </div>
                                    <p className="text-[11px] text-muted-foreground mt-1">
                                      {p.quota.vagas_usadas} de {p.quota.vagas_total} utilizadas
                                    </p>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Step 2: Calendar & Time */}
                {selectedProfissional && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</div>
                        Data e Horário
                      </CardTitle>
                      <CardDescription>
                        Agenda de {selectedProf?.nome} — selecione uma data disponível
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-6">
                        {/* Calendar */}
                        <div className="border rounded-xl p-1 bg-card">
                          <CalendarioDisponibilidade
                            availableDates={availableDates}
                            selectedDate={selectedDate}
                            onSelectDate={(d) => { setSelectedDate(d); setSelectedHora(""); }}
                            dayInfoMap={dayInfoMap}
                            blockToday={false}
                          />
                        </div>

                        {/* Time slots */}
                        <div>
                          {!selectedDate ? (
                            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-8">
                              <CalendarDays className="w-10 h-10 mb-2 opacity-30" />
                              <p className="text-sm">Selecione uma data no calendário</p>
                              <p className="text-xs mt-1">{availableDates.length} dias disponíveis</p>
                            </div>
                          ) : (
                            <>
                              <p className="text-sm font-medium mb-3 flex items-center gap-1.5">
                                <Clock className="w-4 h-4 text-primary" />
                                Horários em {selectedDate.split("-").reverse().join("/")}
                              </p>
                              {availableSlots.length === 0 ? (
                                <div className="text-center py-6 text-muted-foreground">
                                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                  <p className="text-sm">Sem horários disponíveis</p>
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 gap-2">
                                  {availableSlots.map(slot => (
                                    <button
                                      key={slot}
                                      onClick={() => setSelectedHora(slot)}
                                      className={`p-2.5 text-sm rounded-lg border-2 text-center font-medium transition-all ${
                                        selectedHora === slot
                                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                          : "border-border hover:border-primary/50 hover:bg-accent/30"
                                      }`}
                                    >
                                      <Clock className="w-3.5 h-3.5 inline mr-1.5" />{slot}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Step 3: Patient */}
                {selectedHora && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</div>
                        Paciente
                      </CardTitle>
                      <CardDescription>Busque um paciente existente ou cadastre um novo</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Buscar por nome, CPF ou CNS..."
                          value={patientSearch}
                          onChange={e => setPatientSearch(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && handlePatientSearch()}
                        />
                        <Button onClick={handlePatientSearch} variant="outline" size="icon"><Search className="w-4 h-4" /></Button>
                        <Button onClick={openNewPatient} variant="outline" size="icon" title="Novo paciente"><Plus className="w-4 h-4" /></Button>
                      </div>

                      {patientResults.length > 0 && !selectedPatient && (
                        <ScrollArea className="max-h-48">
                          <div className="space-y-1">
                            {patientResults.map(p => (
                              <button
                                key={p.id}
                                onClick={() => { setSelectedPatient(p); setPatientResults([]); }}
                                className="w-full text-left p-3 rounded-lg hover:bg-accent/50 transition-colors border"
                              >
                                <p className="font-medium text-sm">{p.nome}</p>
                                <p className="text-xs text-muted-foreground">CPF: {p.cpf || "—"} | CNS: {formatCNS(p.cns) || "—"} | Tel: {p.telefone || "—"}</p>
                              </button>
                            ))}
                          </div>
                        </ScrollArea>
                      )}

                      {selectedPatient && (
                        <div className="p-4 rounded-xl border-2 border-primary/30 bg-primary/5 flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-foreground">{selectedPatient.nome}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              CPF: {selectedPatient.cpf || "—"} | Tel: {selectedPatient.telefone || "—"}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => openEditPatient(selectedPatient)} title="Editar"><Pencil className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => { setSelectedPatient(null); setPatientSearch(""); }} title="Remover"><X className="w-4 h-4" /></Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Step 4: Confirm */}
                {selectedPatient && selectedHora && selectedProfissional && selectedDate && (
                  <Card className="border-primary/30 bg-primary/5">
                    <CardContent className="p-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <p className="font-semibold text-foreground text-base flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-primary" /> Confirmar Agendamento
                          </p>
                          <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                            <p>👤 {selectedPatient.nome}</p>
                            <p>🩺 {selectedProf?.nome} ({selectedProf?.profissao})</p>
                            <p>📅 {selectedDate.split("-").reverse().join("/")} às {selectedHora}</p>
                          </div>
                        </div>
                        <Button
                          onClick={handleSchedule}
                          disabled={scheduling}
                          size="lg"
                          className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 shrink-0"
                        >
                          {scheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                          Agendar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* ═══════════ TAB: Meus Agendamentos ═══════════ */}
          <TabsContent value="meus" className="space-y-4 mt-4">
            {/* Quota summary */}
            {filteredQuotas.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" /> Resumo de Quotas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {filteredQuotas.map(q => {
                      const prof = professionals.find(p => p.id === q.profissional_interno_id);
                      const remaining = q.vagas_total - q.vagas_usadas;
                      const pct = (q.vagas_usadas / q.vagas_total) * 100;
                      return (
                        <div key={q.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                          <div>
                            <span className="text-sm font-medium">{prof?.nome || "—"}</span>
                            <div className="w-24 bg-muted rounded-full h-1.5 mt-1">
                              <div className="bg-primary h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                          <Badge variant={remaining === 0 ? "destructive" : "outline"}>
                            {remaining}/{q.vagas_total}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {myAppointments.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CalendarCheck className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-muted-foreground font-medium">Nenhum agendamento futuro</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">Seus agendamentos aparecerão aqui</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {myAppointments.map(a => (
                  <Card key={a.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{a.paciente_nome}</p>
                        <p className="text-sm text-muted-foreground">
                          🩺 {a.profissional_nome} — 📅 {format(new Date(a.data + "T12:00:00"), "dd/MM/yyyy")} às {a.hora}
                        </p>
                        <Badge variant="outline" className="mt-1.5 capitalize">{a.status.replace(/_/g, ' ')}</Badge>
                      </div>
                      <Button variant="destructive" size="sm" onClick={() => handleCancel(a.id)} className="shrink-0">
                        Cancelar
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Patient Dialog */}
      <Dialog open={patientDialogOpen} onOpenChange={setPatientDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditingPatient ? "Editar" : "Cadastrar"} Paciente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome Completo *</Label><Input value={patientForm.nome} onChange={e => setPatientForm(p => ({ ...p, nome: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>CPF</Label><Input value={patientForm.cpf} onChange={e => setPatientForm(p => ({ ...p, cpf: e.target.value }))} placeholder="000.000.000-00" /></div>
              <div><Label>CNS</Label><Input value={patientForm.cns} onChange={e => setPatientForm(p => ({ ...p, cns: maskCNS(e.target.value) }))} placeholder="000 0000 0000 0000" maxLength={18} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Data Nascimento</Label><Input type="date" value={patientForm.data_nascimento} onChange={e => setPatientForm(p => ({ ...p, data_nascimento: e.target.value }))} /></div>
              <div><Label>Telefone</Label><Input value={patientForm.telefone} onChange={e => setPatientForm(p => ({ ...p, telefone: e.target.value }))} /></div>
            </div>
            <div><Label>E-mail</Label><Input type="email" value={patientForm.email} onChange={e => setPatientForm(p => ({ ...p, email: e.target.value }))} /></div>
            <div><Label>Endereço</Label><Input value={patientForm.endereco} onChange={e => setPatientForm(p => ({ ...p, endereco: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nome da Mãe</Label><Input value={patientForm.nome_mae} onChange={e => setPatientForm(p => ({ ...p, nome_mae: e.target.value }))} /></div>
              <div><Label>Município</Label><Input value={patientForm.municipio} onChange={e => setPatientForm(p => ({ ...p, municipio: e.target.value }))} /></div>
            </div>
            <div><Label>Observações</Label><Input value={patientForm.observacoes} onChange={e => setPatientForm(p => ({ ...p, observacoes: e.target.value }))} /></div>
            <Button onClick={handleSavePatient} disabled={savingPatient} className="w-full bg-primary text-primary-foreground">
              {savingPatient && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {isEditingPatient ? "Salvar Alterações" : "Cadastrar Paciente"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AgendamentoExterno;
