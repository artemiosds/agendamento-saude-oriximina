import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { cn, todayLocalStr } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import FichaPacienteCabecalho from "@/components/FichaPacienteCabecalho";
import { useProntuarioStructure } from "@/hooks/useProntuarioStructure";
import { useProntuarioConfig } from "@/hooks/useProntuarioConfig";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useData } from "@/contexts/DataContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, FileText, Printer, Search, CheckCircle, Activity, ClipboardList, ChevronDown, Eye, Download, History, User, MapPin } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import HistoricoPacientePanel from "@/components/prontuario/HistoricoPacientePanel";
import ProntuarioVisitaDomiciliar from "@/components/ProntuarioVisitaDomiciliar";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams, useNavigate } from "react-router-dom";
import AtendimentoTimer from "@/components/AtendimentoTimer";
import { downloadProntuarioPdf } from "@/lib/prontuarioPdf";
import { BuscaPaciente } from "@/components/BuscaPaciente";
import DynamicProntuarioFields from "@/components/prontuario/DynamicProntuarioFields";
import { hasDropdownSoap } from "@/data/soapOptionsByProfession";
import { useSoapCustomOptions } from "@/hooks/useSoapCustomOptions";
import { DebouncedTextarea } from "@/components/ui/debounced-textarea";
import HistoricoCentralList from "@/components/prontuario/HistoricoCentralList";

const TIPOS_REGISTRO = [
  { value: 'avaliacao_inicial', label: '🟢 Avaliação Inicial' },
  { value: 'retorno', label: '🔵 Retorno' },
  { value: 'sessao', label: '🟡 Sessão' },
  { value: 'urgencia', label: '🔴 Urgência' },
  { value: 'procedimento', label: '🟣 Procedimento' },
  { value: 'Visita Domiciliar', label: '🏠 Visita Domiciliar' },
];

const emptyForm = {
  paciente_id: "",
  paciente_nome: "",
  profissional_id: "",
  profissional_nome: "",
  agendamento_id: "",
  data_atendimento: todayLocalStr(),
  hora_atendimento: "",
  tipo_registro: "sessao",
  queixa_principal: "",
  anamnese: "",
  sinais_sintomas: "",
  exame_fisico: "",
  hipotese: "",
  conduta: "",
  prescricao: "",
  solicitacao_exames: "",
  evolucao: "",
  observacoes: "",
  soap_subjetivo: "",
  soap_objetivo: "",
  soap_avaliacao: "",
  soap_plano: "",
  custom_data: {}
};

