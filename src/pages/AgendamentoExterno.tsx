import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { LogOut, Search, Plus, CalendarDays, Clock, User, Loader2, CheckCircle, X, Pencil } from "lucide-react";
import { format, addDays, isBefore, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
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
    const parsed = JSON.parse(stored);
    setExtUser(parsed);
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

      // Load appointments created by this external
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

  // ── Active quotas (with remaining slots) ──
  const activeQuotas = useMemo(() => {
    return quotas.filter(q => q.vagas_usadas < q.vagas_total);
  }, [quotas]);

  // Available professionals (those with active quota and remaining slots)
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

  // ── Generate slots for selected date ──
  const availableSlots = useMemo(() => {
    if (!selectedProfissional || !selectedDate) return [];
    const dayOfWeek = selectedDate.getDay();
    const dateStr = format(selectedDate, "yyyy-MM-dd");

    const matching = disponibilidades.filter(d =>
      d.profissional_id === selectedProfissional &&
      dateStr >= d.data_inicio && dateStr <= d.data_fim &&
      d.dias_semana?.includes(dayOfWeek)
    );

    if (!matching.length) return [];
    const d = matching[0];
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

    // Filter out already booked slots
    const bookedSlots = agendamentos
      .filter(a => a.profissional_id === selectedProfissional && a.data === dateStr && !["cancelado", "falta"].includes(a.status))
      .map(a => a.hora);

    return slots.filter(s => !bookedSlots.includes(s));
  }, [selectedProfissional, selectedDate, disponibilidades, agendamentos]);

  // Load agendamentos when profissional/date changes
  useEffect(() => {
    if (!selectedProfissional || !selectedDate) return;
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    supabase.from("agendamentos").select("hora, status, profissional_id, data")
      .eq("profissional_id", selectedProfissional).eq("data", dateStr)
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
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const agendamentoId = `ag_${Date.now()}`;

      const { error: agErr } = await supabase.from("agendamentos").insert({
        id: agendamentoId,
        paciente_id: selectedPatient.id,
        paciente_nome: selectedPatient.nome,
        profissional_id: selectedProfissional,
        profissional_nome: prof?.nome || "",
        unidade_id: selectedUnidade || extUser?.unidade_id || "",
        data: dateStr,
        hora: selectedHora,
        tipo: "Consulta",
        status: "pendente",
        origem: "externo",
        criado_por: extUser?.id || "",
        agendado_por_externo: extUser?.id || "",
        observacoes: `Agendado por ${extUser?.nome || "externo"}`,
      });
      if (agErr) throw agErr;

      // Consume quota
      const { error: qErr } = await supabase.from("quotas_externas")
        .update({ vagas_usadas: quota.vagas_usadas + 1 })
        .eq("id", quota.id);
      if (qErr) console.error("Quota update error:", qErr);

      toast.success("Agendamento realizado com sucesso!");
      setSelectedHora("");
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
      // Find the appointment to get profissional_id
      const appt = myAppointments.find(a => a.id === agId);
      const { error } = await supabase.from("agendamentos").update({ status: "cancelado" }).eq("id", agId);
      if (error) throw error;

      // Return quota
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold font-display text-foreground">Agendamento Externo</h1>
          <p className="text-sm text-muted-foreground">Olá, {extUser.nome}</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleLogout}>
          <LogOut className="w-4 h-4 mr-1" /> Sair
        </Button>
      </header>

      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <Tabs defaultValue="agendar">
          <TabsList className="w-full">
            <TabsTrigger value="agendar" className="flex-1">Novo Agendamento</TabsTrigger>
            <TabsTrigger value="meus" className="flex-1">Meus Agendamentos ({myAppointments.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="agendar" className="space-y-4 mt-4">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : (
              <>
                {/* Step 1: Select Unidade & Professional */}
                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><User className="w-4 h-4" /> 1. Selecione Profissional</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label>Unidade</Label>
                      <Select value={selectedUnidade} onValueChange={v => { setSelectedUnidade(v); setSelectedProfissional(""); setSelectedDate(undefined); }}>
                        <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                        <SelectContent>
                          {unidades.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedUnidade && (
                      <div>
                        <Label>Profissional (com quota disponível)</Label>
                        {availableProfessionals.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-2">Nenhum profissional com vagas disponíveis.</p>
                        ) : (
                          <div className="space-y-2 mt-2">
                            {availableProfessionals.map(p => (
                              <button
                                key={p.id}
                                onClick={() => { setSelectedProfissional(p.id); setSelectedDate(undefined); setSelectedHora(""); }}
                                className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedProfissional === p.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="font-medium text-foreground">{p.nome}</p>
                                    <p className="text-sm text-muted-foreground">{p.profissao}</p>
                                  </div>
                                  <Badge variant="outline">
                                    {p.quota.vagas_total - p.quota.vagas_usadas} vagas restantes
                                  </Badge>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Step 2: Select Date & Time */}
                {selectedProfissional && (
                  <Card>
                    <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="w-4 h-4" /> 2. Data e Horário</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Calendar
                            mode="single"
                            selected={selectedDate}
                            onSelect={d => { setSelectedDate(d); setSelectedHora(""); }}
                            disabled={d => isBefore(startOfDay(d), startOfDay(new Date()))}
                            locale={ptBR}
                            className="rounded-md border pointer-events-auto"
                          />
                        </div>
                        <div>
                          {selectedDate && (
                            <>
                              <p className="text-sm font-medium mb-2">
                                Horários em {format(selectedDate, "dd/MM/yyyy")}
                              </p>
                              {availableSlots.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Nenhum horário disponível nesta data.</p>
                              ) : (
                                <div className="grid grid-cols-3 gap-2">
                                  {availableSlots.map(slot => (
                                    <button
                                      key={slot}
                                      onClick={() => setSelectedHora(slot)}
                                      className={`p-2 text-sm rounded-lg border text-center transition-colors ${selectedHora === slot ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}
                                    >
                                      <Clock className="w-3 h-3 inline mr-1" />{slot}
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
                    <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><User className="w-4 h-4" /> 3. Paciente</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex gap-2">
                        <Input placeholder="Buscar por nome, CPF ou CNS..." value={patientSearch} onChange={e => setPatientSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && handlePatientSearch()} />
                        <Button onClick={handlePatientSearch} variant="outline" size="icon"><Search className="w-4 h-4" /></Button>
                        <Button onClick={openNewPatient} variant="outline" size="icon"><Plus className="w-4 h-4" /></Button>
                      </div>

                      {patientResults.length > 0 && !selectedPatient && (
                        <ScrollArea className="max-h-48">
                          <div className="space-y-1">
                            {patientResults.map(p => (
                              <button
                                key={p.id}
                                onClick={() => { setSelectedPatient(p); setPatientResults([]); }}
                                className="w-full text-left p-2 rounded-lg hover:bg-accent/50 transition-colors"
                              >
                                <p className="font-medium text-sm">{p.nome}</p>
                                <p className="text-xs text-muted-foreground">CPF: {p.cpf || "—"} | CNS: {p.cns || "—"}</p>
                              </button>
                            ))}
                          </div>
                        </ScrollArea>
                      )}

                      {selectedPatient && (
                        <div className="p-3 rounded-lg border bg-accent/20 flex items-center justify-between">
                          <div>
                            <p className="font-medium text-foreground">{selectedPatient.nome}</p>
                            <p className="text-xs text-muted-foreground">CPF: {selectedPatient.cpf || "—"} | Tel: {selectedPatient.telefone || "—"}</p>
                          </div>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => openEditPatient(selectedPatient)}><Pencil className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => { setSelectedPatient(null); setPatientSearch(""); }}><X className="w-4 h-4" /></Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Step 4: Confirm */}
                {selectedPatient && selectedHora && selectedProfissional && selectedDate && (
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-foreground">Confirmar agendamento</p>
                          <p className="text-sm text-muted-foreground">
                            {selectedPatient.nome} — {professionals.find(p => p.id === selectedProfissional)?.nome} — {format(selectedDate, "dd/MM/yyyy")} às {selectedHora}
                          </p>
                        </div>
                        <Button onClick={handleSchedule} disabled={scheduling} className="gradient-primary text-primary-foreground">
                          {scheduling ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                          Agendar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="meus" className="mt-4">
            {myAppointments.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum agendamento futuro.</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {myAppointments.map(a => (
                  <Card key={a.id}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">{a.paciente_nome}</p>
                        <p className="text-sm text-muted-foreground">
                          {a.profissional_nome} — {format(new Date(a.data + "T12:00:00"), "dd/MM/yyyy")} às {a.hora}
                        </p>
                        <Badge variant="outline" className="mt-1">{a.status}</Badge>
                      </div>
                      <Button variant="destructive" size="sm" onClick={() => handleCancel(a.id)}>Cancelar</Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Quota summary */}
            {activeQuotas.length > 0 && (
              <Card className="mt-4">
                <CardHeader className="pb-2"><CardTitle className="text-base">Resumo de Quotas</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {activeQuotas.map(q => {
                      const prof = professionals.find(p => p.id === q.profissional_interno_id);
                      return (
                        <div key={q.id} className="flex items-center justify-between p-2 rounded-lg bg-accent/20">
                          <span className="text-sm font-medium">{prof?.nome || "—"}</span>
                          <div className="text-sm">
                            <span className="text-primary font-bold">{q.vagas_total - q.vagas_usadas}</span>
                            <span className="text-muted-foreground"> / {q.vagas_total} vagas restantes</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
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
              <div><Label>CNS</Label><Input value={patientForm.cns} onChange={e => setPatientForm(p => ({ ...p, cns: e.target.value }))} /></div>
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
            <Button onClick={handleSavePatient} disabled={savingPatient} className="w-full gradient-primary text-primary-foreground">
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
