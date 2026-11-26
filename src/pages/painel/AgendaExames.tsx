import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, FileText, Loader2, Search, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useOperacional } from "@/contexts/OperacionalContext";
import { auditService } from "@/services/auditService";
import { generateSignature } from "@/lib/documentSignature";
import { whatsappService } from "@/services/whatsappService";
import {
  canTransitionDiagnosticExam,
  getAvailableDiagnosticSlots,
  getDiagnosticRoomConfig,
  getDiagnosticStatusLabel,
  getEffectiveDiagnosticStatus,
  isDiagnosticAppointment,
  type DiagnosticExamStatus,
  type DiagnosticRoomConfig,
  type DiagnosticExamConfig,
} from "@/lib/diagnosticExams";

type ExamRow = {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  unidade_id: string;
  sala_id: string;
  profissional_id: string;
  profissional_nome: string;
  data: string;
  hora: string;
  status: string;
  tipo: string;
  custom_data: Record<string, any>;
};

type Patient = { id: string; nome: string; cpf?: string; telefone?: string; email?: string };

const dateToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
};
const statusTone: Record<string, string> = {
  agendado: "secondary",
  paciente_chegou: "outline",
  exame_realizado_em_laudo: "default",
  laudo_liberado: "default",
  cancelado: "destructive",
};

