import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Play, Clock, X, Plus, CheckCircle, Save, Search, History, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { differenceInMinutes } from "date-fns";

const ESPECIALIDADE_LABELS: Record<string, string> = {
  fisioterapia: "FISIOTERAPIA",
  fonoaudiologia: "FONOAUDIOLOGIA",
  nutricao: "NUTRIÇÃO",
  psicologia: "PSICOLOGIA",
  terapia_ocupacional: "TERAPIA OCUPACIONAL",
  outros: "OUTROS",
};

const classificarIMC = (imc: number): string => {
  if (imc < 18.5) return "Abaixo do peso";
  if (imc < 25) return "Normal";
  if (imc < 30) return "Sobrepeso";
  if (imc < 35) return "Obesidade grau I";
  if (imc < 40) return "Obesidade grau II";
  return "Obesidade grau III";
};

interface FilaItem {
  id: string;
  pacienteNome: string;
  pacienteId: string;
  unidadeId: string;
  criadoEm: string;
  especialidadeDestino: string;
  cid: string;
  descricaoClinica: string;
  prioridade: string;
  horaChegada: string;
  agendamento_id?: string;
  tipo_entrada?: string;
  observacoes?: string;
}

interface PacienteInfo {
  especialidade_destino?: string;
  cid?: string;
  justificativa?: string;
  descricao_clinica?: string;
  diagnostico_resumido?: string;
}

interface TriageHistoricoItem {
  id: string;
  paciente_id: string;
  pacientes?: { nome: string; cpf?: string };
  agendamentos?: { data: string; hora: string; profissional_nome?: string };
  peso: number;
  altura: number;
  imc: number;
  pressao_arterial: string;
  temperatura: number;
  frequencia_cardiaca: number;
  saturacao_oxigenio: number;
  glicemia: number;
  dor: number;
  queixa: string;
  classificacao_risco: string;
  alergias: string[];
  medicamentos: string[];
  observacoes: string;
  confirmado_em: string;
  tecnico_id: string;
}

const mapFilaItem = (f: any): FilaItem => ({
  id: f.id,
  pacienteNome: f.paciente_nome,
  pacienteId: f.paciente_id,
  unidadeId: f.unidade_id,
  criadoEm: f.criado_em || "",
  especialidadeDestino: f.especialidade_destino || "",
  cid: f.cid || "",
  descricaoClinica: f.descricao_clinica || "",
  prioridade: f.prioridade || "normal",
  horaChegada: f.hora_chegada || "",
  agendamento_id: f.agendamento_id,
  tipo_entrada: f.tipo_entrada,
  observacoes: f.observacoes,
});

