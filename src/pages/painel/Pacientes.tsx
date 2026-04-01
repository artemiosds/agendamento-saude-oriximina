import React, { useState, useMemo, useCallback } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { Paciente } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, XCircle, Printer, Loader2, Phone, Mail, MapPin, Calendar, FileText, User, Heart, Activity } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import FichaImpressao from "@/components/FichaImpressao";

const Pacientes: React.FC = () => {
  const { pacientes, unidades, funcionarios } = useData();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterUnit, setFilterUnit] = useState<string>("all");
  const [selectedPaciente, setSelectedPaciente] = useState<Paciente | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);
  const [printData, setPrintData] = useState<{
    paciente: any;
    dadosClinicos: any;
    sinaisVitais: any;
    evolucoesClinicas: any[];
  } | null>(null);

  const filteredPacientes = useMemo(() => {
    return pacientes.filter((p) => {
      const matchesSearch = searchTerm === "" || 
        p.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.cpf.includes(searchTerm.replace(/\D/g, "")) ||
        p.cns.includes(searchTerm.replace(/\D/g, ""));
      const matchesUnit = filterUnit === "all" || p.unidadeId === filterUnit;
      return matchesSearch && matchesUnit;
    });
  }, [pacientes, searchTerm, filterUnit]);

  const fetchPrintData = useCallback(async (pacienteId: string) => {
    setPrintLoading(true);
    try {
      // Fetch all data in parallel
      const [
        pacienteRes,
        agendamentosRes,
        triagemRes,
        prontuariosRes,
      ] = await Promise.all([
        supabase.from("pacientes").select("*").eq("id", pacienteId).maybeSingle(),
        supabase.from("agendamentos").select("*").eq("paciente_id", pacienteId).order("data", { ascending: false }).limit(1),
        supabase.from("triage_records").select("*").eq("paciente_id", pacienteId).order("confirmado_em", { ascending: false }).limit(1),
        supabase.from("prontuarios").select("*").eq("paciente_id", pacienteId).order("data_atendimento", { ascending: false }).limit(5),
      ]);

      const pacienteData = pacienteRes.data;
      const lastAgendamento = agendamentosRes.data?.[0];
      const lastTriagem = triagemRes.data?.[0];
      const prontuarios = prontuariosRes.data || [];

      // Get unidade names
      const unidadeOrigem = lastAgendamento?.unidade_id 
        ? unidades.find(u => u.id === lastAgendamento.unidade_id)?.nome || ""
        : "";
      const unidadeAtendimento = pacienteData?.unidade_id 
        ? unidades.find(u => u.id === pacienteData.unidade_id)?.nome || ""
        : "";

      // Format date
      const formatDate = (d: string) => {
        if (!d) return "";
        try {
          return format(new Date(d + "T12:00:00"), "dd/MM/yyyy");
        } catch {
          return d;
        }
      };

      // Build print data
      setPrintData({
        paciente: {
          nomeCompleto: pacienteData?.nome || "",
          cpf: pacienteData?.cpf || "",
          cns: pacienteData?.cns || "",
          dataNascimento: pacienteData?.data_nascimento ? formatDate(pacienteData.data_nascimento) : "",
          nomeMae: pacienteData?.nome_mae || "",
          telefone: pacienteData?.telefone || "",
        },
        dadosClinicos: {
          numeroProntuario: lastAgendamento?.id?.substring(0, 8) || "",
          cid: pacienteData?.cid || lastAgendamento?.cid || "",
          tipoAtendimento: lastAgendamento?.tipo || "",
          unidadeOrigem,
          unidadeAtendimento,
          dataAtendimento: lastAgendamento?.data ? formatDate(lastAgendamento.data) : "",
        },
        sinaisVitais: {
          pressaoArterial: lastTriagem?.pressao_arterial || "",
          frequenciaCardiaca: lastTriagem?.frequencia_cardiaca ? String(lastTriagem.frequencia_cardiaca) : "",
          temperatura: lastTriagem?.temperatura ? String(lastTriagem.temperatura) : "",
          saturacao: lastTriagem?.saturacao_oxigenio ? String(lastTriagem.saturacao_oxigenio) : "",
          peso: lastTriagem?.peso ? String(lastTriagem.peso) : "",
          altura: lastTriagem?.altura ? String(lastTriagem.altura) : "",
        },
        evolucoesClinicas: prontuarios.map((p: any) => ({
          data: p.data_atendimento ? formatDate(p.data_atendimento) : "",
          observacao: p.evolucao || p.queixa_principal || p.conduta || "",
          profissionalResponsavel: p.profissional_nome || "",
        })),
      });

      setShowPrintPreview(true);
    } catch (err) {
      console.error("Error fetching print data:", err);
      toast.error("Erro ao carregar dados para impressão. Tente novamente.");
    } finally {
      setPrintLoading(false);
    }
  }, [unidades]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handlePrintComplete = useCallback(() => {
    setShowPrintPreview(false);
    setPrintData(null);
  }, []);

  const handlePacienteClick = useCallback((p: Paciente) => {
    setSelectedPaciente(p);
  }, []);

  const calcIdade = (dataNasc: string) => {
    if (!dataNasc) return "";
    try {
      const birth = new Date(dataNasc + "T12:00:00");
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
      return `${age} anos`;
    } catch {
      return "";
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Pacientes</h1>
          <p className="text-muted-foreground text-sm">{filteredPacientes.length} paciente(s) cadastrado(s)</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="shadow-card border-0">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Input
                placeholder="Buscar por nome, CPF ou CNS..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterUnit} onValueChange={setFilterUnit}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filtrar por unidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Unidades</SelectItem>
                {unidades.filter(u => u.ativo).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Patient List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredPacientes.map((p) => (
          <Card
            key={p.id}
            className="shadow-card border-0 cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all"
            onClick={() => handlePacienteClick(p)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{p.nome}</h3>
                  <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                    {p.cpf && <span>CPF: {p.cpf}</span>}
                    {p.cns && <span>CNS: {p.cns}</span>}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                    {p.telefone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.telefone}</span>}
                    {p.dataNascimento && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{calcIdade(p.dataNascimento)}</span>}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
              </div>
            </CardContent>
          </Card>
        ))}
        {filteredPacientes.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            Nenhum paciente encontrado.
          </div>
        )}
      </div>

      {/* Patient Details */}
      {selectedPaciente && (
        <Card className="shadow-card border-0">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-display">{selectedPaciente.nome}</CardTitle>
                <p className="text-sm text-muted-foreground">Informações detalhadas do paciente</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchPrintData(selectedPaciente.id)}
                  disabled={printLoading}
                >
                  {printLoading ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Printer className="w-4 h-4 mr-1" />
                  )}
                  Imprimir Ficha
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedPaciente(null)}>
                  <XCircle className="w-4 h-4 mr-1" /> Fechar
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">CPF</p>
                <p className="text-sm font-medium">{selectedPaciente.cpf || "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">CNS</p>
                <p className="text-sm font-medium">{selectedPaciente.cns || "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Data de Nascimento</p>
                <p className="text-sm font-medium">
                  {selectedPaciente.dataNascimento ? format(new Date(selectedPaciente.dataNascimento + "T12:00:00"), "dd/MM/yyyy") : "—"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Nome da Mãe</p>
                <p className="text-sm font-medium">{selectedPaciente.nomeMae || "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Telefone</p>
                <p className="text-sm font-medium">{selectedPaciente.telefone || "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">E-mail</p>
                <p className="text-sm font-medium">{selectedPaciente.email || "—"}</p>
              </div>
            </div>
            {(selectedPaciente.descricaoClinica || selectedPaciente.cid || selectedPaciente.observacoes) && (
              <div className="border-t pt-4 space-y-3">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Heart className="w-4 h-4 text-primary" /> Informações Clínicas
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedPaciente.cid && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">CID</p>
                      <p className="text-sm font-medium">{selectedPaciente.cid}</p>
                    </div>
                  )}
                  {selectedPaciente.descricaoClinica && (
                    <div className="space-y-1 sm:col-span-2">
                      <p className="text-xs text-muted-foreground">Descrição Clínica</p>
                      <p className="text-sm">{selectedPaciente.descricaoClinica}</p>
                    </div>
                  )}
                  {selectedPaciente.observacoes && (
                    <div className="space-y-1 sm:col-span-2">
                      <p className="text-xs text-muted-foreground">Observações</p>
                      <p className="text-sm">{selectedPaciente.observacoes}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Print Preview Overlay */}
      {showPrintPreview && printData && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card rounded-lg shadow-elevated max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold font-display">Pré-visualização da Ficha</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="w-4 h-4 mr-1" /> Imprimir
                </Button>
                <Button variant="ghost" size="sm" onClick={handlePrintComplete}>
                  <XCircle className="w-4 h-4 mr-1" /> Fechar
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-gray-100">
              <div className="bg-white shadow-lg mx-auto max-w-[210mm]">
                <FichaImpressao
                  paciente={printData.paciente}
                  dadosClinicos={printData.dadosClinicos}
                  sinaisVitais={printData.sinaisVitais}
                  evolucoesClinicas={printData.evolucoesClinicas}
                  unidadeSaude={printData.dadosClinicos.unidadeAtendimento}
                  nomeProfissional={user?.nome || ""}
                  perfilProfissional={user?.cargo || user?.role || ""}
                  registroProfissional={user?.tipoConselho && user?.numeroConselho 
                    ? `${user.tipoConselho} ${user.numeroConselho}${user.ufConselho ? `/${user.ufConselho}` : ""}`
                    : ""}
                  onPrintComplete={handlePrintComplete}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pacientes;