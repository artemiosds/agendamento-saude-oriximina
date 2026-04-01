import React, { useState, useMemo, useEffect } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { Agendamento, User } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, CheckCircle, XCircle, AlertTriangle, FileText, User as UserIcon, MapPin, Building2, ArrowRight, RefreshCw, Filter, Search, ChevronLeft, ChevronRight, Plus, Eye, Download, Upload, Paperclip } from "lucide-react";
import { format, addDays, subDays, isSameDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { CalendarioAgenda } from "./CalendarioAgenda";
import { supabase } from "@/integrations/supabase/client";

const statusColors: Record<string, string> = {
  pendente: "bg-yellow-100 text-yellow-800 border-yellow-200",
  confirmado: "bg-blue-100 text-blue-800 border-blue-200",
  confirmado_chegada: "bg-indigo-100 text-indigo-800 border-indigo-200",
  cancelado: "bg-red-100 text-red-800 border-red-200",
  concluido: "bg-green-100 text-green-800 border-green-200",
  falta: "bg-gray-100 text-gray-800 border-gray-200",
  atraso: "bg-orange-100 text-orange-800 border-orange-200",
  remarcado: "bg-purple-100 text-purple-800 border-purple-200",
  em_atendimento: "bg-cyan-100 text-cyan-800 border-cyan-200",
  aguardando_triagem: "bg-teal-100 text-teal-800 border-teal-200",
  aguardando_atendimento: "bg-sky-100 text-sky-800 border-sky-200",
  aguardando_enfermagem: "bg-rose-100 text-rose-800 border-rose-200",
  apto_atendimento: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

export const Agenda = () => {
  const { agendamentos = [], updateAgendamento, unidades = [], funcionarios = [], getAvailableSlots, getAvailableDates, bloqueios = [], disponibilidades = [] } = useData();
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [filterProf, setFilterProf] = useState<string>("all");
  const [filterUnit, setFilterUnit] = useState<string>("all");
  const [aprovarDialog, setAprovarDialog] = useState(false);
  const [rejeitarDialog, setRejeitarDialog] = useState(false);
  const [aprovarTarget, setAprovarTarget] = useState<Agendamento | null>(null);
  const [rejeicaoTarget, setRejeicaoTarget] = useState<Agendamento | null>(null);
  const [rejeicaoMotivo, setRejeicaoMotivo] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("calendar");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredAgendamentos = useMemo(() => {
    if (!agendamentos || agendamentos.length === 0) return [];
    return agendamentos.filter((ag) => {
      if (!ag || !ag.data) return false;
      try {
        const matchesDate = isSameDay(parseISO(ag.data), selectedDate);
        const matchesProf = filterProf === "all" || ag.profissionalId === filterProf;
        const matchesUnit = filterUnit === "all" || ag.unidadeId === filterUnit;
        const matchesSearch = searchTerm === "" || 
          (ag.pacienteNome || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (ag.profissionalNome || "").toLowerCase().includes(searchTerm.toLowerCase());
        return matchesDate && matchesProf && matchesUnit && matchesSearch;
      } catch {
        return false;
      }
    }).sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));
  }, [agendamentos, selectedDate, filterProf, filterUnit, searchTerm]);

  const handleAprovar = async () => {
    if (!aprovarTarget) return;
    try {
      await updateAgendamento(aprovarTarget.id, { 
        status: "confirmado",
        aprovadoPor: user?.id || "",
        aprovadoEm: new Date().toISOString(),
      });
      toast.success("Agendamento aprovado com sucesso");
      setAprovarDialog(false);
      setAprovarTarget(null);
    } catch (err) {
      toast.error("Erro ao aprovar agendamento");
    }
  };

  const handleRejeitar = async () => {
    if (!rejeicaoTarget) return;
    try {
      await updateAgendamento(rejeicaoTarget.id, { 
        status: "cancelado",
        rejeitadoMotivo: rejeicaoMotivo,
      });
      toast.success("Agendamento rejeitado/cancelado");
      setRejeitarDialog(false);
      setRejeicaoTarget(null);
      setRejeicaoMotivo("");
    } catch (err) {
      toast.error("Erro ao rejeitar agendamento");
    }
  };

  const handleStatusChange = async (ag: Agendamento, newStatus: Agendamento["status"]) => {
    try {
      await updateAgendamento(ag.id, { status: newStatus });
      toast.success(`Status atualizado para ${newStatus.replace("_", " ")}`);
    } catch (err) {
      toast.error("Erro ao atualizar status");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
          <p className="text-sm text-gray-500">Gerencie consultas e disponibilidade</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === "list" ? "calendar" : "list")}>
            {viewMode === "list" ? <Calendar className="w-4 h-4 mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
            {viewMode === "list" ? "Calendário" : "Lista"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setSelectedDate(subDays(selectedDate, 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="font-medium min-w-[140px] text-center">
                {format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </span>
              <Button variant="outline" size="icon" onClick={() => setSelectedDate(addDays(selectedDate, 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedDate(new Date())}>Hoje</Button>
            </div>
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:flex-none">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar paciente ou profissional..."
                  className="pl-8 pr-3 py-2 border rounded-md text-sm w-full md:w-64"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={filterUnit} onValueChange={setFilterUnit}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Unidade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterProf} onValueChange={setFilterProf}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Profissional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {funcionarios.filter(f => f.role === "profissional").map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {viewMode === "calendar" ? (
            <CalendarioAgenda
              selectedDate={selectedDate.toISOString()}
              onDateChange={(date) => setSelectedDate(new Date(date))}
              agendamentos={agendamentos || []}
              bloqueios={bloqueios || []}
              disponibilidades={disponibilidades || []}
              filterProf={filterProf}
              filterUnit={filterUnit}
              profissionais={funcionarios || []}
              getAvailableSlots={getAvailableSlots || (() => [])}
              getAvailableDates={getAvailableDates || (() => [])}
              unidades={unidades || []}
            />
          ) : (
            <div className="space-y-3">
              {filteredAgendamentos.length === 0 ? (
                <div className="text-center py-12 text-gray-500">Nenhum agendamento encontrado para esta data.</div>
              ) : (
                filteredAgendamentos.map((ag) => (
                  <div key={ag.id} className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors gap-3">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="bg-blue-100 p-2 rounded-lg">
                        <Clock className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">{ag.hora} - {ag.pacienteNome}</div>
                        <div className="text-sm text-gray-500 flex items-center gap-2">
                          <UserIcon className="w-3 h-3" /> {ag.profissionalNome}
                          <span className="mx-1">•</span>
                          <MapPin className="w-3 h-3" /> {unidades.find(u => u.id === ag.unidadeId)?.nome || "Unidade"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={statusColors[ag.status] || "bg-gray-100 text-gray-800"}>
                        {ag.status.replace(/_/g, " ")}
                      </Badge>
                      {ag.origem === "online" && (
                        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Online</Badge>
                      )}
                      {ag.attachmentUrl && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1">
                          <Paperclip className="w-3 h-3" /> Anexo
                        </Badge>
                      )}
                      <div className="flex gap-1 ml-2">
                        {ag.status === "pendente" && (
                          <>
                            <Button size="sm" variant="outline" className="text-green-600 hover:text-green-700" onClick={() => { setAprovarTarget(ag); setAprovarDialog(true); }}>
                              <CheckCircle className="w-4 h-4 mr-1" /> Aprovar
                            </Button>
                            <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => { setRejeicaoTarget(ag); setRejeitarDialog(true); }}>
                              <XCircle className="w-4 h-4 mr-1" /> Rejeitar
                            </Button>
                          </>
                        )}
                        <Select value={ag.status} onValueChange={(val) => handleStatusChange(ag, val as Agendamento["status"])}>
                          <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.keys(statusColors).map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={aprovarDialog} onOpenChange={setAprovarDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprovar Agendamento</DialogTitle>
            <DialogDescription>
              Confirma a aprovação do agendamento de {aprovarTarget?.pacienteNome} para {aprovarTarget?.data} às {aprovarTarget?.hora}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAprovarDialog(false)}>Cancelar</Button>
            <Button onClick={handleAprovar} className="bg-green-600 hover:bg-green-700">Confirmar Aprovação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejeitarDialog} onOpenChange={setRejeitarDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar Agendamento</DialogTitle>
            <DialogDescription>
              Informe o motivo para rejeição/cancelamento do agendamento de {rejeicaoTarget?.pacienteNome}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Label>Motivo</Label>
            <Textarea 
              value={rejeicaoMotivo} 
              onChange={(e) => setRejeicaoMotivo(e.target.value)} 
              placeholder="Ex: Horário indisponível, documentação pendente..."
              className="min-h-[100px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejeitarDialog(false); setRejeicaoMotivo(""); }}>Cancelar</Button>
            <Button onClick={handleRejeitar} variant="destructive" disabled={!rejeicaoMotivo.trim()}>Confirmar Rejeição</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};