const sortFilaByCreatedAt = (items: FilaItem[]) =>
  [...items].sort((a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime());

const Triagem: React.FC = () => {
  const { user } = useAuth();
  const { logAction, refreshFila } = useData();
  const [fila, setFila] = useState<FilaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FilaItem | null>(null);
  const [pacienteInfo, setPacienteInfo] = useState<PacienteInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(new Date());
  const [buscaInput, setBuscaInput] = useState("");
  const [busca, setBusca] = useState("");
  const [historicoOpen, setHistoricoOpen] = useState(false);
  const [historicoTriagens, setHistoricoTriagens] = useState<TriageHistoricoItem[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<"triagem" | "demanda">("triagem");

  const [form, setForm] = useState({
    peso: "",
    altura: "",
    pressaoArterial: "",
    temperatura: "",
    frequenciaCardiaca: "",
    saturacaoOxigenio: "",
    glicemia: "",
    dor: 0,
    queixaPrincipal: "",
    classificacaoRisco: "",
    alergias: [] as string[],
    medicamentos: [] as string[],
    observacoes: "",
  });
  const [newAlergia, setNewAlergia] = useState("");
  const [newMedicamento, setNewMedicamento] = useState("");
  const [startedAt, setStartedAt] = useState<string>("");

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const imc = useMemo(() => {
    const w = parseFloat(form.peso);
    const h = parseFloat(form.altura) / 100;
    if (!w || !h) return null;
    const value = w / (h * h);
    return { value: value.toFixed(1), label: classificarIMC(value) };
  }, [form.peso, form.altura]);

  const filaFiltrada = useMemo(() => {
    if (!busca.trim()) return fila;
    const termo = busca.trim().toLowerCase();
    return fila.filter((item) =>
      item.pacienteNome.toLowerCase().includes(termo)
    );
  }, [fila, busca]);

  // Separar por tipo de entrada
  const pacientesTriagemNormal = useMemo(() => {
    return filaFiltrada.filter(item => item.tipo_entrada !== "demanda_reprimida");
  }, [filaFiltrada]);

  const pacientesDemandaReprimida = useMemo(() => {
    return filaFiltrada.filter(item => item.tipo_entrada === "demanda_reprimida");
  }, [filaFiltrada]);

  // Ordenar: mais antigo primeiro (prioridade para quem espera mais)
  const pacientesTriagemNormalOrdenados = useMemo(() => {
    return sortFilaByCreatedAt(pacientesTriagemNormal);
  }, [pacientesTriagemNormal]);

  const pacientesDemandaReprimidaOrdenados = useMemo(() => {
    return sortFilaByCreatedAt(pacientesDemandaReprimida);
  }, [pacientesDemandaReprimida]);

  const listaExibir = abaAtiva === "triagem" 
    ? pacientesTriagemNormalOrdenados 
    : pacientesDemandaReprimidaOrdenados;

  // CORREÇÃO: Carregar apenas pacientes com status aguardando_triagem
  const loadFila = useCallback(async () => {
    if (!user?.unidadeId) return;
    setLoading(true);
    try {
      const hoje = new Date().toISOString().split("T")[0];
      
      const { data, error } = await supabase
        .from("fila_espera")
        .select(`
          *,
          agendamentos!left (
            id,
            status,
            data,
            hora,
            profissional_nome,
            paciente_id
          )
        `)
        .eq("unidade_id", user.unidadeId)
        .eq("status", "aguardando_triagem")
        .order("criado_em", { ascending: true });

      if (data && !error) {
        // Filtrar: para demanda normal, precisa ter agendamento confirmado hoje
        // Para demanda reprimida, pode não ter agendamento
        const filteredData = data.filter(item => {
          // Demanda reprimida - sempre mostra
          if (item.tipo_entrada === "demanda_reprimida") {
            return true;
          }
          // Demanda normal - precisa ter agendamento confirmado hoje
          if (!item.agendamento_id) return false;
          const agendamento = item.agendamentos;
          if (!agendamento) return false;
          return agendamento.data === hoje && 
                 ["confirmado_chegada", "aguardando_triagem"].includes(agendamento.status);
        });
        
        setFila(sortFilaByCreatedAt(filteredData.map(mapFilaItem)));
      } else if (error) {
        console.error("Erro ao carregar fila:", error);
        toast.error("Erro ao carregar lista de triagem");
      }
    } catch (err) {
      console.error("Error loading triage queue:", err);
      toast.error("Erro ao carregar lista de triagem");
    }
    setLoading(false);
  }, [user?.unidadeId]);

  useEffect(() => {
    loadFila();
  }, [loadFila]);

  useRealtimeSync({
    table: "fila_espera",
    filter: user?.unidadeId ? `unidade_id=eq.${user.unidadeId}` : undefined,
    enabled: Boolean(user?.unidadeId),
    onEvent: (payload) => {
      if (payload.eventType === "DELETE") {
        const deletedId = String((payload.old as any)?.id || "");
        if (!deletedId) return;
        setFila((prev) => prev.filter((item) => item.id !== deletedId));
        return;
      }

      const row = payload.new as any;
      if (!row?.id) return;

      const shouldRender = row.status === "aguardando_triagem";
      setFila((prev) => {
        const withoutCurrent = prev.filter((item) => item.id !== row.id);
        if (!shouldRender) return withoutCurrent;
        return sortFilaByCreatedAt([...withoutCurrent, mapFilaItem(row)]);
      });
    },
    poll: loadFila,
    pollIntervalMs: 30000,
  });

  const loadHistoricoTriagens = useCallback(async () => {
    if (!user?.id) return;
    setLoadingHistorico(true);
    try {
      const { data, error } = await supabase
        .from("triage_records")
        .select(`
          *,
          pacientes!inner (
            nome,
            cpf
          ),
          agendamentos (
            data,
            hora,
            profissional_nome
          )
        `)
        .eq("tecnico_id", user.id)
        .order("confirmado_em", { ascending: false })
        .limit(50);

      if (data && !error) {
        setHistoricoTriagens(data as TriageHistoricoItem[]);
      }
    } catch (err) {
      console.error("Erro ao carregar histórico:", err);
      toast.error("Erro ao carregar histórico");
    }
    setLoadingHistorico(false);
  }, [user?.id]);

  const openTriagem = async (item: FilaItem) => {
    setSelectedItem(item);
    setStartedAt(new Date().toISOString());

    const { data: pacData } = await supabase
      .from("pacientes")
      .select("especialidade_destino, cid, justificativa, descricao_clinica, diagnostico_resumido")
      .eq("id", item.pacienteId)
      .maybeSingle();
    setPacienteInfo(pacData || null);

    const { data } = await supabase
      .from("triage_records")
      .select("*")
      .eq("agendamento_id", item.id)
      .maybeSingle();

    if (data) {
      const triageData = data as any;
      setForm({
        peso: triageData.peso?.toString() || "",
        altura: triageData.altura?.toString() || "",
        pressaoArterial: triageData.pressao_arterial || "",
        temperatura: triageData.temperatura?.toString() || "",
        frequenciaCardiaca: triageData.frequencia_cardiaca?.toString() || "",
        saturacaoOxigenio: triageData.saturacao_oxigenio?.toString() || "",
        glicemia: triageData.glicemia?.toString() || "",
        dor: triageData.dor || 0,
        queixaPrincipal: triageData.queixa || "",
        classificacaoRisco: triageData.classificacao_risco || "",
        alergias: triageData.alergias || [],
        medicamentos: triageData.medicamentos || [],
        observacoes: triageData.observacoes || "",
      });
      setStartedAt(triageData.iniciado_em || new Date().toISOString());
    } else {
      setForm({
        peso: "",
        altura: "",
        pressaoArterial: "",
        temperatura: "",
        frequenciaCardiaca: "",
        saturacaoOxigenio: "",
        glicemia: "",
        dor: 0,
        queixaPrincipal: "",
        classificacaoRisco: "",
        alergias: [],
        medicamentos: [],
        observacoes: "",
      });
    }
    setDialogOpen(true);
  };

  const buildRecord = () => ({
    agendamento_id: selectedItem!.id,
    tecnico_id: user?.id || "",
    peso: parseFloat(form.peso) || null,
    altura: parseFloat(form.altura) || null,
    imc: imc ? parseFloat(imc.value) : null,
    pressao_arterial: form.pressaoArterial || null,
    temperatura: parseFloat(form.temperatura) || null,
    frequencia_cardiaca: parseInt(form.frequenciaCardiaca) || null,
    saturacao_oxigenio: parseInt(form.saturacaoOxigenio) || null,
    glicemia: parseFloat(form.glicemia) || null,
    dor: form.dor,
    alergias: form.alergias,
    medicamentos: form.medicamentos,
    queixa: form.queixaPrincipal || null,
    classificacao_risco: form.classificacaoRisco,
    observacoes: form.observacoes,
    iniciado_em: startedAt,
  });

  const salvarRascunho = async () => {
    if (!selectedItem) return;
    setSaving(true);
    try {
      await supabase
        .from("triage_records")
        .upsert(buildRecord(), { onConflict: "agendamento_id" });
      toast.success("Rascunho salvo!");
    } catch (err) {
      console.error("Erro ao salvar rascunho:", err);
      toast.error("Erro ao salvar rascunho.");
    }
    setSaving(false);
  };

  const validateTriagemFields = (): string[] => {
    const missing: string[] = [];
    if (!form.pressaoArterial.trim()) missing.push("Pressão Arterial");
    if (!form.frequenciaCardiaca.trim()) missing.push("Frequência Cardíaca");
    if (!form.temperatura.trim()) missing.push("Temperatura");
    if (!form.saturacaoOxigenio.trim()) missing.push("Saturação O₂");
    if (!form.peso.trim()) missing.push("Peso");
    if (!form.altura.trim()) missing.push("Altura");
    if (!form.classificacaoRisco) missing.push("Classificação de Risco");
    if (!form.queixaPrincipal.trim()) missing.push("Queixa Principal");
    if (!form.observacoes.trim()) missing.push("Observações");
    return missing;
  };

  const confirmarTriagem = async (encaminharEnfermagem: boolean) => {
    if (!selectedItem) return;

    const missing = validateTriagemFields();
    if (missing.length > 0) {
      toast.error(`Campos obrigatórios: ${missing.join(", ")}`);
      return;
    }

    setSaving(true);
    try {
      const record = { ...buildRecord(), confirmado_em: new Date().toISOString() };
      await supabase
        .from("triage_records")
        .upsert(record, { onConflict: "agendamento_id" });

      const nextStatus = encaminharEnfermagem ? "aguardando_enfermagem" : "aguardando_atendimento";

      await supabase
        .from("fila_espera")
        .update({ status: nextStatus })
        .eq("id", selectedItem.id);

      if (selectedItem.agendamento_id) {
        await supabase
          .from("agendamentos")
          .update({ status: nextStatus })
          .eq("id", selectedItem.agendamento_id);
      }

      // Se for demanda reprimida e não encaminhou para enfermagem, registrar
      if (selectedItem.tipo_entrada === "demanda_reprimida" && !encaminharEnfermagem) {
        await supabase.from("nursing_evaluations").insert({
          patient_id: selectedItem.pacienteId,
          agendamento_id: selectedItem.id,
          professional_id: user?.id || "",
          unit_id: user?.unidadeId || "",
          anamnese_resumida: "PACIENTE DEMANDA REPRIMIDA - Triagem concluída",
          condicao_clinica: "",
          avaliacao_risco: form.classificacaoRisco,
          prioridade: form.classificacaoRisco === "alto" ? "alta" : form.classificacaoRisco === "medio" ? "media" : "baixa",
          observacoes_clinicas: `Triagem de demanda reprimida. Queixa: ${form.queixaPrincipal}`,
          resultado: "apto",
          motivo_inapto: "",
        });
      }

      await logAction({
        acao: "triagem_realizada",
        entidade: "triagem",
        entidadeId: selectedItem.id,
        modulo: "triagem",
        user,
        detalhes: {
          paciente_nome: selectedItem.pacienteNome,
          tipo_entrada: selectedItem.tipo_entrada || "normal",
          peso: form.peso,
          altura: form.altura,
          imc: imc?.value,
          classificacao_risco: form.classificacaoRisco,
          dor: form.dor,
          encaminhado_enfermagem: encaminharEnfermagem,
          status_final: nextStatus,
        },
      });

      toast.success(
        encaminharEnfermagem
          ? "Triagem confirmada! Paciente encaminhado para enfermagem."
          : "Triagem confirmada! Paciente aguardando atendimento na agenda do profissional.",
      );
      setDialogOpen(false);
      await loadFila();
      await refreshFila();
    } catch (err) {
      console.error("Erro ao confirmar triagem:", err);
      toast.error("Erro ao confirmar triagem.");
    }
    setSaving(false);
  };

  const addAlergia = () => {
    if (newAlergia.trim()) {
      setForm((p) => ({ ...p, alergias: [...p.alergias, newAlergia.trim()] }));
      setNewAlergia("");
    }
  };

  const addMedicamento = () => {
    if (newMedicamento.trim()) {
      setForm((p) => ({ ...p, medicamentos: [...p.medicamentos, newMedicamento.trim()] }));
      setNewMedicamento("");
    }
  };

  const espLabel =
    pacienteInfo?.especialidade_destino || selectedItem?.especialidadeDestino
      ? ESPECIALIDADE_LABELS[
          pacienteInfo?.especialidade_destino || selectedItem?.especialidadeDestino || ""
        ] ||
        (
          pacienteInfo?.especialidade_destino ||
          selectedItem?.especialidadeDestino ||
          ""
        ).toUpperCase()
      : null;

  const renderPacienteCard = (item: FilaItem) => {
    const waitMinutes = item.criadoEm
      ? differenceInMinutes(now, new Date(item.criadoEm))
      : 0;
    const waitLabel =
      waitMinutes >= 60
        ? `${Math.floor(waitMinutes / 60)}h${waitMinutes % 60}min`
        : `${waitMinutes}min`;
    const espBadge = item.especialidadeDestino
      ? ESPECIALIDADE_LABELS[item.especialidadeDestino] ||
        item.especialidadeDestino.toUpperCase()
      : null;
    const isDemandaReprimida = item.tipo_entrada === "demanda_reprimida";

    return (
      <Card key={item.id} className="shadow-card border-0">
        <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <span className="text-lg font-mono font-bold text-primary w-16 shrink-0">
            {item.horaChegada}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground">{item.pacienteNome}</p>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {isDemandaReprimida && (
                <Badge variant="destructive" className="text-[10px] animate-pulse">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  DEMANDA REPRIMIDA
                </Badge>
              )}
              {espBadge && (
                <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                  {espBadge}
                </Badge>
              )}
              {item.cid && (
                <Badge variant="outline" className="text-[10px]">
                  CID: {item.cid}
                </Badge>
              )}
            </div>
            {isDemandaReprimida && item.criadoEm && (
              <p className="text-xs text-muted-foreground mt-1">
                📅 Data de cadastro: {new Date(item.criadoEm).toLocaleDateString("pt-BR")}
              </p>
            )}
            {item.observacoes && (
              <p className="text-xs text-muted-foreground mt-1 truncate">
                💬 {item.observacoes}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              <Clock className="w-3 h-3 mr-1" /> {waitLabel}
            </Badge>
            <Button
              size="sm"
              className={isDemandaReprimida ? "bg-orange-600 hover:bg-orange-700" : "gradient-primary"}
              onClick={() => openTriagem(item)}
            >
              <Play className="w-3.5 h-3.5 mr-1" /> Iniciar triagem
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">
            Triagem de Enfermagem
          </h1>
          <p className="text-muted-foreground text-sm">
            {pacientesTriagemNormal.length + pacientesDemandaReprimida.length} paciente(s) aguardando triagem
          </p>
        </div>
        
        <Button 
          variant="outline" 
          onClick={() => {
            loadHistoricoTriagens();
            setHistoricoOpen(true);
          }}
        >
          <History className="w-4 h-4 mr-2" />
          Histórico
        </Button>
      </div>

      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9"
            placeholder="Buscar paciente por nome..."
            value={buscaInput}
            onChange={(e) => setBuscaInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setBusca(buscaInput.trim());
            }}
          />
        </div>
        <Button variant="outline" onClick={() => setBusca(buscaInput.trim())}>
          <Search className="w-4 h-4" />
        </Button>
      </div>

      <Tabs value={abaAtiva} onValueChange={(v) => setAbaAtiva(v as "triagem" | "demanda")} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="triagem" className="flex gap-2">
            Triagem Normal
            <Badge variant="secondary" className="ml-1">
              {pacientesTriagemNormal.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="demanda" className="flex gap-2">
            <AlertTriangle className="w-4 h-4" />
            Demanda Reprimida
            <Badge variant="destructive" className="ml-1">
              {pacientesDemandaReprimida.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="triagem" className="mt-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : listaExibir.length === 0 ? (
            <Card className="shadow-card border-0">
              <CardContent className="p-8 text-center text-muted-foreground">
                {busca.trim()
                  ? `Nenhum paciente encontrado para "${busca}".`
                  : "Nenhum paciente com chegada confirmada aguardando triagem hoje."}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {listaExibir.map(renderPacienteCard)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="demanda" className="mt-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : listaExibir.length === 0 ? (
            <Card className="shadow-card border-0">
              <CardContent className="p-8 text-center text-muted-foreground">
                {busca.trim()
                  ? `Nenhum paciente encontrado para "${busca}".`
                  : "Nenhum paciente de demanda reprimida aguardando triagem."}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {listaExibir.map(renderPacienteCard)}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog de Triagem */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              Triagem — {selectedItem?.pacienteNome}
              {selectedItem?.tipo_entrada === "demanda_reprimida" && (
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  DEMANDA REPRIMIDA
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {(pacienteInfo || selectedItem) && (
            <div className="space-y-2">
              {espLabel && (
                <div className="p-3 rounded-lg border-2 border-primary/30 bg-primary/5">
                  <p className="text-xs text-muted-foreground">Especialidade Destino</p>
                  <p className="text-lg font-bold text-primary">{espLabel}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-xs bg-muted/50 rounded-lg p-3 border">
                {(pacienteInfo?.cid || selectedItem?.cid) && (
                  <span>
                    CID: <strong>{pacienteInfo?.cid || selectedItem?.cid}</strong>
                  </span>
                )}
                {pacienteInfo?.diagnostico_resumido && (
                  <span>
                    Diagnóstico: <strong>{pacienteInfo.diagnostico_resumido}</strong>
                  </span>
                )}
              </div>
              {pacienteInfo?.justificativa && (
                <p className="text-xs">
                  <strong>Justificativa:</strong> {pacienteInfo.justificativa}
                </p>
              )}
              {selectedItem?.observacoes && (
                <p className="text-xs bg-muted/30 p-2 rounded">
                  <strong>Observações da fila:</strong> {selectedItem.observacoes}
                </p>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <Label>Peso (kg) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.peso}
                  onChange={(e) => setForm((p) => ({ ...p, peso: e.target.value }))}
                  placeholder="70.5"
                />
              </div>
              <div>
                <Label>Altura (cm) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.altura}
                  onChange={(e) => setForm((p) => ({ ...p, altura: e.target.value }))}
                  placeholder="170"
                />
              </div>
              <div>
                <Label>IMC</Label>
                <div className="mt-1 p-2 bg-muted rounded-lg text-sm">
                  {imc ? (
                    <span className="font-semibold">
                      {imc.value} —{" "}
                      <span className="text-muted-foreground">{imc.label}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Informe peso e altura</span>
                  )}
                </div>
              </div>
              <div>
                <Label>Pressão Arterial *</Label>
                <Input
                  value={form.pressaoArterial}
                  onChange={(e) => setForm((p) => ({ ...p, pressaoArterial: e.target.value }))}
                  placeholder="120/80"
                />
              </div>
              <div>
                <Label>Temperatura (°C) *</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.temperatura}
                  onChange={(e) => setForm((p) => ({ ...p, temperatura: e.target.value }))}
                  placeholder="36.5"
                />
              </div>
              <div>
                <Label>FC (bpm) *</Label>
                <Input
                  type="number"
                  value={form.frequenciaCardiaca}
                  onChange={(e) => setForm((p) => ({ ...p, frequenciaCardiaca: e.target.value }))}
                  placeholder="72"
                />
              </div>
              <div>
                <Label>SatO₂ (%) *</Label>
                <Input
                  type="number"
                  value={form.saturacaoOxigenio}
                  onChange={(e) => setForm((p) => ({ ...p, saturacaoOxigenio: e.target.value }))}
                  placeholder="98"
                />
              </div>
              <div>
                <Label>Glicemia (mg/dL)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.glicemia}
                  onChange={(e) => setForm((p) => ({ ...p, glicemia: e.target.value }))}
                  placeholder="Opcional"
                />
              </div>
            </div>

            <div>
              <Label className="text-base font-semibold">
                Escala de Dor (0–10): {form.dor}
              </Label>
              <Slider
                value={[form.dor]}
                onValueChange={(v) => setForm((p) => ({ ...p, dor: v[0] }))}
                max={10}
                min={0}
                step={1}
                className="mt-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Sem dor</span>
                <span>Dor máxima</span>
              </div>
            </div>

            <div>
              <Label className="text-base font-semibold">Classificação de Risco *</Label>
              <Select
                value={form.classificacaoRisco}
                onValueChange={(v) => setForm((p) => ({ ...p, classificacaoRisco: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecionar classificação..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixo">🟢 BAIXO</SelectItem>
                  <SelectItem value="medio">🟡 MÉDIO</SelectItem>
                  <SelectItem value="alto">🔴 ALTO</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Queixa Principal *</Label>
              <Textarea
                rows={2}
                value={form.queixaPrincipal}
                onChange={(e) => setForm((p) => ({ ...p, queixaPrincipal: e.target.value }))}
                placeholder="Queixa principal do paciente..."
              />
            </div>

            <div>
              <Label>Alergias</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={newAlergia}
                  onChange={(e) => setNewAlergia(e.target.value)}
                  placeholder="Digitar alergia"
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAlergia())}
                />
                <Button type="button" variant="outline" size="icon" onClick={addAlergia}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {form.alergias.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {form.alergias.map((a, i) => (
                    <Badge key={i} variant="destructive" className="text-xs">
                      {a}{" "}
                      <button
                        className="ml-1"
                        onClick={() =>
                          setForm((p) => ({
                            ...p,
                            alergias: p.alergias.filter((_, j) => j !== i),
                          }))
                        }
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label>Medicamentos em uso</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={newMedicamento}
                  onChange={(e) => setNewMedicamento(e.target.value)}
                  placeholder="Digitar medicamento"
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMedicamento())}
                />
                <Button type="button" variant="outline" size="icon" onClick={addMedicamento}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {form.medicamentos.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {form.medicamentos.map((m, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {m}{" "}
                      <button
                        className="ml-1"
                        onClick={() =>
                          setForm((p) => ({
                            ...p,
                            medicamentos: p.medicamentos.filter((_, j) => j !== i),
                          }))
                        }
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label>Observações *</Label>
              <Textarea
                rows={3}
                value={form.observacoes}
                onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))}
                placeholder="Observações relevantes da triagem..."
              />
            </div>

            <div className="flex flex-col gap-2">
              <Button variant="outline" className="w-full" onClick={salvarRascunho} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                <Save className="w-4 h-4 mr-2" /> Salvar Rascunho
              </Button>
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-success hover:bg-success/90 text-success-foreground"
                  onClick={() => confirmarTriagem(true)}
                  disabled={saving}
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  <CheckCircle className="w-4 h-4 mr-2" /> Encaminhar Enfermagem
                </Button>
                <Button
                  className="flex-1"
                  variant="secondary"
                  onClick={() => confirmarTriagem(false)}
                  disabled={saving}
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  <CheckCircle className="w-4 h-4 mr-2" /> Seguir para Atendimento
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Histórico */}
      <Dialog open={historicoOpen} onOpenChange={setHistoricoOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Histórico de Triagens Realizadas</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Últimas 50 triagens realizadas por você
            </p>
          </DialogHeader>
          {loadingHistorico ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : historicoTriagens.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma triagem realizada ainda.
            </p>
          ) : (
            <div className="space-y-3">
              {historicoTriagens.map((triage) => (
                <Card key={triage.id} className="border-0 shadow-card">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-foreground">
                          {triage.pacientes?.nome || "Paciente"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {triage.agendamentos?.data && (
                            <>📅 {new Date(triage.agendamentos.data).toLocaleDateString("pt-BR")} </>
                          )}
                          {triage.agendamentos?.hora && <>🕐 {triage.agendamentos.hora}</>}
                          {triage.agendamentos?.profissional_nome && (
                            <> • 👨‍⚕️ {triage.agendamentos.profissional_nome}</>
                          )}
                        </p>
                      </div>
                      <Badge 
                        variant={
                          triage.classificacao_risco === "alto" 
                            ? "destructive" 
                            : triage.classificacao_risco === "medio" 
                              ? "default" 
                              : "outline"
                        }
                      >
                        {triage.classificacao_risco?.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                      <div>
                        <span className="text-muted-foreground text-xs">Sinais:</span>
                        <p className="text-xs">
                          {triage.peso}kg / {triage.altura}cm • 
                          PA: {triage.pressao_arterial} • 
                          FC: {triage.frequencia_cardiaca} • 
                          SatO₂: {triage.saturacao_oxigenio}%
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Dor:</span>
                        <p className="text-xs">{triage.dor}/10</p>
                      </div>
                    </div>
                    {triage.queixa && (
                      <div className="mt-2">
                        <span className="text-muted-foreground text-xs">Queixa:</span>
                        <p className="text-sm">{triage.queixa}</p>
                      </div>
                    )}
                    {triage.observacoes && (
                      <div className="mt-1">
                        <span className="text-muted-foreground text-xs">Observações:</span>
                        <p className="text-xs text-muted-foreground">{triage.observacoes}</p>
                      </div>
                    )}
                    {triage.alergias && triage.alergias.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {triage.alergias.map((alergia, idx) => (
                          <Badge key={idx} variant="destructive" className="text-xs">
                            ⚠️ {alergia}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      Realizado em: {new Date(triage.confirmado_em).toLocaleString("pt-BR")}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Triagem;
