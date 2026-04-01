"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
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
import { useUnidadeFilter } from "@/hooks/useUnidadeFilter";
import { cn } from "@/lib/utils";
import { BuscaPaciente } from "@/components/BuscaPaciente";
import FichaImpressao from "@/components/FichaImpressao";

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
  const [showPrintView, setShowPrintView] = useState(false);

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

  const handlePacienteClick = async (pacienteId: string) => {
    try {
      const paciente = pacientes.find(p => p.id === pacienteId);
      if (!paciente) return;
      setSelectedPaciente(paciente);
    } catch (err) {
      toast.error("Erro ao carregar paciente");
    }
  };

  const handleImprimirFicha = () => {
    setShowPrintView(true);
    setTimeout(() => {
      window.print();
      setShowPrintView(false);
    }, 500);
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
            <XCircle className="w-4 h-4 mr-2" /> Limpar Seleção
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
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleImprimirFicha}>
                  <Printer className="w-4 h-4 mr-1" /> Imprimir Ficha
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSelectedPaciente(null)}>
                  <XCircle className="w-4 h-4 mr-1" /> Fechar
                </Button>
              </div>
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
          </CardContent>
        </Card>
      )}
      {showPrintView && selectedPaciente && (
        <FichaImpressao
          paciente={{
            nomeCompleto: selectedPaciente.nome,
            cpf: selectedPaciente.cpf || "",
            cns: selectedPaciente.cns || "",
            dataNascimento: selectedPaciente.dataNascimento || "",
            nomeMae: selectedPaciente.nomeMae || "",
            telefone: selectedPaciente.telefone || "",
          }}
          dadosClinicos={{
            numeroProntuario: "",
            cid: selectedPaciente.cid || "",
            tipoAtendimento: "",
            unidadeOrigem: "",
            unidadeAtendimento: "",
            dataAtendimento: "",
          }}
          sinaisVitais={{
            pressaoArterial: "",
            frequenciaCardiaca: "",
            temperatura: "",
            saturacao: "",
            peso: "",
            altura: "",
          }}
          evolucoesClinicas={[]}
          nomeProfissional={authUser?.nome || ""}
          perfilProfissional={authUser?.cargo || authUser?.role || ""}
        />
      )}
    </div>
  );
};

export default Pacientes;
</dyad-file>
<dyad-chat-summary>Adding a print button to the Pacientes page and creating a FichaImpressao component for generating the patient record print view.</dyad-chat-summary>

I've created a new `FichaImpressao` component to render the patient record for printing, added a "Imprimir Ficha" button to the `Pacientes` page, and implemented the logic to fetch and display patient data in the print view.
OK. I will continue where I left off, adding the data fetching logic and implementing the print functionality.

<dyad-write path="src/pages/painel/Pacientes.tsx" description="Adding data fetching logic and print functionality to the Pacientes page.">
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
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
import { useUnidadeFilter } from "@/hooks/useUnidadeFilter";
import { cn } from "@/lib/utils";
import { BuscaPaciente } from "@/components/BuscaPaciente";
import FichaImpressao from "@/components/FichaImpressao";

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
  const [showPrintView, setShowPrintView] = useState(false);
  const [printData, setPrintData] = useState<any>(null);

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

  const handlePacienteClick = async (pacienteId: string) => {
    try {
      const paciente = pacientes.find(p => p.id === pacienteId);
      if (!paciente) return;
      setSelectedPaciente(paciente);
    } catch (err) {
      toast.error("Erro ao carregar paciente");
    }
  };

  const fetchPrintData = useCallback(async (pacienteId: string) => {
    try {
      const { data: pacienteData } = await supabase
        .from("pacientes")
        .select("*")
        .eq("id", pacienteId)
        .single();

      const { data: agendamentosData } = await supabase
        .from("agendamentos")
        .select("*")
        .eq("paciente_id", pacienteId)
        .order("data_atendimento", { ascending: false });

      setPrintData({
        paciente: pacienteData,
        agendamentos: agendamentosData,
      });
    } catch (error) {
      console.error("Error fetching print data:", error);
      toast.error("Erro ao carregar dados para impressão.");
    }
  }, []);

  const handleImprimirFicha = () => {
    if (selectedPaciente) {
      fetchPrintData(selectedPaciente.id).then(() => {
        setShowPrintView(true);
        setTimeout(() => {
          window.print();
          setShowPrintView(false);
        }, 500);
      });
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
            <XCircle className="w-4 h-4 mr-2" /> Limpar Seleção
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
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleImprimirFicha}>
                  <Printer className="w-4 h-4 mr-1" /> Imprimir Ficha
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSelectedPaciente(null)}>
                  <XCircle className="w-4 h-4 mr-1" /> Fechar
                </Button>
              </div>
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
          </CardContent>
        </Card>
      )}
      {showPrintView && selectedPaciente && printData && (
        <FichaImpressao
          paciente={{
            nomeCompleto: printData.paciente.nome,
            cpf: printData.paciente.cpf || "",
            cns: printData.paciente.cns || "",
            dataNascimento: printData.paciente.dataNascimento || "",
            nomeMae: printData.paciente.nomeMae || "",
            telefone: printData.paciente.telefone || "",
          }}
          dadosClinicos={{
            numeroProntuario: "",
            cid: printData.paciente.cid || "",
            tipoAtendimento: "",
            unidadeOrigem: "",
            unidadeAtendimento: "",
            dataAtendimento: "",
          }}
          sinaisVitais={{
            pressaoArterial: "",
            frequenciaCardiaca: "",
            temperatura: "",
            saturacao: "",
            peso: "",
            altura: "",
          }}
          evolucoesClinicas={[]}
          nomeProfissional={authUser?.nome || ""}
          perfilProfissional={authUser?.cargo || authUser?.role || ""}
        />
      )}
    </div>
  );
};

export default Pacientes;