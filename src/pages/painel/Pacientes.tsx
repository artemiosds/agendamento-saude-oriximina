import React, { useState, useEffect, useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { Agendamento, Paciente, User } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, CheckCircle, XCircle, AlertTriangle, FileText, User as UserIcon, MapPin, Building2, ArrowRight, RefreshCw, Filter, Search, ChevronLeft, ChevronRight, Plus, Eye, Download, Upload, Paperclip, Phone, Mail, Home, Users, Info, File, FilePlus, FileMinus, FileText as FileTextIcon } from "lucide-react";
import { format, addDays, subDays, isSameDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
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

export const Pacientes = () => {
  const { agendamentos, pacientes, unidades, funcionarios, user } = useData();
  const { user: authUser } = useAuth();
  const [selectedPaciente, setSelectedPaciente] = useState<Paciente | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterUnit, setFilterUnit] = useState<string>("all");
  const [filterProf, setFilterProf] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState(new Date());

  const filteredPacientes = useMemo(() => {
    return pacientes.filter((p) => {
      const matchesSearch = searchTerm === "" || 
        p.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.cpf.includes(searchTerm.replace(/\D/g, "")) ||
        p.cns.includes(searchTerm.replace(/\D/g, ""));
      const matchesUnit = filterUnit === "all" || unidades.find(u => u.id === p.unidadeId)?.nome === filterUnit;
      return matchesSearch && matchesUnit;
    });
  }, [pacientes, searchTerm, filterUnit, unidades]);

  const latestAg = useMemo(() => {
    if (!selectedPaciente) return null;
    const latest = agendamentos
      .filter((a) => a.pacienteId === selectedPaciente.id && a.status !== "cancelado" && a.status !== "falta")
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())[0];
    return latest;
  }, [agendamentos, selectedPaciente]);

  const handlePacienteClick = async (pacienteId: string) => {
    try {
      const paciente = pacientes.find(p => p.id === pacienteId);
      if (!paciente) return;
      setSelectedPaciente(paciente);
    } catch (err) {
      toast.error("Erro ao carregar paciente");
    }
  };

  const handleAgendamentoClick = async (agendamentoId: string) => {
    try {
      const agendamento = agendamentos.find(a => a.id === agendamentoId);
      if (!agendamento) return;
      // Handle agendamento details
    } catch (err) {
      toast.error("Erro ao carregar agendamento");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pacientes</h1>
          <p className="text-sm text-gray-500">Gerencie informações e histórico de pacientes</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setSelectedPaciente(null)}>
            <RefreshCw className="w-4 h-4 mr-2" /> Limpar Seleção
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Buscar paciente por nome, CPF ou CNS..."
                className="pl-3 pr-3 py-2 border rounded-md text-sm w-full md:w-64"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
              <Select value={filterUnit} onValueChange={setFilterUnit}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Unidade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {unidades.map((u) => <SelectItem key={u.id} value={u.nome}>{u.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPacientes.map((p) => (
              <div
                key={p.id}
                className="cursor-pointer group p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                onClick={() => handlePacienteClick(p.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{p.nome}</div>
                    <div className="text-sm text-gray-500">
                      {p.cpf && <span className="mr-2">CPF: {p.cpf}</span>}
                      {p.cns && <span className="mr-2">CNS: {p.cns}</span>}
                    </div>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedPaciente && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold">Informações do Paciente</CardTitle>
                <p className="text-sm text-gray-500">Dados pessoais e histórico de atendimentos</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setSelectedPaciente(null)}>
                <XCircle className="w-4 h-4 mr-1" /> Fechar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="field-label">Nome Completo</div>
                <div className="field-value">{selectedPaciente.nome}</div>
              </div>
              <div>
                <div className="field-label">CPF</div>
                <div className="field-value">{selectedPaciente.cpf || "____________________"}</div>
              </div>
              <div>
                <div className="field-label">CNS</div>
                <div className="field-value">{selectedPaciente.cns || "____________________"}</div>
              </div>
              <div>
                <div className="field-label">Nome da Mãe</div>
                <div className="field-value">{selectedPaciente.nomeMae || "____________________"}</div>
              </div>
              <div>
                <div className="field-label">Data de Nascimento</div>
                <div className="field-value">{selectedPaciente.dataNascimento ? format(new Date(selectedPaciente.dataNascimento), "dd/MM/yyyy") : "____/____/________"}</div>
              </div>
              <div>
                <div className="field-label">Telefone</div>
                <div className="field-value">{selectedPaciente.telefone || "____________________"}</div>
              </div>
              <div>
                <div className="field-label">E-mail</div>
                <div className="field-value">{selectedPaciente.email || "____________________"}</div>
              </div>
              <div>
                <div className="field-label">Endereço</div>
                <div className="field-value">{selectedPaciente.endereco || "____________________"}</div>
              </div>
              <div>
                <div className="field-label">Observações</div>
                <div className="field-value">{selectedPaciente.observacoes || "____________________"}</div>
              </div>
              <div>
                <div className="field-label">Descrição Clínica</div>
                <div className="field-value">{selectedPaciente.descricaoClinica || "____________________"}</div>
              </div>
              <div>
                <div className="field-label">CID</div>
                <div className="field-value">{selectedPaciente.cid || "____________________"}</div>
              </div>
            </div>

            {latestAg && (
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">Último Atendimento</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="field-label">Data do Atendimento</div>
                    <div className="field-value">{latestAg.data ? format(new Date(latestAg.data), "dd/MM/yyyy") : "____/____/________"}</div>
                  </div>
                  <div>
                    <div className="field-label">Horário</div>
                    <div className="field-value">{latestAg.hora || "____:____"}</div>
                  </div>
                  <div>
                    <div className="field-label">Unidade</div>
                    <div className="field-value">{unidades.find(u => u.id === latestAg.unidadeId)?.nome || "____________________"}</div>
                  </div>
                  <div>
                    <div className="field-label">Profissional</div>
                    <div className="field-value">{funcionarios.find(f => f.id === latestAg.profissionalId)?.nome || "____________________"}</div>
                  </div>
                  <div>
                    <div className="field-label">Status</div>
                    <div className="field-value">
                      <Badge className={statusColors[latestAg.status] || "bg-gray-100 text-gray-800"}>
                        {latestAg.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <div className="field-label">Tipo de Atendimento</div>
                    <div className="field-value">{latestAg.tipo || "____________________"}</div>
                  </div>
                  <div>
                    <div className="field-label">Observações</div>
                    <div className="field-value">{latestAg.observacoes || "____________________"}</div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};