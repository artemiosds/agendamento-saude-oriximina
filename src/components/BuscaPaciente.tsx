import React, { useState, useEffect, useMemo } from "react";
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

interface BuscaPacienteProps {
  pacientes: Paciente[];
  value: string;
  onChange: (id: string, nome: string) => void;
}

export const BuscaPaciente: React.FC<BuscaPacienteProps> = ({ pacientes, value, onChange }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedId, setSelectedId] = useState(value);

  useEffect(() => {
    setSelectedId(value);
  }, [value]);

  const filteredPacientes = useMemo(() => {
    if (!pacientes || pacientes.length === 0) return [];
    const term = searchTerm.toLowerCase().trim();
    if (!term) return pacientes.slice(0, 10);
    return pacientes.filter((p) => {
      if (!p) return false;
      return (
        (p.nome || "").toLowerCase().includes(term) ||
        (p.cpf || "").includes(term.replace(/\D/g, "")) ||
        (p.cns || "").includes(term.replace(/\D/g, ""))
      );
    }).slice(0, 10);
  }, [pacientes, searchTerm]);

  const handleSelect = (p: Paciente) => {
    if (!p) return;
    setSelectedId(p.id);
    onChange(p.id, p.nome || "");
    setSearchTerm("");
  };

  const selectedPaciente = pacientes.find(p => p.id === selectedId);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar paciente por nome, CPF ou CNS..."
          value={searchTerm || (selectedPaciente?.nome || "")}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (selectedId) {
              setSelectedId("");
              onChange("", "");
            }
          }}
          className="pl-9"
        />
      </div>
      
      {searchTerm && filteredPacientes.length > 0 && (
        <div className="border rounded-lg max-h-48 overflow-y-auto bg-background">
          {filteredPacientes.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelect(p)}
              className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b last:border-b-0"
            >
              <div className="font-medium text-sm">{p.nome || "Sem nome"}</div>
              <div className="text-xs text-muted-foreground">
                {p.cpf && <span>CPF: {p.cpf}</span>}
                {p.cns && <span className="ml-2">CNS: {p.cns}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedPaciente && !searchTerm && (
        <div className="flex items-center gap-2 p-2 bg-primary/5 border border-primary/20 rounded-lg text-sm">
          <UserIcon className="w-4 h-4 text-primary shrink-0" />
          <span className="text-primary font-medium">{selectedPaciente.nome}</span>
          <button
            type="button"
            onClick={() => {
              setSelectedId("");
              onChange("", "");
            }}
            className="ml-auto text-muted-foreground hover:text-destructive text-xs"
          >
            ✕ limpar
          </button>
        </div>
      )}
    </div>
  );
};