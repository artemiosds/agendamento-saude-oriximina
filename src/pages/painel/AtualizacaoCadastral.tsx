
import React, { useState, useMemo } from "react";
import { usePacientes } from "@/contexts/PacientesContext";
import { useOperacional } from "@/contexts/OperacionalContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Users, UserCheck, CreditCard, 
  Search, Pencil, CheckCircle2, FileDown, FileUp, 
  ArrowLeft, AlertTriangle, Loader2, UserMinus, ShieldAlert
} from "lucide-react";
import { calculatePatientPendingFields, PatientStatus } from "@/lib/paciente-validation";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { patientService } from "@/services/patientService";
import CadastroPacienteForm, { emptyPacienteForm } from "@/components/CadastroPacienteForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { normalizeSexo } from "@/lib/utils/sexo-normalization";


const AtualizacaoCadastral: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pacientes, refreshPacientes } = usePacientes();
  const { logAction } = useOperacional();
  const { user } = useAuth();
  
  const [activeTab, setActiveTab] = useState("todos");
  const [search, setSearch] = useState("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [editForm, setEditForm] = useState(emptyPacienteForm);
  const [isSaving, setIsSaving] = useState(false);

  // Filter based on user scope
  const scopedPacientes = useMemo(() => {
    if (user?.usuario === "admin.sms") return pacientes;
    if (user?.unidadeId) {
      return pacientes.filter(p => !p.unidadeId || p.unidadeId === user.unidadeId);
    }
    return pacientes;
  }, [pacientes, user]);

  // Calculate stats and pendencies
  const analyzedPacientes = useMemo(() => {
    return scopedPacientes.map(p => ({
      ...p,
      analysis: calculatePatientPendingFields(p)
    }));
  }, [scopedPacientes]);

  const stats = useMemo(() => {
    const total = analyzedPacientes.length;
    const concluidos = analyzedPacientes.filter(p => p.analysis.status === "completo" || p.analysis.status === "revisado").length;
    const pendentes = total - concluidos;
    const semCpf = analyzedPacientes.filter(p => !p.cpf).length;
    const semCns = analyzedPacientes.filter(p => !p.cns).length;
    const pendenteBpa = analyzedPacientes.filter(p => p.analysis.status === "pendente_bpa").length;

    return { total, concluidos, pendentes, semCpf, semCns, pendenteBpa };
  }, [analyzedPacientes]);

  const filteredPacientes = useMemo(() => {
    let list = analyzedPacientes;

    if (activeTab === "sem_cpf") list = list.filter(p => !p.cpf);
    else if (activeTab === "sem_cns") list = list.filter(p => !p.cns);
    else if (activeTab === "pendente_bpa") list = list.filter(p => p.analysis.status === "pendente_bpa");
    else if (activeTab === "pendentes") list = list.filter(p => p.analysis.status !== "completo" && p.analysis.status !== "revisado");

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => 
        p.nome.toLowerCase().includes(q) || 
        (p.cpf && p.cpf.includes(q)) || 
        (p.cns && p.cns.includes(q))
      );
    }

    return list;
  }, [analyzedPacientes, activeTab, search]);

  const handleEditQuick = (p: any) => {
    setSelectedPatient(p);
    const cd = p.custom_data || {};
    
    // Mapeamento completo e explícito para garantir que nada se perca entre o objeto do banco e o form
    const formData = {
      ...emptyPacienteForm,
      // Identificação
      nome: p.nome || "",
      cpf: p.cpf || "",
      cns: p.cns || "",
      nomeMae: p.nome_mae || p.nomeMae || "",
      dataNascimento: p.data_nascimento || p.dataNascimento || "",
      naturalidade: p.naturalidade || "",
      naturalidadeUf: p.naturalidade_uf || p.naturalidadeUf || "",
      menorIdade: !!(p.menor_idade ?? cd.menor_idade),
      nomeResponsavel: p.nome_responsavel || cd.nome_responsavel || "",
      cpfResponsavel: p.cpf_responsavel || cd.cpf_responsavel || "",
      
      // Contato
      telefone: p.telefone || p.telefone_principal || "",
      email: p.email || "",
      
      // Endereço (Priorizando campos estruturados do custom_data)
      municipio: p.municipio || "",
      endereco: p.endereco || "",
      
      // Flags de prioridade
      isGestante: !!(p.is_gestante ?? cd.is_gestante),
      isPne: !!(p.is_pne ?? cd.is_pne),
      isAutista: !!(p.is_autista ?? cd.is_autista),
      
      // Preservar todo o custom_data original
      customData: {
        ...cd,
        // Garantir campos de endereço no customData para o formulário
        cep: cd.cep || "",
        logradouro: cd.logradouro || "",
        numero: cd.numero || "",
        complemento: cd.complemento || "",
        bairro: cd.bairro || "",
        uf: cd.uf || "PA",
        tipoLogradouro: cd.tipoLogradouro || cd.tipo_logradouro_dne || "",
        tipoLogradouroCodigo: cd.tipoLogradouroCodigo || "",
        telefoneSecundario: cd.telefoneSecundario || cd.telefone_secundario || "",
        sexo: normalizeSexo(p.sexo || cd.sexo),
        racaCor: cd.racaCor || cd.raca_cor || "",
        nacionalidade: cd.nacionalidade || "brasileiro",
      },
    };
    
    setEditForm(formData);
    setIsEditModalOpen(true);
  };

  const handleSaveQuick = async () => {
    if (!selectedPatient) return;
    setIsSaving(true);
    try {
      // O service agora é inteligente o suficiente para lidar com o editForm diretamente
      // mesmo que alguns campos estejam dentro de customData
      const result = await patientService.savePacienteCadastro(
        selectedPatient.id, 
        editForm, 
        "Central de Atualização Cadastral"
      );
      
      if (!result) {
        throw new Error("Não foi possível confirmar o salvamento no servidor.");
      }

      // Invalidação global e específica para garantir que TODAS as telas (incluindo Página do Paciente) se atualizem
      await refreshPacientes();
      await queryClient.invalidateQueries();
      
      // Forçar atualização do cache específico do paciente para garantir que a Página do Paciente veja os novos dados
      queryClient.setQueryData(queryKeys.pacientes.detail(selectedPatient.id), result);

      toast.success("Dados do paciente atualizados com sucesso!");
      setIsEditModalOpen(false);
      
      logAction({
        acao: "editar",
        entidade: "paciente",
        entidadeId: selectedPatient.id,
        detalhes: { acao: "edicao_rapida_central_pendencias", nome: editForm.nome },
        user
      });
    } catch (err: any) {
      console.error("[AtualizacaoCadastral] Erro ao salvar:", err);
      toast.error("Erro ao salvar alterações: " + (err?.message || ""));
    } finally {
      setIsSaving(false);
    }
  };

  const exportCSV = (type: "pendentes" | "todos") => {
    const listToExport = type === "pendentes" 
      ? analyzedPacientes.filter(p => p.analysis.status !== "completo" && p.analysis.status !== "revisado")
      : analyzedPacientes;

    if (listToExport.length === 0) {
      toast.error("Nenhum registro para exportar.");
      return;
    }

    const headers = [
      "id_paciente", "nome", "cpf", "cns", "data_nascimento", "nome_mae", 
      "telefone", "email", "municipio", "pendencias", "status_cadastral", "completude"
    ];

    const rows = listToExport.map(p => [
      p.id,
      p.nome,
      p.cpf || "",
      p.cns || "",
      p.dataNascimento || "",
      p.nomeMae || "",
      p.telefone || "",
      p.email || "",
      (p as any).municipio || "",
      p.analysis.fields.join(" | "),
      p.analysis.status,
      `${p.analysis.percentage}%`
    ]);

    const csvContent = [
      headers.join(";"),
      ...rows.map(r => r.join(";"))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pacientes_${type}_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Exportação concluída!");
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-[1600px] mx-auto pb-10">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="hover:bg-accent/50" onClick={() => navigate("/painel/pacientes")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar para Pacientes
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <PageHeader
          className="p-0 border-0"
          title="Central de Atualização Cadastral"
          subtitle="Identifique e corrija rapidamente as pendências cadastrais para garantir a integridade dos dados e do BPA/SUS."
        />
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" className="h-10 border-dashed" onClick={() => exportCSV("pendentes")}>
            <FileDown className="w-4 h-4 mr-2" /> Exportar Pendentes
          </Button>
          <Button variant="outline" className="h-10 border-dashed">
            <FileUp className="w-4 h-4 mr-2" /> Importar Atualizações
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard title="Total" value={stats.total} icon={Users} color="bg-blue-50 text-blue-600" />
        <StatCard title="Pendentes" value={stats.pendentes} icon={UserMinus} color="bg-orange-50 text-orange-600" />
        <StatCard title="Concluídos" value={stats.concluidos} icon={UserCheck} color="bg-emerald-50 text-emerald-600" />
        <StatCard title="Sem CPF" value={stats.semCpf} icon={CreditCard} color="bg-rose-50 text-rose-600" />
        <StatCard title="Sem CNS" value={stats.semCns} icon={ShieldAlert} color="bg-indigo-50 text-indigo-600" />
        <StatCard title="Pendente BPA" value={stats.pendenteBpa} icon={AlertTriangle} color="bg-amber-50 text-amber-600" />
      </div>

      <div className="flex flex-col xl:flex-row gap-6 items-start xl:items-center justify-between">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full xl:w-auto">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="todos" className="data-[state=active]:bg-background data-[state=active]:shadow-sm px-6">Todos</TabsTrigger>
            <TabsTrigger value="pendentes" className="data-[state=active]:bg-background data-[state=active]:shadow-sm px-6">Pendentes</TabsTrigger>
            <TabsTrigger value="sem_cpf" className="data-[state=active]:bg-background data-[state=active]:shadow-sm px-6">Sem CPF</TabsTrigger>
            <TabsTrigger value="sem_cns" className="data-[state=active]:bg-background data-[state=active]:shadow-sm px-6">Sem CNS</TabsTrigger>
            <TabsTrigger value="pendente_bpa" className="data-[state=active]:bg-background data-[state=active]:shadow-sm px-6">BPA/SUS</TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="relative w-full xl:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por nome, CPF ou CNS..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-11 bg-background border-muted shadow-sm focus-visible:ring-primary"
          />
        </div>
      </div>

      <Card className="border-none shadow-xl bg-background overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent border-muted">
                  <TableHead className="font-semibold py-5">Paciente</TableHead>
                  <TableHead className="font-semibold py-5">CPF / CNS</TableHead>
                  <TableHead className="font-semibold py-5">Pendências Principais</TableHead>
                  <TableHead className="font-semibold py-5">Status</TableHead>
                  <TableHead className="font-semibold py-5">Completude</TableHead>
                  <TableHead className="font-semibold py-5 text-right px-6">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPacientes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-20 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <Users className="w-10 h-10 opacity-20" />
                        <p>Nenhum paciente encontrado com esses critérios.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPacientes.map((p) => (
                    <TableRow key={p.id} className="group hover:bg-muted/20 transition-colors border-muted">
                      <TableCell className="py-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground text-sm leading-tight">{p.nome}</span>
                          <span className="text-[11px] text-muted-foreground mt-1">
                            { p.dataNascimento ? new Date(p.dataNascimento).toLocaleDateString() : "Sem data nasc."}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded w-fit text-muted-foreground">
                            {p.cpf || "Sem CPF"}
                          </code>
                          <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded w-fit text-muted-foreground">
                            {p.cns || "Sem CNS"}
                          </code>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5 max-w-xs">
                          {p.analysis.fields.slice(0, 2).map((f, i) => (
                            <Badge key={i} variant="outline" className="text-[10px] font-medium py-0 h-5 border-orange-100 bg-orange-50 text-orange-700">
                              {f}
                            </Badge>
                          ))}
                          {p.analysis.fields.length > 2 && (
                            <Badge variant="outline" className="text-[10px] font-medium py-0 h-5 border-muted bg-muted/50">
                              +{p.analysis.fields.length - 2}
                            </Badge>
                          )}
                          {p.analysis.fields.length === 0 && (
                            <span className="text-[11px] text-muted-foreground/60 italic">Nenhuma pendência</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={p.analysis.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-500 ${
                                p.analysis.percentage >= 90 ? 'bg-emerald-500' : 
                                p.analysis.percentage >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                              }`}
                              style={{ width: `${p.analysis.percentage}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-bold text-muted-foreground">{p.analysis.percentage}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right px-6">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 w-8 p-0 border-muted group-hover:border-primary group-hover:text-primary transition-all" 
                          onClick={() => handleEditQuick(p)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-4xl max-h-[95vh] overflow-hidden p-0 flex flex-col gap-0 border-none shadow-2xl">
          <DialogHeader className="p-6 bg-muted/20 border-b">
            <div className="flex justify-between items-center">
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  Atualização de Cadastro
                  <Badge variant="outline" className="ml-2 bg-background font-normal text-muted-foreground">Paciente: {selectedPatient?.nome?.split(' ')[0]}</Badge>
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">Preencha os campos obrigatórios para regularizar o paciente.</p>
              </div>
            </div>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto p-6 bg-background">
            <CadastroPacienteForm
              pacienteId={selectedPatient?.id}
              form={editForm}
              onChange={setEditForm}
              onSave={handleSaveQuick}
              saving={isSaving}
              isEdit={true}
              errors={{}}
            />
          </div>

          <div className="p-6 bg-muted/20 border-t flex justify-between items-center">
            <div className="text-xs text-muted-foreground italic flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
              "Unidade" não é obrigatória para esta atualização.
            </div>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setIsEditModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveQuick} disabled={isSaving} className="px-8 shadow-lg shadow-primary/20">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Salvar Atualizações
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const StatCard = ({ title, value, icon: Icon, color }: any) => (
  <Card className="border-none shadow-sm hover:shadow-md transition-shadow bg-background">
    <CardContent className="p-5 flex items-center gap-4">
      <div className={`p-2.5 rounded-xl ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex flex-col">
        <span className="text-2xl font-bold text-foreground leading-none mb-1">{value}</span>
        <span className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider">{title}</span>
      </div>
    </CardContent>
  </Card>
);

const StatusBadge = ({ status }: { status: PatientStatus }) => {
  const configs: Record<PatientStatus, { label: string, className: string }> = {
    completo: { label: "Completo", className: "bg-emerald-50 text-emerald-700 border-emerald-100" },
    parcial: { label: "Parcial", className: "bg-blue-50 text-blue-700 border-blue-100" },
    pendente_bpa: { label: "Pendente BPA", className: "bg-amber-50 text-amber-700 border-amber-100" },
    pendente_cadastro: { label: "Pend. Cadastro", className: "bg-rose-50 text-rose-700 border-rose-100" },
    revisado: { label: "Revisado", className: "bg-indigo-50 text-indigo-700 border-indigo-100" },
  };

  const config = configs[status] || configs.pendente_cadastro;
  return (
    <Badge variant="outline" className={`${config.className} font-semibold text-[10px] py-0 px-2 h-5 border shadow-none`}>
      {config.label}
    </Badge>
  );
};

export default AtualizacaoCadastral;
