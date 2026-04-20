import React, { useState, useCallback, useMemo, useEffect } from "react";
import { usePacienteNomeResolver } from "@/hooks/usePacienteNomeResolver";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Search, Loader2, Play, CheckCircle, Save, X, Plus, Clock, Trash2, FastForward } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MANCHESTER_LEVELS, type ManchesterLevel } from "@/lib/manchesterProtocol";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { differenceInMinutes } from "date-fns";
import CustomFieldsRenderer from "@/components/CustomFieldsRenderer";
import { useCustomFields } from "@/hooks/useCustomFields";

interface Agendamento {
  id: string;
  filaId: string;
  filaStatus: string;
  filaCriadoEm?: string;
  pacienteId: string;
  pacienteNome: string;
  unidadeId: string;
  profissionalId: string;
  profissionalNome: string;
  data: string;
  hora: string;
  status: string;
  tipo: string;
  cid?: string;
  descricaoClinica?: string;
  observacoes?: string;
}

interface Paciente {
  id: string;
  nome: string;
  cid?: string;
  descricaoClinica?: string;
  diagnostico_resumido?: string;
  justificativa?: string;
}

interface TriagemForm {
  peso: string;
  altura: string;
  pressaoArterial: string;
  temperatura: string;
  frequenciaCardiaca: string;
  saturacaoOxigenio: string;
  glicemia: string;
  dor: number;
  classificacaoRisco: string;
  queixaPrincipal: string;
  historicoQueixa: string;
  alergias: string[];
  medicamentos: string[];
  comorbidades: string[];
  observacoes: string;
}

const COMORBIDADES_COMUNS = [
  "Hipertensão",
  "Diabetes",
  "Cardiopatia",
  "Asma",
  "DPOC",
  "Obesidade",
  "Dislipidemia",
  "Hipotireoidismo",
  "Hipertireoidismo",
  "Insuficiência Renal",
  "Hepatopatia",
  "Câncer",
  "Depressão",
  "Ansiedade",
  "AVC prévio",
  "IAM prévio",
];

const ESPECIALIDADE_LABELS: Record<string, string> = {
  // ... suas labels de especialidade
};

const STATUS_TRIAGEM_FILA = ["chegada_confirmada", "aguardando_triagem"];
const STATUS_AGENDAMENTO_TRIAGEM = [
  "confirmado_chegada",
  "aguardando_triagem",
  "aguardando_atendimento",
  "apto_atendimento",
  "aguardando_enfermagem",
];

