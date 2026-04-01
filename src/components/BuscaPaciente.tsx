import React, { useState, useEffect } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { Paciente } from "@/types";
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

interface PacienteProps {
  setSelectedPaciente: (paciente: Paciente) => void;
  onClose: () => void;
}

export const BuscaPaciente: React.FC<PacienteProps> = ({ setSelectedPaciente, onClose }) => {
  const { pacientes, unidades, funcionarios } = useData();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterUnit, setFilterUnit] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

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
      onClose();
    } catch (err) {
      toast.error("Erro ao carregar paciente");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Buscar Paciente</h1>
          <p className="text-sm text-gray-500">Selecione um paciente existente ou cadastre um novo</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            <XCircle className="w-4 h-4 mr-1" /> Fechar
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
    </div>
  );
};