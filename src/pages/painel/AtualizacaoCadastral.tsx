
import React, { useState, useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Users, UserCheck, UserX, CreditCard, MapPin, Phone, 
  Search, Filter, Pencil, CheckCircle2, FileDown, FileUp, 
  ArrowLeft, Building2, AlertTriangle, Loader2 
} from "lucide-react";
import { calculatePatientPendingFields } from "@/lib/paciente-validation";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/queries/queryKeys";
import CadastroPacienteForm, { emptyPacienteForm } from "@/components/CadastroPacienteForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const AtualizacaoCadastral: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pacientes, unidades, refreshPacientes, logAction } = useData();
  const { user } = useAuth();
  const { can } = usePermissions();
  
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
    const completas = analyzedPacientes.filter(p => p.analysis.status === "completo" || p.analysis.status === "revisado").length;
    const incompletas = total - completas;
    const semCpf = analyzedPacientes.filter(p => !p.cpf).length;
    const semCns = analyzedPacientes.filter(p => !p.cns).length;
    const semUnidade = analyzedPacientes.filter(p => !p.unidadeId).length;
    const pendenteBpa = analyzedPacientes.filter(p => p.analysis.status === "pendente_bpa").length;

    return { total, completas, incompletas, semCpf, semCns, semUnidade, pendenteBpa };
  }, [analyzedPacientes]);

  const filteredPacientes = useMemo(() => {
    let list = analyzedPacientes;

    if (activeTab === "sem_cpf") list = list.filter(p => !p.cpf);
    else if (activeTab === "sem_cns") list = list.filter(p => !p.cns);
    else if (activeTab === "sem_unidade") list = list.filter(p => !p.unidadeId);
    else if (activeTab === "pendente_bpa") list = list.filter(p => p.analysis.status === "pendente_bpa");
    else if (activeTab === "incompletos") list = list.filter(p => p.analysis.status !== "completo" && p.analysis.status !== "revisado");

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => 
        p.nome.toLowerCase().includes(q) || 
        (p.cpf && p.cpf.includes(q)) || 
        (p.cns && p.cns.includes(q)) ||
        (p.telefone && p.telefone.includes(q))
      );
    }

    return list;
  }, [analyzedPacientes, activeTab, search]);

  const handleEditQuick = (p: any) => {
    setSelectedPatient(p);
    setEditForm({
      ...emptyPacienteForm,
      nome: p.nome,
      cpf: p.cpf || "",
      cns: p.cns || "",
      nomeMae: p.nomeMae || "",
      telefone: p.telefone || "",
      dataNascimento: p.dataNascimento || "",
      email: p.email || "",
      endereco: p.endereco || "",
      municipio: p.municipio || "",
      naturalidade: p.naturalidade || "",
      naturalidadeUf: p.naturalidade_uf || "",
      menorIdade: !!p.menor_idade,
      nomeResponsavel: p.nome_responsavel || "",
      cpfResponsavel: p.cpf_responsavel || "",
      isGestante: !!p.is_gestante,
      isPne: !!p.is_pne,
      isAutista: !!p.is_autista,
      customData: p.custom_data || {},
    });
    setIsEditModalOpen(true);
  };

  const handleSaveQuick = async () => {
    if (!selectedPatient) return;
    setIsSaving(true);
    try {
      // Usar o serviço central para garantir mapeamento correto e consistência
      await patientService.savePacienteCadastro(selectedPatient.id, {
        nome: editForm.nome,
        cpf: editForm.cpf,
        cns: editForm.cns,
        nome_mae: editForm.nomeMae,
        telefone_principal: editForm.telefone,
        data_nascimento: editForm.dataNascimento,
        email: editForm.email,
        endereco: editForm.endereco,
        municipio: editForm.municipio,
        naturalidade: editForm.naturalidade,
        naturalidade_uf: editForm.naturalidadeUf,
        menor_idade: editForm.menorIdade,
        nome_responsavel: editForm.nomeResponsavel,
        cpf_responsavel: editForm.cpfResponsavel,
        is_gestante: editForm.isGestante,
        is_pne: editForm.isPne,
        is_autista: editForm.isAutista,
        customData: {
          ...(editForm.customData || {}),
          atualizado_em: new Date().toISOString(),
          atualizado_por: user?.id || "",
          atualizado_por_nome: user?.nome || "",
        }
      }, "Central de Atualização Cadastral");

      toast.success("Dados do paciente atualizados!");
      setIsEditModalOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.pacientes.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.pacientes.detail(selectedPatient.id) });
      refreshPacientes();
      
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
      "telefone", "email", "municipio", "unidade_id", "pendencias", "status_cadastral", "completude"
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
      p.unidadeId || "SEM UNIDADE",
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
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2 mb-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/painel/pacientes")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar para Pacientes
        </Button>
      </div>

      <PageHeader
        title="Central de Atualização Cadastral"
        subtitle="Identifique e corrija pendências nos cadastros dos pacientes para garantir a integridade dos dados e do BPA/SUS."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportCSV("pendentes")}>
              <FileDown className="w-4 h-4 mr-2" /> Exportar Pendentes
            </Button>
            <Button variant="outline">
              <FileUp className="w-4 h-4 mr-2" /> Importar Atualizações
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        <StatCard title="Total" value={stats.total} icon={Users} color="text-blue-600" />
        <StatCard title="Completos" value={stats.completas} icon={UserCheck} color="text-green-600" />
        <StatCard title="Incompletos" value={stats.incompletas} icon={UserX} color="text-orange-600" />
        <StatCard title="Sem CPF" value={stats.semCpf} icon={CreditCard} color="text-red-600" />
        <StatCard title="Sem CNS" value={stats.semCns} icon={CreditCard} color="text-purple-600" />
        <StatCard title="Sem Unidade" value={stats.semUnidade} icon={Building2} color="text-red-700" />
        <StatCard title="Pendente BPA" value={stats.pendenteBpa} icon={AlertTriangle} color="text-yellow-600" />
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-2 md:grid-cols-6 w-full h-auto">
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="incompletos">Incompletos</TabsTrigger>
            <TabsTrigger value="sem_cpf">Sem CPF</TabsTrigger>
            <TabsTrigger value="sem_cns">Sem CNS</TabsTrigger>
            <TabsTrigger value="sem_unidade">Sem Unidade</TabsTrigger>
            <TabsTrigger value="pendente_bpa">BPA/SUS</TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por nome, CPF, CNS..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead>CPF / CNS</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Pendências Principais</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Completude</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPacientes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum paciente encontrado com esses critérios.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPacientes.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">{p.nome}</div>
                        <div className="text-xs text-muted-foreground">{p.dataNascimento ? new Date(p.dataNascimento).toLocaleDateString() : "Sem data nasc."}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">{p.cpf || <span className="text-red-500">Sem CPF</span>}</div>
                        <div className="text-xs">{p.cns || <span className="text-purple-500">Sem CNS</span>}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          {unidades.find(u => u.id === p.unidadeId)?.nome || <span className="text-red-700 font-bold">SEM UNIDADE</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {p.analysis.fields.slice(0, 3).map((f, i) => (
                            <Badge key={i} variant="outline" className="text-[10px] font-normal border-orange-200 bg-orange-50 text-orange-700">
                              {f}
                            </Badge>
                          ))}
                          {p.analysis.fields.length > 3 && (
                            <Badge variant="outline" className="text-[10px] font-normal">
                              +{p.analysis.fields.length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={p.analysis.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${p.analysis.percentage > 80 ? 'bg-green-500' : p.analysis.percentage > 40 ? 'bg-orange-500' : 'bg-red-500'}`}
                              style={{ width: `${p.analysis.percentage}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium">{p.analysis.percentage}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleEditQuick(p)}>
                          <Pencil className="w-4 h-4" />
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edição Rápida de Paciente</DialogTitle>
          </DialogHeader>
          <CadastroPacienteForm
            pacienteId={selectedPatient?.id}
            form={editForm}
            onChange={setEditForm}
            onSave={handleSaveQuick}
            saving={isSaving}
            isEdit={true}
            errors={{}}
          />
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveQuick} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Salvar Alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const StatCard = ({ title, value, icon: Icon, color }: any) => (
  <Card className="shadow-sm border-0 bg-card/50">
    <CardContent className="p-4 flex flex-col items-center text-center">
      <div className={`p-2 rounded-full bg-muted mb-2 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">{title}</div>
    </CardContent>
  </Card>
);

const StatusBadge = ({ status }: { status: string }) => {
  const configs: any = {
    completo: { label: "Completo", className: "bg-green-100 text-green-700 border-green-200" },
    incompleto: { label: "Incompleto", className: "bg-orange-100 text-orange-700 border-orange-200" },
    pendente_bpa: { label: "Pendente BPA", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    sem_unidade: { label: "Sem Unidade", className: "bg-red-100 text-red-700 border-red-200" },
    revisado: { label: "Revisado", className: "bg-blue-100 text-blue-700 border-blue-200" },
  };

  const config = configs[status] || configs.incompleto;
  return (
    <Badge variant="outline" className={`${config.className} font-medium`}>
      {config.label}
    </Badge>
  );
};

export default AtualizacaoCadastral;