const Triagem: React.FC = () => {
  const { agendamentos, fila, pacientes, updateAgendamento, updateFila, logAction, refreshAgendamentos, refreshFila } = useData();
  const { user } = useAuth();
  const resolvePaciente = usePacienteNomeResolver();
  const { resolved: customConfig } = useCustomFields('triagem', user?.unidadeId);
  const [customData, setCustomData] = useState<Record<string, any>>({});

  const [buscaInput, setBuscaInput] = useState("");
  const [busca, setBusca] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Agendamento | null>(null);
  const [pacienteInfo, setPacienteInfo] = useState<Paciente | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: 'remove' | 'release'; item: Agendamento } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const handleRemoverDaTriagem = async (item: Agendamento) => {
    setActionLoading(true);
    try {
      // 🛡️ VERIFICAÇÃO DE SEGURANÇA SERVER-SIDE: ler status atual direto do banco
      const { data: filaAtual, error: readErr } = await supabase
        .from('fila_espera')
        .select('id, status')
        .eq('id', item.filaId)
        .maybeSingle();

      if (readErr) throw readErr;

      if (!filaAtual) {
        toast.error('Registro não encontrado na fila.');
        setConfirmAction(null);
        await Promise.all([refreshFila(), refreshAgendamentos()]);
        return;
      }

      // Aceita apenas status da fila de triagem (chegada confirmada ou aguardando triagem)
      const STATUS_PERMITIDOS = ['aguardando_triagem', 'chegada_confirmada'];
      if (!STATUS_PERMITIDOS.includes(filaAtual.status)) {
        toast.error(
          `Não é possível excluir: o paciente está com status "${filaAtual.status}" e não está mais na fila de triagem.`
        );
        setConfirmAction(null);
        await Promise.all([refreshFila(), refreshAgendamentos()]);
        return;
      }

      const statusAnterior = filaAtual.status;

      // ✅ ÚNICA alteração permitida: status da fila → 'excluido_da_fila_triagem'
      // NÃO altera agendamento, paciente, prontuário, profissional ou qualquer outra entidade
      const { error: updErr } = await supabase
        .from('fila_espera')
        .update({ status: 'excluido_da_fila_triagem' })
        .eq('id', item.filaId)
        .in('status', STATUS_PERMITIDOS); // dupla proteção: WHERE garante atomicidade

      if (updErr) throw updErr;

      await refreshFila();
      await logAction({
        acao: 'remover_da_triagem',
        entidade: 'fila_espera',
        entidadeId: item.filaId,
        modulo: 'triagem',
        user,
        detalhes: { paciente: item.pacienteNome, statusAnterior, statusNovo: 'excluido_da_fila_triagem' },
      });
      toast.success('Paciente removido da fila de triagem.');
      setConfirmAction(null);
    } catch (err) {
      console.error('Erro ao remover da triagem:', err);
      toast.error('Erro ao remover paciente da triagem.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLiberarSemTriagem = async (item: Agendamento) => {
    setActionLoading(true);
    try {
      await Promise.all([
        updateFila(item.filaId, { status: 'apto_atendimento' as any }),
        updateAgendamento(item.id, { status: 'apto_atendimento' as any }),
      ]);
      await Promise.all([refreshFila(), refreshAgendamentos()]);
      await logAction({
        acao: 'liberar_sem_triagem',
        entidade: 'agendamento',
        entidadeId: item.id,
        modulo: 'triagem',
        user,
        detalhes: { paciente: item.pacienteNome, profissional: item.profissionalNome },
      });
      toast.success('Paciente liberado para atendimento sem triagem.');
      setConfirmAction(null);
    } catch (err) {
      console.error('Erro ao liberar sem triagem:', err);
      toast.error('Erro ao liberar paciente sem triagem.');
    } finally {
      setActionLoading(false);
    }
  };

  const [form, setForm] = useState<TriagemForm>({
    peso: "",
    altura: "",
    pressaoArterial: "",
    temperatura: "",
    frequenciaCardiaca: "",
    saturacaoOxigenio: "",
    glicemia: "",
    dor: 0,
    classificacaoRisco: "",
    queixaPrincipal: "",
    alergias: [],
    medicamentos: [],
    observacoes: "",
  });
  const [newAlergia, setNewAlergia] = useState("");
  const [newMedicamento, setNewMedicamento] = useState("");

  const now = useMemo(() => new Date(), []);

  // Load per-professional triage disabled list
  const [profTriageDisabled, setProfTriageDisabled] = useState<Set<string>>(new Set());
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('triage_settings')
          .select('profissional_id, enabled')
          .not('profissional_id', 'is', null);
        if (data) {
          const disabled = new Set(data.filter(d => d.enabled === false).map(d => d.profissional_id!));
          setProfTriageDisabled(disabled);
        }
      } catch {}
    })();
  }, []);

  const filaFiltrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return fila
      .filter((item) => (user?.usuario === 'admin.sms' || item.unidadeId === user?.unidadeId) && STATUS_TRIAGEM_FILA.includes(item.status))
      .map((item) => {
        const agendamentoRelacionado =
          agendamentos.find((ag) => ag.id === item.id);

        if (!agendamentoRelacionado) return null;

        // Exclude patients whose professional has triage disabled
        if (profTriageDisabled.has(agendamentoRelacionado.profissionalId)) return null;

        return {
          ...agendamentoRelacionado,
          filaId: item.id,
          filaStatus: item.status,
          filaCriadoEm: item.criadoEm,
        } as Agendamento;
      })
      .filter((item): item is Agendamento => Boolean(item))
      .filter((item) => !termo || item.pacienteNome.toLowerCase().includes(termo))
      .sort((a, b) => a.hora.localeCompare(b.hora));
  }, [agendamentos, fila, user?.unidadeId, busca, profTriageDisabled]);

  const imc = useMemo(() => {
    const peso = parseFloat(form.peso);
    const altura = parseFloat(form.altura) / 100;
    if (isNaN(peso) || isNaN(altura) || altura === 0) return null;
    const value = peso / (altura * altura);
    let label = "";
    if (value < 18.5) label = "Abaixo do peso";
    else if (value < 24.9) label = "Peso normal";
    else if (value < 29.9) label = "Sobrepeso";
    else if (value < 34.9) label = "Obesidade Grau I";
    else if (value < 39.9) label = "Obesidade Grau II";
    else label = "Obesidade Grau III";
    return { value: value.toFixed(2), label };
  }, [form.peso, form.altura]);

  const openTriagem = useCallback(
    async (ag: Agendamento) => {
      let itemSelecionado = ag;

      if (ag.filaStatus === "chegada_confirmada") {
        try {
          await Promise.all([
            updateFila(ag.filaId, { status: "aguardando_triagem" as any }),
            updateAgendamento(ag.id, { status: "aguardando_triagem" as any }),
          ]);
          await Promise.all([refreshFila(), refreshAgendamentos()]);
          itemSelecionado = { ...ag, filaStatus: "aguardando_triagem", status: "aguardando_triagem" };
        } catch (error) {
          console.error("Erro ao iniciar triagem:", error);
          toast.error("Erro ao iniciar triagem.");
          return;
        }
      }

      setSelectedItem(itemSelecionado);
      setDialogOpen(true);

      const pac = pacientes.find((p) => p.id === itemSelecionado.pacienteId);
      setPacienteInfo(pac || null);
      setForm({
        peso: "",
        altura: "",
        pressaoArterial: "",
        temperatura: "",
        frequenciaCardiaca: "",
        saturacaoOxigenio: "",
        glicemia: "",
        dor: 0,
        classificacaoRisco: "",
        queixaPrincipal: pac?.descricaoClinica || itemSelecionado.observacoes || "",
        alergias: [],
        medicamentos: [],
        observacoes: "",
      });
      setCustomData({});
      setNewAlergia("");
      setNewMedicamento("");
    },
    [pacientes, refreshAgendamentos, refreshFila, updateAgendamento, updateFila],
  );

  const addAlergia = () => {
    if (newAlergia.trim() && !form.alergias.includes(newAlergia.trim())) {
      setForm((p) => ({ ...p, alergias: [...p.alergias, newAlergia.trim()] }));
      setNewAlergia("");
    }
  };

  const addMedicamento = () => {
    if (newMedicamento.trim() && !form.medicamentos.includes(newMedicamento.trim())) {
      setForm((p) => ({ ...p, medicamentos: [...p.medicamentos, newMedicamento.trim()] }));
      setNewMedicamento("");
    }
  };

  const salvarRascunho = async () => {
    if (!selectedItem) return;
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("triage_records")
        .select("id")
        .eq("agendamento_id", selectedItem.id)
        .maybeSingle();

      const triagePayload: any = {
        agendamento_id: selectedItem.id,
        tecnico_id: user?.id || "",
        peso: form.peso ? parseFloat(form.peso) : null,
        altura: form.altura ? parseFloat(form.altura) : null,
        pressao_arterial: form.pressaoArterial || null,
        temperatura: form.temperatura ? parseFloat(form.temperatura) : null,
        frequencia_cardiaca: form.frequenciaCardiaca ? parseInt(form.frequenciaCardiaca) : null,
        saturacao_oxigenio: form.saturacaoOxigenio ? parseInt(form.saturacaoOxigenio) : null,
        glicemia: form.glicemia ? parseFloat(form.glicemia) : null,
        imc: form.peso && form.altura ? parseFloat((parseFloat(form.peso) / Math.pow(parseFloat(form.altura) / 100, 2)).toFixed(1)) : null,
        alergias: form.alergias,
        medicamentos: form.medicamentos,
        queixa: form.queixaPrincipal || null,
        classificacao_risco: form.classificacaoRisco || '',
        observacoes: form.observacoes || '',
        custom_data: customData,
        iniciado_em: new Date().toISOString(),
      };

      if (existing?.id) {
        await supabase.from("triage_records").update(triagePayload).eq("id", existing.id);
      } else {
        await supabase.from("triage_records").insert(triagePayload);
      }
      toast.success("Rascunho da triagem salvo!");
    } catch (error) {
      console.error("Erro ao salvar rascunho:", error);
      toast.error("Erro ao salvar rascunho da triagem.");
    } finally {
      setSaving(false);
    }
  };

  const confirmarTriagem = async (encaminharEnfermagem: boolean) => {
    if (!selectedItem) return;
    setSaving(true);

    if (!form.classificacaoRisco) {
      toast.error("Por favor, selecione a Classificação de Risco.");
      setSaving(false);
      return;
    }

    try {
      const novoStatus = encaminharEnfermagem ? "aguardando_enfermagem" : "apto_atendimento";

      const { data: existing } = await supabase
        .from("triage_records")
        .select("id")
        .eq("agendamento_id", selectedItem.id)
        .maybeSingle();

      const triagePayload: any = {
        agendamento_id: selectedItem.id,
        tecnico_id: user?.id || "",
        peso: form.peso ? parseFloat(form.peso) : null,
        altura: form.altura ? parseFloat(form.altura) : null,
        pressao_arterial: form.pressaoArterial || null,
        temperatura: form.temperatura ? parseFloat(form.temperatura) : null,
        frequencia_cardiaca: form.frequenciaCardiaca ? parseInt(form.frequenciaCardiaca) : null,
        saturacao_oxigenio: form.saturacaoOxigenio ? parseInt(form.saturacaoOxigenio) : null,
        glicemia: form.glicemia ? parseFloat(form.glicemia) : null,
        imc: form.peso && form.altura ? parseFloat((parseFloat(form.peso) / Math.pow(parseFloat(form.altura) / 100, 2)).toFixed(1)) : null,
        alergias: form.alergias,
        medicamentos: form.medicamentos,
        queixa: form.queixaPrincipal || null,
        classificacao_risco: form.classificacaoRisco || '',
        observacoes: form.observacoes || '',
        custom_data: customData,
        confirmado_em: new Date().toISOString(),
      };

      if (existing?.id) {
        await supabase.from("triage_records").update(triagePayload).eq("id", existing.id);
      } else {
        await supabase.from("triage_records").insert(triagePayload);
      }

      await Promise.all([
        updateFila(selectedItem.filaId, { status: novoStatus as any }),
        updateAgendamento(selectedItem.id, { status: novoStatus as any }),
      ]);
      await Promise.all([refreshFila(), refreshAgendamentos()]);

      await logAction({
        acao: "finalizar_triagem",
        entidade: "agendamento",
        entidadeId: selectedItem.id,
        modulo: "triagem",
        user,
        detalhes: { paciente: selectedItem.pacienteNome, status: novoStatus, classificacaoRisco: form.classificacaoRisco },
      });

      toast.success("Triagem finalizada e paciente encaminhado!");
      setDialogOpen(false);
      setSelectedItem(null);
    } catch (error) {
      console.error("Erro ao finalizar triagem:", error);
      toast.error("Erro ao finalizar triagem.");
    } finally {
      setSaving(false);
    }
  };

  const espLabel = useMemo(() => {
    return selectedItem?.profissionalId ? `Especialidade: ${selectedItem.profissionalNome}` : "";
  }, [selectedItem]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground">Triagem de Enfermagem</h1>
        <p className="text-muted-foreground text-sm">{filaFiltrada.length} paciente(s) aguardando triagem</p>
      </div>
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
          <Search className="h-4 w-4" />
        </Button>
      </div>
      {filaFiltrada.length === 0 ? (
        <Card className="border-0 shadow-card">
          <CardContent className="p-8 text-center text-muted-foreground">
            {busca.trim() ? `Nenhum paciente encontrado para "${busca}".` : "Nenhum paciente aguardando triagem no momento."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filaFiltrada.map((item) => {
            const waitMinutes = item.filaCriadoEm ? differenceInMinutes(now, new Date(item.filaCriadoEm)) : 0;
            const waitLabel = waitMinutes >= 60 ? `${Math.floor(waitMinutes / 60)}h${waitMinutes % 60}min` : `${waitMinutes}min`;
            const espBadge = item.profissionalId
              ? ESPECIALIDADE_LABELS[item.profissionalNome] || item.profissionalNome.toUpperCase()
              : null;
            return (
              <Card key={item.filaId} className="border-0 shadow-card">
                <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center">
                  <span className="w-16 shrink-0 text-lg font-bold font-mono text-primary">{item.hora}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{resolvePaciente(item.pacienteId, item.pacienteNome)}</p>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {espBadge && (
                        <Badge variant="outline" className="border-primary/30 text-[10px] text-primary">
                          {espBadge}
                        </Badge>
                      )}
                      {item.cid && (
                        <Badge variant="outline" className="text-[10px]">
                          CID: {item.cid}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px]">
                        {item.filaStatus === "chegada_confirmada" ? "Chegada confirmada" : "Triagem em andamento"}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      <Clock className="mr-1 h-3 w-3" /> {waitLabel}
                    </Badge>
                    <Button size="sm" className="gradient-primary text-primary-foreground" onClick={() => openTriagem(item)}>
                      <Play className="mr-1 h-3.5 w-3.5" /> Iniciar triagem
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-success/40 text-success hover:bg-success/10"
                      onClick={() => setConfirmAction({ type: 'release', item })}
                    >
                      <FastForward className="mr-1 h-3.5 w-3.5" /> Liberar sem triagem
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-destructive/40 text-destructive hover:bg-destructive/10"
                      onClick={() => setConfirmAction({ type: 'remove', item })}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir da triagem
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Triagem  {selectedItem?.pacienteNome}</DialogTitle>
          </DialogHeader>
          {(pacienteInfo || selectedItem) && (
            <div className="space-y-2">
              {espLabel && (
                <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3">
                  <p className="text-xs text-muted-foreground">Especialidade Destino</p>
                  <p className="text-lg font-bold text-primary">{espLabel}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/50 p-3 text-xs sm:grid-cols-3">
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
            </div>
          )}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <Label>Peso (kg)</Label>
                <Input type="number" step="0.01" value={form.peso} onChange={(e) => setForm((p) => ({ ...p, peso: e.target.value }))} placeholder="70.5" />
              </div>
              <div>
                <Label>Altura (cm)</Label>
                <Input type="number" step="0.01" value={form.altura} onChange={(e) => setForm((p) => ({ ...p, altura: e.target.value }))} placeholder="170" />
              </div>
              <div>
                <Label>IMC</Label>
                <div className="mt-1 rounded-lg bg-muted p-2 text-sm">
                  {imc ? (
                    <span className="font-semibold">
                      {imc.value}  <span className="text-muted-foreground">{imc.label}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Informe peso e altura</span>
                  )}
                </div>
              </div>
              <div>
                <Label>Pressão Arterial</Label>
                <Input value={form.pressaoArterial} onChange={(e) => setForm((p) => ({ ...p, pressaoArterial: e.target.value }))} placeholder="120/80" />
              </div>
              <div>
                <Label>Temperatura (°C)</Label>
                <Input type="number" step="0.1" value={form.temperatura} onChange={(e) => setForm((p) => ({ ...p, temperatura: e.target.value }))} placeholder="36.5" />
              </div>
              <div>
                <Label>FC (bpm)</Label>
                <Input type="number" value={form.frequenciaCardiaca} onChange={(e) => setForm((p) => ({ ...p, frequenciaCardiaca: e.target.value }))} placeholder="72" />
              </div>
              <div>
                <Label>SatO2 (%)</Label>
                <Input type="number" value={form.saturacaoOxigenio} onChange={(e) => setForm((p) => ({ ...p, saturacaoOxigenio: e.target.value }))} placeholder="98" />
              </div>
              <div>
                <Label>Glicemia (mg/dL)</Label>
                <Input type="number" step="0.01" value={form.glicemia} onChange={(e) => setForm((p) => ({ ...p, glicemia: e.target.value }))} placeholder="Opcional" />
              </div>
            </div>
            <div>
              <Label className="text-base font-semibold">Escala de Dor (010): {form.dor}</Label>
              <Slider value={[form.dor]} onValueChange={(v) => setForm((p) => ({ ...p, dor: v[0] }))} max={10} min={0} step={1} className="mt-2" />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>Sem dor</span>
                <span>Dor máxima</span>
              </div>
            </div>
            <div>
              <Label className="text-base font-semibold">Classificação de Risco — Protocolo Manchester *</Label>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {MANCHESTER_LEVELS.map((m) => {
                  const isSelected = form.classificacaoRisco === m.level;
                  return (
                    <button
                      key={m.level}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, classificacaoRisco: m.level }))}
                      className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 p-3 transition-all text-center ${
                        isSelected
                          ? `border-[3px] shadow-lg`
                          : 'border-muted hover:border-muted-foreground/30'
                      }`}
                      style={{
                        borderColor: isSelected ? m.color : undefined,
                        backgroundColor: isSelected ? `${m.color}15` : undefined,
                      }}
                    >
                      <span
                        className="text-xs font-bold tracking-wide"
                        style={{ color: m.color }}
                      >
                        {m.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground leading-tight">{m.subtitle}</span>
                      <span className="text-[10px] text-muted-foreground">{m.tempo}</span>
                    </button>
                  );
                })}
              </div>
              {!form.classificacaoRisco && (
                <p className="mt-1 text-xs text-destructive">Seleção obrigatória</p>
              )}
            </div>
            <div>
              <Label>Queixa Principal</Label>
              <Textarea rows={2} value={form.queixaPrincipal} onChange={(e) => setForm((p) => ({ ...p, queixaPrincipal: e.target.value }))} placeholder="Queixa principal do paciente..." />
            </div>
            <div>
              <Label>Alergias</Label>
              <div className="mt-1 flex gap-2">
                <Input value={newAlergia} onChange={(e) => setNewAlergia(e.target.value)} placeholder="Digitar alergia" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAlergia())} />
                <Button type="button" variant="outline" size="icon" onClick={addAlergia}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {form.alergias.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {form.alergias.map((a, i) => (
                    <Badge key={`alergia-${a}-${i}`} variant="destructive" className="text-xs">
                      {a}{" "}
                      <button aria-label="Remover alergia" className="ml-1" onClick={() => setForm((p) => ({ ...p, alergias: p.alergias.filter((_, j) => j !== i) }))}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>Medicamentos em uso</Label>
              <div className="mt-1 flex gap-2">
                <Input value={newMedicamento} onChange={(e) => setNewMedicamento(e.target.value)} placeholder="Digitar medicamento" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMedicamento())} />
                <Button type="button" variant="outline" size="icon" onClick={addMedicamento}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {form.medicamentos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {form.medicamentos.map((m, i) => (
                    <Badge key={`med-${m}-${i}`} variant="secondary" className="text-xs">
                      {m}{" "}
                      <button aria-label="Remover medicamento" className="ml-1" onClick={() => setForm((p) => ({ ...p, medicamentos: p.medicamentos.filter((_, j) => j !== i) }))}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea rows={3} value={form.observacoes} onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))} placeholder="Observações relevantes da triagem..." />
            </div>
            {customConfig.fields.length > 0 && (
              <CustomFieldsRenderer
                fields={customConfig.fields}
                values={customData}
                onChange={(field, value) => setCustomData(prev => ({ ...prev, [field]: value }))}
              />
            )}
            <div className="flex flex-col gap-2">
              <Button variant="outline" className="w-full" onClick={salvarRascunho} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} <Save className="mr-2 h-4 w-4" /> Salvar Rascunho
              </Button>
              <div className="flex gap-2">
                <Button className="flex-1 bg-success text-success-foreground hover:bg-success/90" onClick={() => confirmarTriagem(true)} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} <CheckCircle className="mr-2 h-4 w-4" /> Encaminhar Enfermagem
                </Button>
                <Button className="flex-1" variant="secondary" onClick={() => confirmarTriagem(false)} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} <CheckCircle className="mr-2 h-4 w-4" /> Seguir sem Enfermagem
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && !actionLoading && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === 'remove' ? 'Excluir paciente da triagem?' : 'Liberar paciente sem triagem?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === 'remove' ? (
                <>
                  O paciente <strong>{confirmAction?.item.pacienteNome}</strong> será removido apenas da fila de triagem.
                  O cadastro do paciente, prontuário e dados do profissional <strong>não</strong> serão afetados.
                </>
              ) : (
                <>
                  O paciente <strong>{confirmAction?.item.pacienteNome}</strong> pulará a triagem e será encaminhado diretamente
                  ao profissional <strong>{confirmAction?.item.profissionalNome}</strong> com status "Liberado para atendimento".
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionLoading}
              className={confirmAction?.type === 'remove' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : 'bg-success text-success-foreground hover:bg-success/90'}
              onClick={(e) => {
                e.preventDefault();
                if (!confirmAction) return;
                if (confirmAction.type === 'remove') handleRemoverDaTriagem(confirmAction.item);
                else handleLiberarSemTriagem(confirmAction.item);
              }}
            >
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {confirmAction?.type === 'remove' ? 'Excluir' : 'Liberar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Triagem;