import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, FileText, Loader2, Search, Stethoscope, Activity, Monitor, Plus, RefreshCw, UserCheck, ChevronDown, ChevronRight, CalendarX, AlertCircle, Hospital, Printer } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
  const [bookingOpen, setBookingOpen] = useState(false);
  const [queueFilter, setQueueFilter] = useState("all");
  const [queueSearch, setQueueSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
  const queueGroups = useMemo(() => {
    const result: Record<string, number> = { all: rows.length };
    for (const row of rows) {
      const status = getEffectiveDiagnosticStatus(row);
      result[status] = (result[status] || 0) + 1;
    }
    result.encerrados = (result.cancelado || 0) + (result.falta || 0) + (result.remarcado || 0);
    return result;
  }, [rows]);
  const visibleRows = useMemo(() => {
    const term = queueSearch.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return rows.filter(row => {
      const status = getEffectiveDiagnosticStatus(row);
      if (queueFilter !== "all" && (queueFilter === "encerrados" ? !["cancelado", "falta", "remarcado"].includes(status) : status !== queueFilter)) return false;
      return !term || [row.paciente_nome, row.custom_data?.exame_nome, row.profissional_nome, row.hora].some(value =>
        String(value || "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term));
    });
  }, [rows, queueFilter, queueSearch]);

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
  useEffect(() => { setSlot(""); setLaudoRow(null); setResponsibleId(""); setBookingOpen(false); setQueueFilter("all"); setQueueSearch(""); setExpandedId(null); }, [scopeKey]);
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
      ...(selectedExam.codigoSigtap ? { sigtap_codigo: selectedExam.codigoSigtap } : {}),
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
    if (error) {
      if ((error as any).code === "23P01") { setSlot(""); toast.error("Este horário acabou de ser ocupado por outro agendamento. Selecione outro horário."); await loadRows(); return; }
      toast.error(error.message || "Não foi possível agendar o exame."); return;
    }
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

  const printLaudo = (row: ExamRow) => {
    const l = row.custom_data?.laudo || {};
    const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
    const unit = unidades.find(u => u.id === row.unidade_id)?.nome || "";
    const sig = l.assinatura_eletronica || {};
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) { toast.error("Permita pop-ups para imprimir o laudo."); return; }
    w.document.write(`<!doctype html><html><head><title>Laudo</title><style>@page{size:A4;margin:18mm}body{font-family:Georgia,serif;color:#111;font-size:12pt}h1{font-size:16pt;text-align:center;margin:0 0 4px}h2{font-size:12pt;border-bottom:1px solid #999;margin:16px 0 6px}.c{text-align:center;font-size:10pt}.p{white-space:pre-wrap}.s{margin-top:40px;text-align:center}.h{font-size:8pt;color:#555;word-break:break-all;margin-top:24px}</style></head><body>
<p class="c">Secretaria Municipal de Saúde de Oriximiná<br>${esc(unit)}</p><h1>LAUDO DE EXAME — ${esc(row.custom_data?.exame_nome || "Exame diagnóstico")}</h1>
<p><b>Paciente:</b> ${esc(row.paciente_nome)}<br><b>Data do exame:</b> ${esc(row.data.split("-").reverse().join("/"))} às ${esc(row.hora)}</p>
<h2>Descrição / Achados</h2><div class="p">${esc(l.descricao || "—")}</div><h2>Hipótese / Impressão</h2><div class="p">${esc(l.hipotese || "—")}</div><h2>Conclusão</h2><div class="p">${esc(l.conclusao || "—")}</div>
<div class="s">______________________________<br>${esc(l.concluido_por_nome)}<br>CRM ${esc(l.crm_registro)}<br>Liberado em ${esc(l.liberado_em ? new Date(l.liberado_em).toLocaleString("pt-BR") : "")}</div>
${sig.hash ? `<p class="h">Assinatura eletrônica (SHA-256): ${esc(sig.hash)}</p>` : ""}
<script>window.onload=()=>{window.print()}</script></body></html>`);
    w.document.close();
    void auditService.log({ acao: "laudo_exame_impresso", modulo: "exames_diagnosticos", entidade: "agendamentos", entidadeId: row.id, pacienteId: row.paciente_id, pacienteNome: row.paciente_nome, unidadeId: row.unidade_id, user: user ? { id: user.id, nome: user.nome, role: user.role, unidadeId: user.unidadeId } : null, detalhes: {} });
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

  const busy = saving || statusBusy;
  const metrics = [
    { id: "all", label: "Total de exames", icon: CalendarDays, tone: "blue" },
    { id: "agendado", label: "Agendados", icon: Clock3, tone: "blue" },
    { id: "paciente_chegou", label: "Presentes", icon: UserCheck, tone: "teal" },
    { id: "exame_realizado_em_laudo", label: "Aguardando laudo", icon: FileText, tone: "violet" },
    { id: "laudo_liberado", label: "Laudos liberados", icon: CheckCircle2, tone: "teal" },
    { id: "encerrados", label: "Cancelados / faltas / remarcados", icon: CalendarX, tone: "slate" },
  ];
  const selectedRoomName = diagnosticRooms.find(room => room.id === selectedRoom)?.nome;
  const selectedUnitName = visibleUnits.find(unit => unit.id === selectedUnit)?.nome;
  const activeLaudoStatus = laudoRow && rows.find(row => row.id === laudoRow.id);
  const reportStillAvailable = !!activeLaudoStatus && getEffectiveDiagnosticStatus(activeLaudoStatus) === "exame_realizado_em_laudo";
  const queueReady = !!roomRows && !rowError;

  return (
    <div className="space-y-3">
      <div className="clinical-hub-hero flex flex-wrap items-center gap-3">
        <span className="clinical-patient-avatar flex items-center justify-center shrink-0"><Activity className="h-5 w-5" /></span>
        <div className="flex-1 min-w-[9rem]">
          <p className="clinical-hub-eyebrow">Apoio diagnóstico e assistencial</p>
          <h1 className="clinical-hub-name text-xl font-bold font-display">Agenda de Exames</h1>
          <p className="clinical-patient-sub text-xs mt-1">Agendamento por aparelho · Fila técnica · Laudos</p>
        </div>
        {canBook && roomConfig && <Button type="button" className="clinical-hub-new" disabled={busy} aria-expanded={bookingOpen} aria-controls="diagnostic-booking" onClick={() => setBookingOpen(v => !v)}>
          {bookingOpen ? <ChevronDown className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{bookingOpen ? "Recolher agendamento" : "Novo agendamento"}
        </Button>}
      </div>

      <section className="clinical-premium p-3 space-y-3" aria-label="Contexto do aparelho">
        <div className="flex items-center gap-2">
          <span className="clinical-dock-icon clinical-tone-blue"><Hospital className="h-4 w-4" /></span>
          <div className="flex-1 min-w-0"><h2 className="text-sm font-semibold">Unidade e aparelho</h2><p className="text-xs text-muted-foreground">Selecione o contexto de trabalho</p></div>
          {unitAllowed && metadata && !metadataLoading && <Badge variant="outline" className="shrink-0">{diagnosticRooms.length} aparelho(s)</Badge>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1 min-w-0"><Label className="text-xs">Unidade</Label><Select value={selectedUnit} disabled={busy} onValueChange={v => { setSelectedUnit(v); setSelectedRoom(""); setSelectedExamId(""); setSlot(""); }}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
            <SelectContent>{visibleUnits.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
          </Select></div>
          <div className="space-y-1 min-w-0"><Label className="text-xs">Aparelho / Sala</Label><Select value={selectedRoom} disabled={!unitAllowed || metadataLoading || busy} onValueChange={value => { setSelectedRoom(value); setSelectedExamId(""); setSlot(""); }}>
            <SelectTrigger className="w-full"><SelectValue placeholder={metadataLoading ? "Carregando..." : "Selecione o aparelho"} /></SelectTrigger>
            <SelectContent>{diagnosticRooms.map(r => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}</SelectContent>
          </Select></div>
          <div className="space-y-1 min-w-0"><Label className="text-xs">Data da agenda</Label><Input type="date" value={date} disabled={busy} onChange={e => { setDate(e.target.value); setSlot(""); }} /></div>
        </div>
        {roomConfig && <div className="clinical-inset rounded-lg border p-2.5 flex flex-wrap items-center gap-2.5">
          <span className="clinical-dock-icon clinical-tone-teal"><Monitor className="h-4 w-4" /></span>
          <div className="flex-1 min-w-[8rem]"><p className="font-semibold text-sm break-words">{selectedRoomName}</p><p className="text-xs text-muted-foreground break-words">{selectedUnitName}</p></div>
          <div><p className="clinical-field-label text-[10px] font-semibold uppercase">Funcionamento</p><p className="text-sm font-semibold tabular-nums">{roomConfig.horarioInicio} – {roomConfig.horarioFim}</p></div>
          <div><p className="clinical-field-label text-[10px] font-semibold uppercase">Modalidades</p><p className="text-sm font-semibold tabular-nums">{roomConfig.exames.length}</p></div>
          <Button type="button" variant="outline" size="sm" className="clinical-record-action ml-auto" disabled={busy || loading || !date} onClick={() => void loadRows()}><RefreshCw className="h-4 w-4" /> Atualizar</Button>
        </div>}
      </section>

      {roomConfig ? <>
        <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2" aria-label="Indicadores da fila do aparelho">
          {metrics.map(({ id, label, icon: Icon, tone }) => <button key={id} type="button" aria-pressed={queueFilter === id} disabled={!queueReady} onClick={() => { setQueueFilter(id); setExpandedId(null); }} className={`clinical-premium min-w-0 text-left p-2.5 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70 ${queueFilter === id ? "clinical-record-expanded ring-1 ring-primary/30" : ""}`}>
            <span className={`clinical-dock-icon clinical-tone-${tone}`}><Icon className="h-4 w-4" /></span>
            <span className="flex-1 min-w-0"><span className="block clinical-field-label text-[11px] leading-tight break-words">{label}</span><strong className="block text-lg leading-tight tabular-nums">{queueReady ? (queueGroups[id] || 0) : "—"}</strong></span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 hidden lg:block xl:hidden" aria-hidden="true" />
          </button>)}
        </section>

        {canBook && bookingOpen && <Card id="diagnostic-booking" className="clinical-premium">
          <CardContent className="p-3 space-y-3">
            <div className="flex items-center gap-2"><span className="clinical-dock-icon clinical-tone-teal"><CalendarDays className="h-4 w-4" /></span><div className="flex-1 min-w-0"><h2 className="text-sm font-semibold">Novo agendamento</h2><p className="text-xs text-muted-foreground break-words">{selectedRoomName}</p></div><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setBookingOpen(false)}>Recolher</Button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 min-w-0"><Label className="text-xs">Tipo de exame *</Label><Select value={selectedExamId} disabled={busy} onValueChange={value => { setSelectedExamId(value); setSlot(""); }}><SelectTrigger className="w-full"><SelectValue placeholder="Selecione o exame" /></SelectTrigger><SelectContent>{roomConfig.exames.map(exam => <SelectItem key={exam.id} value={exam.id}>{exam.tipoExame}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1 min-w-0"><Label className="text-xs">Profissional responsável pelo exame *</Label><Select value={responsibleId} onValueChange={setResponsibleId} disabled={!canBook || busy}><SelectTrigger className="w-full"><SelectValue placeholder="Selecione o responsável" /></SelectTrigger><SelectContent>{responsibleOptions.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1 min-w-0 sm:col-span-2"><Label className="text-xs">Buscar paciente (nome ou CPF) *</Label>
                <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input className="pl-9" disabled={busy} value={patientSearch} onChange={e => { setPatientSearch(e.target.value); setPatientId(""); setSelectedPatient(null); }} placeholder="Digite ao menos 3 caracteres" /></div>
                {patientId && selectedPatient && <p className="flex items-center gap-1 text-xs clinical-record-type"><CheckCircle2 className="h-3.5 w-3.5" /> Paciente selecionado</p>}
                {patients.length > 0 && !patientId && <div className="max-h-40 overflow-y-auto rounded-md border divide-y">{patients.map(p => <button key={p.id} type="button" disabled={busy} onClick={() => { setPatientId(p.id); setSelectedPatient(p); setPatientSearch(`${p.nome}${p.cpf ? " — "+p.cpf : ""}`); setPatients([]); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">{p.nome} <span className="text-muted-foreground">{p.cpf || ""}</span></button>)}</div>}
              </div>
            </div>
            {selectedExam && <div className="clinical-inset rounded-lg border p-2.5 grid grid-cols-3 gap-2">
              <div><p className="clinical-field-label text-[10px] font-semibold uppercase">Duração</p><p className="font-semibold text-sm">{selectedExam.duracaoSlot} min</p></div>
              <div><p className="clinical-field-label text-[10px] font-semibold uppercase">Contraste</p><p className="font-semibold text-sm">{selectedExam.exigeContraste === "sim" ? "Sim" : selectedExam.exigeContraste === "opcional" ? "Opcional" : "Não"}</p></div>
              <div><p className="clinical-field-label text-[10px] font-semibold uppercase">Prazo de resultado</p><p className="font-semibold text-sm">{selectedExam.prazoResultadoDias} dia(s)</p></div>
            </div>}
            {selectedExam?.exigePreparo && <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-950 dark:text-amber-100"><div className="flex items-center gap-2 font-semibold"><AlertCircle className="h-4 w-4 shrink-0" /> Orientações de preparo — {selectedExam.tipoExame}</div><p className="mt-1 whitespace-pre-wrap">{selectedExam.instrucoesPreparo || "A unidade exige preparo, mas ainda não cadastrou as instruções. Confirme com a equipe antes do agendamento."}</p></div>}
            <div className="space-y-1"><Label className="text-xs">Horário disponível *</Label><Select value={slot} disabled={busy || loading || rowError || !roomRows} onValueChange={setSlot}><SelectTrigger className="w-full sm:max-w-xs"><SelectValue placeholder="Selecione o horário" /></SelectTrigger><SelectContent>{slots.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
              <p className="text-xs text-muted-foreground">{loading || !roomRows ? "Verificando a disponibilidade..." : rowError ? "Ocupação não confirmada." : slots.length ? `${slots.length} horário(s) disponível(is) para a modalidade selecionada.` : "Nenhum horário disponível para a modalidade selecionada."}</p></div>
            <div className="flex justify-end border-t pt-2"><Button type="button" className="clinical-record-action clinical-action-main w-full sm:w-auto" onClick={createExam} disabled={!canBook || !responsible || saving || statusBusy || loading || rowError || !roomRows || !patientId || !slot || !selectedExam || !slots.includes(slot)}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />} Agendar exame</Button></div>
          </CardContent>
        </Card>}

        <section className="clinical-premium p-3 space-y-2" aria-label="Filtros da fila técnica">
          <div className="flex flex-wrap items-center gap-2">
            <span className="clinical-dock-icon clinical-tone-blue"><Clock3 className="h-4 w-4" /></span>
            <div className="flex-1 min-w-[8rem]"><h2 className="text-sm font-semibold">Fila técnica do aparelho</h2><p className="text-xs text-muted-foreground">{queueReady ? `${visibleRows.length} de ${rows.length} exame(s) · Ordem de horário` : "Aguardando confirmação da fila"}</p></div>
            {loading && <span className="flex items-center gap-1 text-xs text-muted-foreground" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Atualizando</span>}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar paciente, exame, responsável ou horário..." aria-label="Buscar na fila técnica" value={queueSearch} onChange={e => setQueueSearch(e.target.value)} /></div>
            <Button type="button" variant="outline" onClick={() => { setQueueFilter("all"); setQueueSearch(""); setExpandedId(null); }}>Limpar filtros</Button>
          </div>
          {queueFilter !== "all" && <p className="text-xs clinical-record-type font-medium">Filtro: {metrics.find(m => m.id === queueFilter)?.label}</p>}
        </section>

        {rowError ? <div className="clinical-premium p-5 text-center space-y-2 text-sm text-destructive"><AlertCircle className="h-7 w-7 mx-auto" /><p>Não foi possível confirmar a ocupação da sala.</p><Button variant="outline" size="sm" onClick={() => void loadRows()}>Tentar novamente</Button></div>
          : !roomRows ? <div className="clinical-premium p-6 text-center text-sm text-muted-foreground" role="status"><Loader2 className="mx-auto h-5 w-5 animate-spin mb-2" />Carregando fila do aparelho...</div>
          : visibleRows.length === 0 ? <div className="clinical-premium p-6 text-center space-y-2"><span className="clinical-dock-icon clinical-tone-slate mx-auto"><CalendarDays className="h-4 w-4" /></span><p className="font-semibold text-sm">{rows.length ? "Nenhum exame neste filtro." : "Nenhum exame agendado para esta data."}</p><p className="text-xs text-muted-foreground">{rows.length ? "Altere a busca ou limpe os filtros." : "Os agendamentos vinculados a este aparelho serão exibidos aqui."}</p>{rows.length ? <Button size="sm" variant="outline" onClick={() => { setQueueFilter("all"); setQueueSearch(""); }}>Ver todos</Button> : canBook && <Button size="sm" variant="outline" disabled={busy} onClick={() => setBookingOpen(true)}><Plus className="h-4 w-4" /> Novo agendamento</Button>}</div>
          : <div className="space-y-2">{visibleRows.map(row => {
              const status = getEffectiveDiagnosticStatus(row);
              const step = ["agendado", "paciente_chegou", "exame_realizado_em_laudo", "laudo_liberado"].indexOf(status);
              const initials = row.paciente_nome.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
              const expanded = expandedId === row.id;
              return <Card key={row.id} className={`clinical-premium ${expanded ? "clinical-record-expanded" : ""}`}>
                <CardContent className="p-3 space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <span className="clinical-dock-icon clinical-tone-blue treatment-avatar" aria-hidden="true">{initials || "—"}</span>
                    <div className="flex-1 min-w-0"><p className="font-semibold text-sm sm:text-base break-words [overflow-wrap:anywhere]">{row.paciente_nome}</p><p className="clinical-record-type font-semibold text-xs break-words">{row.custom_data?.exame_nome || "Exame diagnóstico"}</p><p className="text-xs text-muted-foreground break-words">{row.profissional_nome || "Responsável não informado"}</p></div>
                    <Badge variant={statusTone[status] as any || "secondary"} className="border text-xs whitespace-normal shrink-0 max-w-[42%] text-center">{getDiagnosticStatusLabel(status)}</Badge>
                  </div>
                  <div className="clinical-inset rounded-lg border p-2 grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2 items-center">
                    <div><p className="clinical-field-label text-[10px] font-semibold uppercase">Horário</p><p className="clinical-record-time text-left">{row.hora}</p>{row.custom_data?.duracao_slot_minutos && <p className="text-xs text-muted-foreground">{row.custom_data.duracao_slot_minutos} min</p>}</div>
                    {step >= 0 ? <div className="grid grid-cols-4 gap-1 text-center" aria-label={`Etapa: ${getDiagnosticStatusLabel(status)}`}>
                      {["Agendado", "Chegada", "Realizado", "Laudo"].map((label, i) => <div key={label} className="min-w-0"><div className={`h-1.5 rounded-full ${i <= step ? "bg-teal-600 dark:bg-teal-400" : "bg-muted-foreground/20"}`} /><span className={`block text-[10px] mt-1 leading-tight break-words ${i <= step ? "font-semibold clinical-record-type" : "text-muted-foreground"}`}>{label}</span></div>)}
                    </div> : <p className="text-xs font-medium text-muted-foreground">{getDiagnosticStatusLabel(status)}</p>}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button type="button" size="sm" variant="outline" className="clinical-record-action" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : row.id)}>Detalhes <ChevronDown className={`h-4 w-4 ${expanded ? "rotate-180" : ""}`} /></Button>
                    <div className="flex flex-wrap gap-2 ml-auto">
                      {status === "agendado" && canArrive && <Button disabled={busy || row.data > dateToday()} size="sm" className="clinical-record-action clinical-action-main" onClick={() => void changeStatus(row, "paciente_chegou")}><UserCheck className="h-4 w-4" />Paciente chegou</Button>}
                      {status === "paciente_chegou" && canPerform && <Button disabled={busy || row.data > dateToday()} size="sm" className="clinical-record-action clinical-action-main" onClick={() => void changeStatus(row, "exame_realizado_em_laudo")}><CheckCircle2 className="h-4 w-4" />Exame realizado</Button>}
                      {status === "exame_realizado_em_laudo" && canWriteReport && <Button disabled={busy || row.data > dateToday()} size="sm" className="clinical-record-action clinical-action-main" onClick={() => openLaudo(row)}><FileText className="h-4 w-4" />Laudar / liberar</Button>}
                      {status === "laudo_liberado" && <><span className="inline-flex items-center gap-1 text-xs font-semibold clinical-record-type"><CheckCircle2 className="h-4 w-4" />Laudo liberado</span><Button type="button" size="sm" variant="outline" className="clinical-record-action" onClick={() => printLaudo(row)}><Printer className="h-4 w-4" />Imprimir laudo</Button></>}
                    </div>
                  </div>
                  {expanded && <div className="clinical-inset rounded-lg border p-2.5 space-y-2">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      <div className="min-w-0"><p className="clinical-field-label text-[10px] uppercase font-semibold">Responsável agendado</p><p className="font-medium break-words">{row.profissional_nome || "Não informado"}</p></div>
                      <div><p className="clinical-field-label text-[10px] uppercase font-semibold">Contraste</p><p className="font-medium">{row.custom_data?.exige_contraste === "sim" ? "Sim" : row.custom_data?.exige_contraste === "opcional" ? "Opcional" : row.custom_data?.exige_contraste === "nao" ? "Não" : "Não informado"}</p></div>
                      <div><p className="clinical-field-label text-[10px] uppercase font-semibold">Prazo cadastrado</p><p className="font-medium">{row.custom_data?.prazo_resultado_dias != null ? `${row.custom_data.prazo_resultado_dias} dia(s)` : "Não informado"}</p></div>
                    </div>
                    {row.custom_data?.exige_preparo && <div className="border-t pt-2 text-xs"><p className="font-semibold">Preparo registrado</p><p className="whitespace-pre-wrap break-words text-muted-foreground">{row.custom_data?.preparo_instrucoes || "Orientações não cadastradas."}</p></div>}
                  </div>}
                </CardContent>
              </Card>;
            })}</div>}

        <Dialog open={!!laudoRow && canWriteReport} onOpenChange={open => { if (!open && !statusBusy) setLaudoRow(null); }}>
          {laudoRow && <DialogContent className="clinical-premium max-w-2xl p-0 gap-0 bg-card motion-reduce:animate-none" onEscapeKeyDown={e => { if (statusBusy) e.preventDefault(); }} onPointerDownOutside={e => e.preventDefault()}>
            <div className="clinical-patient-hero flex items-center gap-3 pr-12"><span className="clinical-patient-avatar flex items-center justify-center shrink-0"><Stethoscope className="h-5 w-5" /></span><div className="min-w-0"><p className="clinical-hub-eyebrow">Documentação diagnóstica</p><DialogTitle className="clinical-hub-name text-lg">Laudo de exame</DialogTitle><DialogDescription className="clinical-patient-sub text-xs mt-1 break-words">{laudoRow.paciente_nome} · {laudoRow.custom_data?.exame_nome || "Exame diagnóstico"} · {laudoRow.hora}</DialogDescription></div></div>
            <div className="p-3 sm:p-4 space-y-3">
              {!reportStillAvailable && <div className="rounded-md border border-amber-300 dark:border-amber-800 p-2 text-xs text-muted-foreground">A etapa não está confirmada na fila atual. Aguarde a atualização ou reabra o exame antes de liberar.</div>}
              <div className="space-y-1"><Label className="text-xs">Descrição / Achados</Label><Textarea rows={4} disabled={statusBusy} value={laudo.descricao} onChange={e => setLaudo(p => ({ ...p, descricao: e.target.value }))} /></div>
              <div className="space-y-1"><Label className="text-xs">Conclusão *</Label><Textarea rows={3} disabled={statusBusy} value={laudo.conclusao} onChange={e => setLaudo(p => ({ ...p, conclusao: e.target.value }))} /></div>
              <div className="space-y-1"><Label className="text-xs">Hipótese / Impressão</Label><Textarea rows={2} disabled={statusBusy} value={laudo.hipotese} onChange={e => setLaudo(p => ({ ...p, hipotese: e.target.value }))} /></div>
              <div className="clinical-inset rounded-lg border p-3 space-y-2"><Label className="text-xs">CRM do laudista *</Label><Input disabled={statusBusy} value={laudo.crm} onChange={e => setLaudo(p => ({ ...p, crm: e.target.value }))} placeholder="Número/UF" /><p className="text-xs text-muted-foreground">A liberação grava profissional, CRM, data/hora e histórico de status na trilha auditável do agendamento.</p></div>
            </div>
            <div className="sticky bottom-0 bg-card border-t p-3 flex flex-wrap justify-end gap-2"><Button disabled={statusBusy} variant="outline" onClick={() => setLaudoRow(null)}>Cancelar</Button><Button className="clinical-record-action clinical-action-main" disabled={statusBusy || saving || !canWriteReport || !reportStillAvailable || !laudo.conclusao.trim() || !laudo.crm.trim()} onClick={() => void changeStatus(laudoRow, "laudo_liberado")}>{statusBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Liberar Laudo Oficial</Button></div>
          </DialogContent>}
        </Dialog>
      </> : <section className="clinical-premium p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="clinical-inset border rounded-xl p-3 shrink-0 flex items-center justify-center w-28 h-24" aria-hidden="true"><svg viewBox="0 0 96 76" className="w-full h-full" fill="none"><rect x="13" y="8" width="70" height="46" rx="7" stroke="var(--cp-blue)" strokeWidth="2.5" /><path d="M21 32h13l7-13 9 25 8-12h17" stroke="var(--cp-teal)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M48 54v11m-15 0h30" stroke="var(--cp-blue)" strokeWidth="2.5" strokeLinecap="round"/><circle cx="75" cy="15" r="2" fill="var(--cp-teal)"/></svg></div>
          <div className="flex-1 min-w-0 text-center sm:text-left space-y-1.5">
            <h2 className="font-semibold text-sm">{metadataLoading ? "Carregando aparelhos..." : !selectedUnit ? "Selecione uma unidade" : unitAllowed && metadata && diagnosticRooms.length === 0 ? "Nenhum aparelho diagnóstico configurado" : "Selecione um aparelho"}</h2>
            <p className="text-sm text-muted-foreground">{metadataLoading ? "Consultando a configuração da unidade." : unitAllowed && metadata && diagnosticRooms.length === 0 ? "Cadastre ou configure um aparelho ativo em Unidades e Salas. Apenas salas com finalidade diagnóstica aparecem aqui." : selectedUnit && selectedRoom ? "Esta sala não está configurada como aparelho de diagnóstico." : "Selecione a unidade, o aparelho e a data para acompanhar a fila técnica, agendar exames e trabalhar com laudos."}</p>
            {unitAllowed && !metadata && !metadataLoading && <Button size="sm" variant="outline" onClick={() => void loadUnitMetadata()}>Tentar carregar aparelhos</Button>}
            <p className="text-xs clinical-field-label">Os exames comuns continuam na Agenda Geral.</p>
          </div>
        </div>
      </section>}
    </div>
  );
}