export default function AgendaExames() {
  const { user, isGlobalAdmin } = useAuth();
  const { unidades, salas, funcionarios } = useOperacional();
  const { can } = usePermissions();
  const [responsibleId, setResponsibleId] = useState("");
  const [statusBusy, setStatusBusy] = useState(false);
  const statusLock = useRef(false);
  const [selectedUnit, setSelectedUnit] = useState(user?.unidadeId || "");
  const [selectedRoom, setSelectedRoom] = useState("");
  const [selectedExamId, setSelectedExamId] = useState("");
  const [date, setDate] = useState(dateToday());
  const [unitMetadata, setUnitMetadata] = useState<{ unit: string; data: Record<string, any> }>({ unit: "", data: {} });
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [roomSnapshot, setRoomSnapshot] = useState<{ key: string; rows: ExamRow[] } | null>(null);
  const [rowError, setRowError] = useState(false);
  const metadataRequest = useRef(0);
  const rowsRequest = useRef(0);
  const bookingLock = useRef(false);
  const scopeKey = JSON.stringify([user?.id, user?.unidadeId, isGlobalAdmin, selectedUnit, selectedRoom, date]);
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientId, setPatientId] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [slot, setSlot] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [laudoRow, setLaudoRow] = useState<ExamRow | null>(null);
  const [laudo, setLaudo] = useState({ descricao: "", conclusao: "", hipotese: "", crm: "" });

  const visibleUnits = useMemo(
    () => isGlobalAdmin ? unidades : unidades.filter(u => u.id === user?.unidadeId),
    [isGlobalAdmin, unidades, user?.unidadeId],
  );
  const unitAllowed = !!selectedUnit && visibleUnits.some(u => u.id === selectedUnit);
  const responsibleOptions = useMemo(() => funcionarios.filter(f => f.ativo && f.unidadeId === selectedUnit && ["profissional", "tecnico", "enfermagem"].includes(f.role)), [funcionarios, selectedUnit]);
  const responsible = responsibleOptions.find(f => f.id === responsibleId);
  const canBook = unitAllowed && can("agenda", "can_create");
  const canArrive = unitAllowed && can("agenda", "can_execute");
  const canPerform = unitAllowed && ["profissional", "tecnico", "enfermagem"].includes(user?.role || "") && can("agenda", "can_execute");
  const rooms = useMemo(() => salas.filter(s => s.unidadeId === selectedUnit && s.ativo), [salas, selectedUnit]);
  const metadata = unitAllowed && unitMetadata.unit === selectedUnit ? unitMetadata.data : null;
  const diagnosticRooms = useMemo(() => rooms.filter(r => !!getDiagnosticRoomConfig(metadata, r.id)), [rooms, metadata]);
  const roomConfig = useMemo<DiagnosticRoomConfig | null>(
    () => diagnosticRooms.some(r => r.id === selectedRoom) ? getDiagnosticRoomConfig(metadata, selectedRoom) : null,
    [diagnosticRooms, metadata, selectedRoom],
  );

  const selectedExam = useMemo<DiagnosticExamConfig | null>(
    () => roomConfig?.exames.find(exam => exam.id === selectedExamId) || null,
    [roomConfig, selectedExamId],
  );

  const loadUnitMetadata = useCallback(async () => {
    const request = ++metadataRequest.current;
    setUnitMetadata({ unit: "", data: {} });
    if (!unitAllowed) { setMetadataLoading(false); return; }
    setMetadataLoading(true);
    try {
      const { data, error } = await supabase.from("unidades" as any).select("custom_data").eq("id", selectedUnit).maybeSingle();
      if (request !== metadataRequest.current) return;
      if (error) throw error;
      setUnitMetadata({ unit: selectedUnit, data: ((data as any)?.custom_data || {}) as Record<string, any> });
    } catch {
      if (request === metadataRequest.current) toast.error("Não foi possível carregar a configuração da unidade.");
    } finally {
      if (request === metadataRequest.current) setMetadataLoading(false);
    }
  }, [selectedUnit, unitAllowed]);

  // Same occupancy scope as Agenda Geral; ordinary bookings occupy the room
  // but only explicitly tagged diagnostic exams enter the technical queue.
  const readRoomRows = useCallback(async (): Promise<ExamRow[]> => {
    const result: ExamRow[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await (supabase as any).from("agendamentos")
        .select("id,paciente_id,paciente_nome,unidade_id,sala_id,profissional_id,profissional_nome,data,hora,status,tipo,custom_data")
        .eq("unidade_id", selectedUnit).eq("sala_id", selectedRoom).eq("data", date)
        .order("hora", { ascending: true }).order("id", { ascending: true }).range(offset, offset + pageSize - 1);
      if (error) throw error;
      const page = (data || []) as ExamRow[];
      result.push(...page);
      if (page.length < pageSize) return result;
    }
  }, [selectedUnit, selectedRoom, date]);

  const loadRows = useCallback(async () => {
    if (scopeRef.current !== scopeKey) return;
    const request = ++rowsRequest.current;
    setRowError(false);
    if (!unitAllowed || !roomConfig || !date) { setRoomSnapshot(null); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await readRoomRows();
      if (request !== rowsRequest.current || scopeRef.current !== scopeKey) return;
      setRoomSnapshot({ key: scopeKey, rows: data });
    } catch {
      if (request !== rowsRequest.current || scopeRef.current !== scopeKey) return;
      setRoomSnapshot(null);
      setRowError(true);
      toast.error("Não foi possível carregar a fila do aparelho.");
    } finally {
      if (request === rowsRequest.current && scopeRef.current === scopeKey) setLoading(false);
    }
  }, [unitAllowed, roomConfig, date, readRoomRows, scopeKey]);

  const roomRows = unitAllowed && roomConfig && roomSnapshot?.key === scopeKey ? roomSnapshot.rows : null;
  const rows = useMemo(() => (roomRows || []).filter(isDiagnosticAppointment), [roomRows]);

  useEffect(() => {
    void loadUnitMetadata();
    return () => { ++metadataRequest.current; };
  }, [loadUnitMetadata]);
  useEffect(() => {
    if (!selectedRoom || !roomConfig) { setSelectedExamId(""); return; }
    if (!roomConfig.exames.some(exam => exam.id === selectedExamId)) setSelectedExamId(roomConfig.exames[0]?.id || "");
  }, [selectedRoom, roomConfig, selectedExamId]);
  useEffect(() => {
    void loadRows();
    return () => { ++rowsRequest.current; };
  }, [loadRows]);
  useEffect(() => { setSlot(""); setLaudoRow(null); setResponsibleId(""); }, [scopeKey]);
  useEffect(() => {
    if (!unitAllowed || !roomConfig || !date) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase.channel(`diagnostic-room-${selectedUnit}-${selectedRoom}-${date}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "agendamentos", filter: `sala_id=eq.${selectedRoom}` }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => { if (scopeRef.current === scopeKey) void loadRows(); }, 250);
      }).subscribe(status => {
        if (status === "SUBSCRIBED" && scopeRef.current === scopeKey) void loadRows();
      });
    return () => { clearTimeout(timer); void supabase.removeChannel(channel); };
  }, [unitAllowed, roomConfig, date, selectedUnit, selectedRoom, scopeKey, loadRows]);

  useEffect(() => {
    let active = true;
    const term = patientSearch.trim();
    if (term.length < 3) { setPatients([]); return; }
    const timer = setTimeout(async () => {
      const safeTerm = term.replace(/[%_,()]/g, " ").trim();
      const digits = term.replace(/\D/g, "");
      let patientQuery = (supabase as any).from("pacientes").select("id,nome,cpf,telefone,email");
      patientQuery = digits.length >= 3
        ? patientQuery.or(`nome.ilike.%${safeTerm}%,cpf.ilike.%${digits}%`)
        : patientQuery.ilike("nome", `%${safeTerm}%`);
      const { data, error } = await patientQuery.limit(8);
      if (!active) return;
      if (error) { toast.error("Falha na busca de pacientes."); return; }
      setPatients((data || []) as Patient[]);
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [patientSearch]);

  const slots = useMemo(
    () => roomConfig && selectedExam && roomRows && !loading && !rowError ? getAvailableDiagnosticSlots({ ...roomConfig, duracaoSlot: selectedExam.duracaoSlot }, roomRows) : [],
    [roomConfig, selectedExam, roomRows, loading, rowError],
  );

  const createExam = async () => {
    if (bookingLock.current || statusLock.current) return;
    if (!canBook || !responsible || !roomConfig || !selectedExam || !patientId || !slot || !selectedUnit || !selectedRoom || !roomRows || loading || rowError || !slots.includes(slot)) {
      toast.error("Selecione paciente, sala e horário.");
      return;
    }
    const patient = selectedPatient;
    if (!patient || patient.id !== patientId) { toast.error("Selecione novamente o paciente."); return; }
    bookingLock.current = true;
    setSaving(true);
    const bookingScope = scopeKey;
    try {
      // Validate current configuration and assignment before using the displayed slot.
      // A fresh read is not a substitute for a database-level atomic reservation.
      const [freshRows, unitResult, roomResult, responsibleResult] = await Promise.all([
        readRoomRows(),
        (supabase as any).from("unidades").select("ativo,custom_data").eq("id", selectedUnit).maybeSingle(),
        (supabase as any).from("salas").select("id,ativo").eq("id", selectedRoom).eq("unidade_id", selectedUnit).maybeSingle(),
        (supabase as any).from("funcionarios").select("id,ativo,role,unidade_id").eq("id", responsible.id).maybeSingle(),
      ]);
      if (scopeRef.current !== bookingScope) return;
      if (unitResult.error || roomResult.error || responsibleResult.error) throw new Error("Não foi possível validar a configuração do aparelho.");
      const freshConfig = getDiagnosticRoomConfig(unitResult.data?.custom_data, selectedRoom);
      const freshExam = freshConfig?.exames.find(exam => exam.id === selectedExam.id);
      if (!unitResult.data?.ativo || !roomResult.data?.ativo || !freshConfig || !freshExam ||
          JSON.stringify(freshExam) !== JSON.stringify(selectedExam) ||
          freshConfig.horarioInicio !== roomConfig.horarioInicio || freshConfig.horarioFim !== roomConfig.horarioFim) {
        setSlot("");
        toast.error("A configuração do aparelho mudou. Confira novamente as orientações e horários.");
        await loadUnitMetadata();
        return;
      }
      const freshResponsible = responsibleResult.data;
      if (!freshResponsible?.ativo || freshResponsible.unidade_id !== selectedUnit || !["profissional", "tecnico", "enfermagem"].includes(freshResponsible.role)) {
        setResponsibleId("");
        toast.error("O responsável não está mais ativo ou vinculado à unidade. Selecione outro profissional.");
        return;
      }
      if (!getAvailableDiagnosticSlots({ ...freshConfig, duracaoSlot: freshExam.duracaoSlot }, freshRows).includes(slot)) {
        setSlot("");
        toast.error("Este horário não está mais disponível. Selecione outro horário.");
        await loadRows();
        return;
      }
    const id = crypto.randomUUID();
    const custom = {
      sala_tipo: "aparelho_diagnostico",
      exame_id: selectedExam.id,
      exame_nome: selectedExam.tipoExame,
      preparo_instrucoes: selectedExam.exigePreparo ? selectedExam.instrucoesPreparo : "",
      exige_preparo: selectedExam.exigePreparo,
      exige_contraste: selectedExam.exigeContraste,
      duracao_slot_minutos: selectedExam.duracaoSlot,
      prazo_resultado_dias: selectedExam.prazoResultadoDias,
      status_exame: "agendado",
      historico_status: [{ status: "agendado", em: new Date().toISOString(), por: user?.id || "" }],
    };
    const { error } = await (supabase as any).from("agendamentos").insert({
      id, paciente_id: patient.id, paciente_nome: patient.nome,
      unidade_id: selectedUnit, sala_id: selectedRoom, setor_id: "",
      profissional_id: responsible.id, profissional_nome: responsible.nome,
      data: date, hora: slot, status: "confirmado", tipo: "Exame",
      observacoes: selectedExam.exigePreparo ? selectedExam.instrucoesPreparo : "",
      origem: "recepcao", criado_por: user?.id || "", custom_data: custom,
    });
    if (error) { toast.error(error.message || "Não foi possível agendar o exame."); return; }
    void auditService.log({
      acao: "agendamento_exame_diagnostico", modulo: "exames_diagnosticos", entidade: "agendamentos",
      entidadeId: id, pacienteId: patient.id, pacienteNome: patient.nome, unidadeId: selectedUnit,
      user: user ? { id: user.id, nome: user.nome, role: user.role, unidadeId: user.unidadeId } : null,
      detalhes: { sala_id: selectedRoom, exame: selectedExam.tipoExame, data: date, hora: slot },
    });
    toast.success("Exame agendado.");
    if (scopeRef.current === bookingScope) {
      setPatientId(""); setSelectedPatient(null); setPatientSearch(""); setSlot("");
      await loadRows();
    }
    } catch {
      toast.error("Não foi possível confirmar a disponibilidade ou agendar o exame.");
    } finally {
      bookingLock.current = false;
      setSaving(false);
    }
  };

  const changeStatus = async (row: ExamRow, next: DiagnosticExamStatus) => {
    if (statusLock.current || bookingLock.current || !unitAllowed || !roomConfig || row.data !== date || row.unidade_id !== selectedUnit || row.sala_id !== selectedRoom || !user?.id) return;
    if (next === "paciente_chegou" ? !canArrive : next === "exame_realizado_em_laudo" ? !canPerform : next === "laudo_liberado" ? !canWriteReport : true) {
      toast.error("Sem permissão para esta etapa do exame.");
      return;
    }
    if (row.data > dateToday()) { toast.error("Não é possível executar uma etapa antes da data agendada."); return; }
    statusLock.current = true;
    setStatusBusy(true);
    const actionScope = scopeKey;
    let committed = false;
    try {
    const { data: fresh, error: freshError } = await (supabase as any).from("agendamentos")
      .select("id,paciente_id,paciente_nome,unidade_id,sala_id,profissional_id,profissional_nome,data,hora,status,tipo,custom_data,atualizado_em")
      .eq("id", row.id).eq("unidade_id", selectedUnit).eq("sala_id", selectedRoom).eq("data", date).maybeSingle();
    if (scopeRef.current !== actionScope) return;
    if (freshError || !fresh || !isDiagnosticAppointment(fresh) || fresh.paciente_id !== row.paciente_id || fresh.hora !== row.hora || fresh.custom_data?.exame_id !== row.custom_data?.exame_id) {
      toast.error("O exame mudou ou não está mais disponível. Atualize a fila.");
      await loadRows();
      return;
    }
    const current = getEffectiveDiagnosticStatus(fresh);
    if (!canTransitionDiagnosticExam(current, next)) { toast.error("A situação do exame mudou. Consulte a fila."); await loadRows(); return; }
    row = fresh as ExamRow;
    let signatureData: Awaited<ReturnType<typeof generateSignature>> | null = null;
    if (next === "laudo_liberado") {
      if (!laudoRow || laudoRow.id !== row.id || !laudo.conclusao.trim() || !laudo.crm.trim()) {
        toast.error("Informe a conclusão e o CRM do médico laudista antes de liberar.");
        return;
      }
      if (String(user?.role || "").toLowerCase() !== "profissional") {
        toast.error("Somente profissional de saúde habilitado pode liberar laudo.");
        return;
      }
      let professionalQuery = (supabase as any).from("funcionarios").select("tipo_conselho,numero_conselho,uf_conselho").eq("ativo", true).eq("unidade_id", selectedUnit).eq("role", "profissional");
      professionalQuery = (user as any)?.authUserId
        ? professionalQuery.eq("auth_user_id", (user as any).authUserId)
        : professionalQuery.eq("id", user?.id || "");
      const { data: professional, error: professionalError } = await professionalQuery.maybeSingle();
      const registeredCrm = professional?.tipo_conselho && String(professional.tipo_conselho).toUpperCase().includes("CRM") && String(professional.numero_conselho || "").trim() && String(professional.uf_conselho || "").trim()
        ? `${professional.numero_conselho || ""}/${professional.uf_conselho || ""}`.replace(/\/$/, "")
        : "";
      if (professionalError || !registeredCrm || registeredCrm.toLowerCase() !== laudo.crm.trim().toLowerCase()) {
        toast.error("O CRM informado deve corresponder ao registro profissional ativo no cadastro do sistema.");
        return;
      }
      signatureData = await generateSignature(
        [row.custom_data?.exame_nome || "Exame diagnóstico", laudo.descricao, laudo.hipotese, laudo.conclusao, row.paciente_id, row.data, row.hora].join("|"),
        user?.id || "",
        user?.nome || "",
        "CRM",
        String(professional.numero_conselho || ""),
        String(professional.uf_conselho || ""),
      );
    }
    const now = new Date().toISOString();
    const history = Array.isArray(row.custom_data?.historico_status) ? row.custom_data.historico_status : [];
    const nextCustom = {
      ...row.custom_data,
      status_exame: next,
      historico_status: [...history, { status: next, em: now, por: user?.id || "", nome: user?.nome || "" }],
      ...(next === "laudo_liberado" ? {
        laudo: {
          descricao: laudo.descricao,
          conclusao: laudo.conclusao,
          hipotese: laudo.hipotese,
          concluido_por_nome: user?.nome || "",
          crm_registro: laudo.crm,
          assinatura_eletronica: signatureData,
          liberado_em: now,
          profissional_id: user?.id || "",
        },
      } : {}),
    };
    if (scopeRef.current !== actionScope) return;
    // Optimistic compare-and-set: reject changed rows rather than overwrite a newer report.
    let update = (supabase as any).from("agendamentos").update({ custom_data: nextCustom }).eq("id", row.id)
      .eq("unidade_id", selectedUnit).eq("sala_id", selectedRoom).eq("data", row.data).eq("hora", row.hora).eq("status", row.status);
    update = fresh.atualizado_em == null ? update.is("atualizado_em", null) : update.eq("atualizado_em", fresh.atualizado_em);
    const { data: saved, error } = await update.select("id").maybeSingle();
    if (error || saved?.id !== row.id) { toast.error("Não foi possível confirmar a alteração. O exame pode ter sido atualizado por outro usuário."); await loadRows(); return; }
    committed = true;
    void auditService.log({
      acao: next === "laudo_liberado" ? "laudo_exame_liberado" : "status_exame_alterado",
      modulo: "exames_diagnosticos", entidade: "agendamentos", entidadeId: row.id,
      agendamentoId: row.id, pacienteId: row.paciente_id, pacienteNome: row.paciente_nome,
      unidadeId: selectedUnit, profissionalId: user?.id, profissionalNome: user?.nome,
      user: user ? { id: user.id, nome: user.nome, role: user.role, unidadeId: user.unidadeId } : null,
      detalhes: { status_anterior: current, status_novo: next, crm: next === "laudo_liberado" ? laudo.crm : undefined },
    });
    if (next === "laudo_liberado") {
      if (scopeRef.current === actionScope) { setLaudoRow(null); setLaudo({ descricao: "", conclusao: "", hipotese: "", crm: "" }); }
      const { data: patient, error: patientError } = await (supabase as any).from("pacientes").select("telefone,email").eq("id", row.paciente_id).maybeSingle();
      if (patientError) toast.warning("Laudo gravado, mas não foi possível consultar os contatos para notificação.");
      if (patient?.email) {
        try {
        const { error: emailError } = await supabase.functions.invoke("send-email", { body: {
          evento: "laudo_liberado", paciente_nome: row.paciente_nome, email: patient.email,
          telefone: patient.telefone || "", data_consulta: row.data,
          hora_consulta: row.hora, unidade: unidades.find(u => u.id === selectedUnit)?.nome || "",
          profissional: user?.nome || "", tipo_atendimento: row.custom_data?.exame_nome || "Exame diagnóstico",
          status_agendamento: "laudo_liberado", id_agendamento: row.id,
        } });
        if (emailError) toast.warning("Laudo liberado, mas o e-mail não foi confirmado.");
        } catch { toast.warning("Laudo liberado, mas o e-mail não foi confirmado."); }
      }
      if (patient?.telefone) {
        try {
        const message = `Olá, ${row.paciente_nome}. Seu laudo do exame de ${row.custom_data?.exame_nome || "diagnóstico"} realizado na unidade ${unidades.find(u => u.id === selectedUnit)?.nome || ""} já está disponível. Acesse o Portal do Paciente ou procure a recepção.`;
        const sent = await whatsappService.sendDirect({
          tipo: "laudo_liberado", telefone: patient.telefone, paciente_nome: row.paciente_nome,
          unidade: unidades.find(u => u.id === selectedUnit)?.nome || "", unidade_id: selectedUnit,
          observacoes: message, mensagem_custom: message,
        });
        if (sent.error) toast.warning("Laudo liberado, mas a notificação WhatsApp não foi confirmada.");
        } catch { toast.warning("Laudo liberado, mas a notificação WhatsApp não foi confirmada."); }
      }
    }
    toast.success(next === "laudo_liberado" ? "Laudo liberado oficialmente." : "Status atualizado.");
    if (scopeRef.current === actionScope) await loadRows();
    } catch {
      toast.error(committed ? "Etapa gravada, mas a confirmação dos serviços adicionais falhou." : "Não foi possível confirmar a etapa do exame.");
      if (scopeRef.current === actionScope) await loadRows();
    } finally {
      statusLock.current = false;
      setStatusBusy(false);
    }
  };

  const openLaudo = (row: ExamRow) => {
    setLaudoRow(row);
    const saved = row.custom_data?.laudo || {};
    setLaudo({
      descricao: saved.descricao || "",
      conclusao: saved.conclusao || "",
      hipotese: saved.hipotese || "",
      crm: saved.crm_registro || "",
    });
  };

  const canWorkUnit = isGlobalAdmin || !!user?.unidadeId && user.unidadeId === selectedUnit;
  const canWriteReport = canWorkUnit && can("agenda", "can_execute") && String(user?.role || "").toLowerCase() === "profissional";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Agenda de Exames</h1><p className="text-sm text-muted-foreground">Agendamento por aparelho, fila técnica e liberação de laudos</p></div>
        <Badge variant="outline">Módulo por sala</Badge>
      </div>

      <Card><CardContent className="grid gap-3 p-4 md:grid-cols-3">
        <div><Label>Unidade</Label><Select value={selectedUnit} disabled={saving || statusBusy} onValueChange={v => { setSelectedUnit(v); setSelectedRoom(""); setSelectedExamId(""); setSlot(""); }}>
          <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
          <SelectContent>{visibleUnits.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
        </Select></div>
        <div><Label>Aparelho / Sala</Label><Select value={selectedRoom} disabled={!unitAllowed || metadataLoading || saving || statusBusy} onValueChange={value => { setSelectedRoom(value); setSelectedExamId(""); setSlot(""); }}>
          <SelectTrigger><SelectValue placeholder="Selecione o aparelho" /></SelectTrigger>
          <SelectContent>{diagnosticRooms.map(r => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}</SelectContent>
        </Select></div>
        <div><Label>Data</Label><Input type="date" value={date} disabled={saving || statusBusy} onChange={e => { setDate(e.target.value); setSlot(""); }} /></div>
      </CardContent></Card>

      {roomConfig ? <>
        <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Novo agendamento — {selectedExam?.tipoExame || "Selecione o exame"}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Tipo de exame *</Label><Select value={selectedExamId} disabled={saving || statusBusy} onValueChange={value => { setSelectedExamId(value); setSlot(""); }}><SelectTrigger><SelectValue placeholder="Selecione o exame" /></SelectTrigger><SelectContent>{roomConfig.exames.map(exam => <SelectItem key={exam.id} value={exam.id}>{exam.tipoExame}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="md:col-span-2"><Label>Buscar paciente (nome ou CPF)</Label>
                <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" disabled={saving || statusBusy} value={patientSearch} onChange={e => { setPatientSearch(e.target.value); setPatientId(""); setSelectedPatient(null); }} placeholder="Digite ao menos 3 caracteres" /></div>
                {patients.length > 0 && <div className="mt-1 max-h-40 overflow-y-auto rounded-md border">{patients.map(p => <button key={p.id} type="button" disabled={saving || statusBusy} onClick={() => { setPatientId(p.id); setSelectedPatient(p); setPatientSearch(`${p.nome}${p.cpf ? " — "+p.cpf : ""}`); setPatients([]); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">{p.nome} <span className="text-muted-foreground">{p.cpf || ""}</span></button>)}</div>}
              </div>
              <div><Label>Horário disponível</Label><Select value={slot} disabled={saving || statusBusy || loading} onValueChange={setSlot}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{slots.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            </div>
            {selectedExam?.exigePreparo && <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>Orientações de preparo — {selectedExam.tipoExame}</strong><p className="mt-1 whitespace-pre-wrap">{selectedExam.instrucoesPreparo || "A unidade exige preparo, mas ainda não cadastrou as instruções. Confirme com a equipe antes do agendamento."}</p></div>}
            <p className="text-xs text-muted-foreground">Duração: {selectedExam?.duracaoSlot || "—"} min • Contraste: {selectedExam?.exigeContraste || "—"} • Resultado: {selectedExam?.prazoResultadoDias || 0} dia(s)</p>
            <div><Label>Profissional responsável pelo exame *</Label><Select value={responsibleId} onValueChange={setResponsibleId} disabled={!canBook || saving || statusBusy}><SelectTrigger><SelectValue placeholder="Selecione o responsável" /></SelectTrigger><SelectContent>{responsibleOptions.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent></Select></div>
            <Button onClick={createExam} disabled={!canBook || !responsible || saving || statusBusy || loading || rowError || !roomRows || !patientId || !slot || !selectedExam || !slots.includes(slot)}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Agendar exame</Button>
          </CardContent>
        </Card>

        <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock3 className="h-4 w-4" /> Fila do aparelho — {rows.length}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {loading || (!roomRows && !rowError) ? <div className="py-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : rowError ? <div className="space-y-2 text-center text-sm text-destructive"><p>Não foi possível confirmar a ocupação da sala.</p><Button variant="outline" size="sm" onClick={() => void loadRows()}>Tentar novamente</Button></div> : rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum exame agendado para esta data.</p> : rows.map(row => {
              const status = getEffectiveDiagnosticStatus(row);
              return <div key={row.id} className="flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong>{row.hora}</strong><Badge variant={statusTone[status] as any || "secondary"}>{getDiagnosticStatusLabel(status)}</Badge></div><p className="font-medium">{row.paciente_nome}</p><p className="text-xs text-muted-foreground">{row.custom_data?.exame_nome || "Exame diagnóstico"}</p></div>
                <div className="flex flex-wrap gap-2">
                  {status === "agendado" && canArrive && <Button disabled={statusBusy || saving || row.data > dateToday()} size="sm" variant="outline" onClick={() => void changeStatus(row, "paciente_chegou")}>Paciente chegou</Button>}
                  {status === "paciente_chegou" && canPerform && <Button disabled={statusBusy || saving || row.data > dateToday()} size="sm" onClick={() => void changeStatus(row, "exame_realizado_em_laudo")}>Exame realizado</Button>}
                  {status === "exame_realizado_em_laudo" && canWriteReport && <Button disabled={statusBusy || saving || row.data > dateToday()} size="sm" onClick={() => openLaudo(row)}><FileText className="mr-1 h-4 w-4" />Laudar / liberar</Button>}
                  {status === "laudo_liberado" && <Badge variant="outline"><CheckCircle2 className="mr-1 h-3 w-3" />Laudo liberado</Badge>}
                </div>
              </div>;
            })}
          </CardContent>
        </Card>

        {laudoRow && <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Stethoscope className="h-4 w-4" /> Laudo — {laudoRow.paciente_nome}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Descrição / Achados</Label><Textarea rows={4} disabled={statusBusy} value={laudo.descricao} onChange={e => setLaudo(p => ({ ...p, descricao: e.target.value }))} /></div>
            <div><Label>Conclusão *</Label><Textarea rows={3} disabled={statusBusy} value={laudo.conclusao} onChange={e => setLaudo(p => ({ ...p, conclusao: e.target.value }))} /></div>
            <div><Label>Hipótese / Impressão</Label><Textarea rows={2} disabled={statusBusy} value={laudo.hipotese} onChange={e => setLaudo(p => ({ ...p, hipotese: e.target.value }))} /></div>
            <div><Label>CRM do laudista *</Label><Input disabled={statusBusy} value={laudo.crm} onChange={e => setLaudo(p => ({ ...p, crm: e.target.value }))} placeholder="CRM/UF e número" /></div>
            <div className="flex flex-wrap gap-2"><Button disabled={statusBusy || saving || !canWriteReport} onClick={() => void changeStatus(laudoRow, "laudo_liberado")}>Liberar Laudo Oficial</Button><Button disabled={statusBusy} variant="outline" onClick={() => setLaudoRow(null)}>Cancelar</Button></div>
            <p className="text-xs text-muted-foreground">A liberação grava o profissional, CRM, data/hora e histórico de status na trilha auditável do agendamento.</p>
          </CardContent>
        </Card>}
      </> : <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
        {metadataLoading ? "Carregando aparelhos da unidade..." : unitAllowed && metadata && diagnosticRooms.length === 0 ? "Nenhum aparelho diagnóstico ativo configurado nesta unidade. Confira o cadastro em Unidades e Salas." : selectedUnit && selectedRoom ? "Esta sala não está configurada como aparelho de diagnóstico." : "Selecione uma unidade e uma sala configurada como aparelho diagnóstico."}
      </CardContent></Card>}
    </div>
  );
}