const ProntuarioPage: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const { pacientes, unidades, agendamentos, logAction, refreshAgendamentos, funcionarios } = useData();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prontuarios, setProntuarios] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [viewerProntuario, setViewerProntuario] = useState<any | null>(null);
  const [activeAtendimento, setActiveAtendimento] = useState<{ agendamentoId: string; horaInicio: string } | null>(null);

  const queryPacienteId = searchParams.get("pacienteId");
  const queryAgendamentoId = searchParams.get("agendamentoId");
  const queryTipo = searchParams.get("tipo");

  const { enabledFields, loading: loadingStructure } = useProntuarioStructure(form.tipo_registro);
  const { visibleBlocks, isBlocoVisible, isBlocoRequired } = useProntuarioConfig(user?.id, form.tipo_registro, user?.profissao);

  const loadProntuarios = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from("prontuarios").select("*").order("data_atendimento", { ascending: false });
      if (queryPacienteId) query = query.eq("paciente_id", queryPacienteId);
      
      const { data, error } = await query;
      if (error) throw error;
      setProntuarios(data || []);
    } catch (err) {
      console.error("Erro ao carregar prontuários:", err);
      toast.error("Erro ao carregar registros.");
    } finally {
      setLoading(false);
    }
  }, [queryPacienteId]);

  useEffect(() => {
    loadProntuarios();
  }, [loadProntuarios]);

  useEffect(() => {
    if (queryAgendamentoId && queryPacienteId) {
      const pac = pacientes.find(p => p.id === queryPacienteId);
      setForm(prev => ({
        ...prev,
        paciente_id: queryPacienteId,
        paciente_nome: pac?.nome || "",
        agendamento_id: queryAgendamentoId,
        tipo_registro: queryTipo || "sessao",
        profissional_id: user?.id || "",
        profissional_nome: user?.nome || ""
      }));
      setDialogOpen(true);
    }
  }, [queryAgendamentoId, queryPacienteId, queryTipo, pacientes, user]);

  const handleSave = async (extraData?: any) => {
    if (!form.paciente_id) {
      toast.error("Selecione um paciente.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        ...extraData,
        profissional_id: user?.id,
        profissional_nome: user?.nome,
        unidade_id: user?.unidadeId
      };

      let result;
      if (editId) {
        result = await supabase.from("prontuarios").update(payload).eq("id", editId);
      } else {
        result = await supabase.from("prontuarios").insert(payload);
      }

      if (result.error) throw result.error;

      // Finalizar agendamento se existir
      if (form.agendamento_id) {
        await supabase.from("agendamentos").update({ status: "concluido" }).eq("id", form.agendamento_id);
        refreshAgendamentos();
      }

      toast.success(editId ? "Prontuário atualizado!" : "Prontuário registrado!");
      setDialogOpen(false);
      setForm(emptyForm);
      loadProntuarios();
      return true;
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao salvar: " + err.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search) return prontuarios;
    const s = search.toLowerCase();
    return prontuarios.filter(p => 
      p.paciente_nome?.toLowerCase().includes(s) || 
      p.profissional_nome?.toLowerCase().includes(s) ||
      p.tipo_registro?.toLowerCase().includes(s)
    );
  }, [prontuarios, search]);

  const openNew = (pid?: string) => {
    setEditId(null);
    const pac = pid ? pacientes.find(p => p.id === pid) : null;
    setForm({ ...emptyForm, paciente_id: pid || "", paciente_nome: pac?.nome || "" });
    setDialogOpen(true);
  };

  const openEdit = (p: any) => {
    setEditId(p.id);
    setForm(p);
    setDialogOpen(true);
  };

  const currentPatientHistory = useMemo(() => {
    return prontuarios.filter(p => p.paciente_id === form.paciente_id && p.id !== editId);
  }, [prontuarios, form.paciente_id, editId]);

  const handleFieldChange = (key: string, value: any) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">
            {queryPacienteId ? "Prontuários do Paciente" : "Gestão de Prontuários"}
          </h1>
          <p className="text-muted-foreground text-sm">{filtered.length} registro(s) encontrado(s)</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => openNew(queryPacienteId || undefined)} className="gradient-primary">
            <Plus className="w-4 h-4 mr-2" /> Novo Registro
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por paciente, profissional ou tipo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum prontuário encontrado.</CardContent></Card>
        ) : (
          filtered.map(p => (
            <Card key={p.id} className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => openEdit(p)}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{p.paciente_nome}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{p.tipo_registro}</Badge>
                      <span>•</span>
                      <span>{new Date(p.data_atendimento + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                      <span>•</span>
                      <span>{p.profissional_nome}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); downloadProntuarioPdf(p); }}><Printer className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon"><Eye className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>{editId ? "Editar" : "Novo"} Prontuário</DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden flex">
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Paciente</Label>
                    <BuscaPaciente 
                      pacientes={pacientes} 
                      value={form.paciente_id} 
                      onChange={(id, nome) => setForm(f => ({ ...f, paciente_id: id, paciente_nome: nome }))} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo de Registro</Label>
                    <Select value={form.tipo_registro} onValueChange={(v) => setForm(f => ({ ...f, tipo_registro: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIPOS_REGISTRO.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {form.tipo_registro === 'Visita Domiciliar' ? (
                  <ProntuarioVisitaDomiciliar 
                    paciente={pacientes.find(p => p.id === form.paciente_id)}
                    profissional={user}
                    unidade={unidades.find(u => u.id === user?.unidadeId)}
                    onSave={handleSave}
                    initialData={editId ? form : null}
                  />
                ) : (
                  <div className="space-y-6">
                    {/* Campos Dinâmicos (Estrutura do Sistema) */}
                    <DynamicProntuarioFields 
                      fields={enabledFields} 
                      values={form} 
                      onChange={handleFieldChange} 
                    />

                    {/* Blocos SOAP se visíveis na config */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {isBlocoVisible('soap_subjetivo') && (
                        <div className="space-y-2">
                          <Label>S — Subjetivo {isBlocoRequired('soap_subjetivo') && "*"}</Label>
                          <DebouncedTextarea 
                            value={form.soap_subjetivo} 
                            onChange={e => handleFieldChange('soap_subjetivo', e.target.value)} 
                            placeholder="Queixas, sintomas relatados pelo paciente..."
                          />
                        </div>
                      )}
                      {isBlocoVisible('soap_objetivo') && (
                        <div className="space-y-2">
                          <Label>O — Objetivo {isBlocoRequired('soap_objetivo') && "*"}</Label>
                          <DebouncedTextarea 
                            value={form.soap_objetivo} 
                            onChange={e => handleFieldChange('soap_objetivo', e.target.value)} 
                            placeholder="Exame físico, sinais vitais, observações clínicas..."
                          />
                        </div>
                      )}
                      {isBlocoVisible('soap_avaliacao') && (
                        <div className="space-y-2">
                          <Label>A — Avaliação {isBlocoRequired('soap_avaliacao') && "*"}</Label>
                          <DebouncedTextarea 
                            value={form.soap_avaliacao} 
                            onChange={e => handleFieldChange('soap_avaliacao', e.target.value)} 
                            placeholder="Diagnóstico, hipóteses, progresso..."
                          />
                        </div>
                      )}
                      {isBlocoVisible('soap_plano') && (
                        <div className="space-y-2">
                          <Label>P — Plano {isBlocoRequired('soap_plano') && "*"}</Label>
                          <DebouncedTextarea 
                            value={form.soap_plano} 
                            onChange={e => handleFieldChange('soap_plano', e.target.value)} 
                            placeholder="Condutas, prescrições, encaminhamentos..."
                          />
                        </div>
                      )}
                    </div>

                    {/* Outros blocos legados/base se visíveis */}
                    {isBlocoVisible('queixa_principal') && (
                      <div className="space-y-2">
                        <Label>Queixa Principal {isBlocoRequired('queixa_principal') && "*"}</Label>
                        <DebouncedTextarea value={form.queixa_principal} onChange={e => handleFieldChange('queixa_principal', e.target.value)} />
                      </div>
                    )}

                    {isBlocoVisible('anamnese') && (
                      <div className="space-y-2">
                        <Label>Anamnese {isBlocoRequired('anamnese') && "*"}</Label>
                        <DebouncedTextarea value={form.anamnese} onChange={e => handleFieldChange('anamnese', e.target.value)} />
                      </div>
                    )}

                    {isBlocoVisible('evolucao') && (
                      <div className="space-y-2">
                        <Label>Evolução {isBlocoRequired('evolucao') && "*"}</Label>
                        <DebouncedTextarea rows={6} value={form.evolucao} onChange={e => handleFieldChange('evolucao', e.target.value)} />
                      </div>
                    )}

                    {/* Histórico Central (se houver paciente selecionado) */}
                    {form.paciente_id && currentPatientHistory.length > 0 && (
                      <div className="mt-8 border-t pt-6">
                        <HistoricoCentralList items={currentPatientHistory} onView={openEdit} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div className="w-80 border-l bg-muted/10 hidden lg:block overflow-y-auto">
              <HistoricoPacientePanel 
                paciente={pacientes.find(p => p.id === form.paciente_id) || null} 
                historico={prontuarios.filter(p => p.paciente_id === form.paciente_id)} 
              />
            </div>
          </div>

          {form.tipo_registro !== 'Visita Domiciliar' && (
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={() => handleSave()} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {editId ? "Atualizar" : "Salvar"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProntuarioPage;

