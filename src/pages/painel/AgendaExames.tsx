import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { useOperacional } from "@/contexts/OperacionalContext";
import { auditService } from "@/services/auditService";
import { generateSignature } from "@/lib/documentSignature";
import { whatsappService } from "@/services/whatsappService";
import {
  canTransitionDiagnosticExam,
  getAvailableDiagnosticSlots,
  getDiagnosticRoomConfig,
  getDiagnosticStatusLabel,
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
  const { unidades, salas } = useOperacional();
  const [selectedUnit, setSelectedUnit] = useState(user?.unidadeId || "");
  const [selectedRoom, setSelectedRoom] = useState("");
  const [selectedExamId, setSelectedExamId] = useState("");
  const [date, setDate] = useState(dateToday());
  const [unitMetadata, setUnitMetadata] = useState<Record<string, any>>({});
  const [rows, setRows] = useState<ExamRow[]>([]);
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
  const rooms = useMemo(() => salas.filter(s => s.unidadeId === selectedUnit && s.ativo), [salas, selectedUnit]);
  const roomConfig = useMemo<DiagnosticRoomConfig | null>(
    () => selectedRoom ? getDiagnosticRoomConfig(unitMetadata, selectedRoom) : null,
    [unitMetadata, selectedRoom],
  );

  const selectedExam = useMemo<DiagnosticExamConfig | null>(
    () => roomConfig?.exames.find(exam => exam.id === selectedExamId) || null,
    [roomConfig, selectedExamId],
  );

  const loadUnitMetadata = useCallback(async () => {
    if (!selectedUnit) { setUnitMetadata({}); return; }
    const { data, error } = await supabase.from("unidades" as any).select("custom_data").eq("id", selectedUnit).maybeSingle();
    if (error) { toast.error("Não foi possível carregar a configuração da unidade."); return; }
    setUnitMetadata(((data as any)?.custom_data || {}) as Record<string, any>);
  }, [selectedUnit]);

  const loadRows = useCallback(async () => {
    if (!selectedUnit || !selectedRoom || !date) { setRows([]); return; }
    setLoading(true);
    const { data, error } = await (supabase as any).from("agendamentos").select("*")
      .eq("unidade_id", selectedUnit).eq("sala_id", selectedRoom).eq("data", date)
      .eq("tipo", "exame").order("hora", { ascending: true });
    setLoading(false);
    if (error) { toast.error("Não foi possível carregar a fila do aparelho."); return; }
    setRows(((data || []) as ExamRow[]).filter(isDiagnosticAppointment));
  }, [selectedUnit, selectedRoom, date]);

  useEffect(() => { void loadUnitMetadata(); }, [loadUnitMetadata]);
  useEffect(() => { void loadRows(); }, [loadRows]);

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

  const occupied = useMemo(() => rows.map(r => ({
    id: r.id, hora: r.hora, status: r.status, custom_data: r.custom_data,
  })), [rows]);
  const slots = useMemo(
    () => roomConfig && selectedExam ? getAvailableDiagnosticSlots({ ...roomConfig, duracaoSlot: selectedExam.duracaoSlot }, occupied) : [],
    [roomConfig, selectedExam, occupied],
  );

  const createExam = async () => {
    if (!roomConfig || !selectedExam || !patientId || !slot || !selectedUnit || !selectedRoom) {
      toast.error("Selecione paciente, sala e horário.");
      return;
    }
    const patient = selectedPatient;
    if (!patient || patient.id !== patientId) { toast.error("Selecione novamente o paciente."); return; }
    setSaving(true);
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
      profissional_id: user?.id || "", profissional_nome: user?.nome || "Equipe de Diagnóstico",
      data: date, hora: slot, status: "confirmado", tipo: "exame",
      observacoes: selectedExam.exigePreparo ? selectedExam.instrucoesPreparo : "",
      origem: "recepcao", criado_por: user?.id || "", custom_data: custom,
    });
    setSaving(false);
    if (error) { toast.error(error.message || "Não foi possível agendar o exame."); return; }
    void auditService.log({
      acao: "agendamento_exame_diagnostico", modulo: "exames_diagnosticos", entidade: "agendamentos",
      entidadeId: id, pacienteId: patient.id, pacienteNome: patient.nome, unidadeId: selectedUnit,
      user: user ? { id: user.id, nome: user.nome, role: user.role, unidadeId: user.unidadeId } : null,
      detalhes: { sala_id: selectedRoom, exame: selectedExam.tipoExame, data: date, hora: slot },
    });
    setPatientId(""); setSelectedPatient(null); setPatientSearch(""); setSlot("");
    toast.success("Exame agendado.");
    await loadRows();
  };

  const changeStatus = async (row: ExamRow, next: DiagnosticExamStatus) => {
    const current = String(row.custom_data?.status_exame || "agendado");
    if (!canTransitionDiagnosticExam(current, next)) { toast.error("Transição de status não permitida."); return; }
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
      let professionalQuery = (supabase as any).from("funcionarios").select("tipo_conselho,numero_conselho,uf_conselho").eq("ativo", true);
      professionalQuery = (user as any)?.authUserId
        ? professionalQuery.eq("auth_user_id", (user as any).authUserId)
        : professionalQuery.eq("id", user?.id || "");
      const { data: professional, error: professionalError } = await professionalQuery.maybeSingle();
      const registeredCrm = professional?.tipo_conselho && String(professional.tipo_conselho).toUpperCase().includes("CRM")
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
    const { error } = await (supabase as any).from("agendamentos").update({ custom_data: nextCustom }).eq("id", row.id)
      .eq("unidade_id", selectedUnit).eq("sala_id", selectedRoom);
    if (error) { toast.error("Não foi possível atualizar o exame."); return; }
    void auditService.log({
      acao: next === "laudo_liberado" ? "laudo_exame_liberado" : "status_exame_alterado",
      modulo: "exames_diagnosticos", entidade: "agendamentos", entidadeId: row.id,
      agendamentoId: row.id, pacienteId: row.paciente_id, pacienteNome: row.paciente_nome,
      unidadeId: selectedUnit, profissionalId: user?.id, profissionalNome: user?.nome,
      user: user ? { id: user.id, nome: user.nome, role: user.role, unidadeId: user.unidadeId } : null,
      detalhes: { status_anterior: current, status_novo: next, crm: next === "laudo_liberado" ? laudo.crm : undefined },
    });
    if (next === "laudo_liberado") {
      const { data: patient } = await (supabase as any).from("pacientes").select("telefone,email").eq("id", row.paciente_id).maybeSingle();
      if (patient?.email) {
        const { error: emailError } = await supabase.functions.invoke("send-email", { body: {
          evento: "laudo_liberado", paciente_nome: row.paciente_nome, email: patient.email,
          telefone: patient.telefone || "", data_consulta: row.data,
          hora_consulta: row.hora, unidade: unidades.find(u => u.id === selectedUnit)?.nome || "",
          profissional: user?.nome || "", tipo_atendimento: row.custom_data?.exame_nome || "Exame diagnóstico",
          status_agendamento: "laudo_liberado", id_agendamento: row.id,
        } });
        if (emailError) toast.warning("Laudo liberado, mas o e-mail não foi confirmado.");
      }
      if (patient?.telefone) {
        const message = `Olá, ${row.paciente_nome}. Seu laudo do exame de ${row.custom_data?.exame_nome || "diagnóstico"} realizado na unidade ${unidades.find(u => u.id === selectedUnit)?.nome || ""} já está disponível. Acesse o Portal do Paciente ou procure a recepção.`;
        const sent = await whatsappService.sendDirect({
          tipo: "laudo_liberado", telefone: patient.telefone, paciente_nome: row.paciente_nome,
          unidade: unidades.find(u => u.id === selectedUnit)?.nome || "", unidade_id: selectedUnit,
          observacoes: message, mensagem_custom: message,
        });
        if (sent.error) toast.warning("Laudo liberado, mas a notificação WhatsApp não foi confirmada.");
      }
      setLaudoRow(null); setLaudo({ descricao: "", conclusao: "", hipotese: "", crm: "" });
    }
    toast.success(next === "laudo_liberado" ? "Laudo liberado oficialmente." : "Status atualizado.");
    await loadRows();
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
  const canWriteReport = canWorkUnit && String(user?.role || "").toLowerCase() === "profissional";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Agenda de Exames</h1><p className="text-sm text-muted-foreground">Agendamento por aparelho, fila técnica e liberação de laudos</p></div>
        <Badge variant="outline">Módulo por sala</Badge>
      </div>

      <Card><CardContent className="grid gap-3 p-4 md:grid-cols-3">
        <div><Label>Unidade</Label><Select value={selectedUnit} onValueChange={v => { setSelectedUnit(v); setSelectedRoom(""); }}>
          <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
          <SelectContent>{visibleUnits.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
        </Select></div>
        <div><Label>Aparelho / Sala</Label><Select value={selectedRoom} onValueChange={value => { setSelectedRoom(value); setSelectedExamId(""); setSlot(""); }}>
          <SelectTrigger><SelectValue placeholder="Selecione o aparelho" /></SelectTrigger>
          <SelectContent>{rooms.filter(r => getDiagnosticRoomConfig(unitMetadata, r.id)).map(r => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}</SelectContent>
        </Select></div>
        <div><Label>Data</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
      </CardContent></Card>

      {roomConfig ? <>
        <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Novo agendamento — {selectedExam?.tipoExame || "Selecione o exame"}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Tipo de exame *</Label><Select value={selectedExamId} onValueChange={value => { setSelectedExamId(value); setSlot(""); }}><SelectTrigger><SelectValue placeholder="Selecione o exame" /></SelectTrigger><SelectContent>{roomConfig.exames.map(exam => <SelectItem key={exam.id} value={exam.id}>{exam.tipoExame}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="md:col-span-2"><Label>Buscar paciente (nome ou CPF)</Label>
                <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={patientSearch} onChange={e => { setPatientSearch(e.target.value); setPatientId(""); setSelectedPatient(null); }} placeholder="Digite ao menos 3 caracteres" /></div>
                {patients.length > 0 && <div className="mt-1 max-h-40 overflow-y-auto rounded-md border">{patients.map(p => <button key={p.id} type="button" onClick={() => { setPatientId(p.id); setSelectedPatient(p); setPatientSearch(`${p.nome}${p.cpf ? " — "+p.cpf : ""}`); setPatients([]); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">{p.nome} <span className="text-muted-foreground">{p.cpf || ""}</span></button>)}</div>}
              </div>
              <div><Label>Horário disponível</Label><Select value={slot} onValueChange={setSlot}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{slots.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            </div>
            {selectedExam?.exigePreparo && <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>Orientações de preparo — {selectedExam.tipoExame}</strong><p className="mt-1 whitespace-pre-wrap">{selectedExam.instrucoesPreparo || "A unidade exige preparo, mas ainda não cadastrou as instruções. Confirme com a equipe antes do agendamento."}</p></div>}
            <p className="text-xs text-muted-foreground">Duração: {selectedExam?.duracaoSlot || "—"} min • Contraste: {selectedExam?.exigeContraste || "—"} • Resultado: {selectedExam?.prazoResultadoDias || 0} dia(s)</p>
            <Button onClick={createExam} disabled={saving || !patientId || !slot || !selectedExam}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Agendar exame</Button>
          </CardContent>
        </Card>

        <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock3 className="h-4 w-4" /> Fila do aparelho — {rows.length}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {loading ? <div className="py-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum exame agendado para esta data.</p> : rows.map(row => {
              const status = String(row.custom_data?.status_exame || "agendado");
              return <div key={row.id} className="flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong>{row.hora}</strong><Badge variant={statusTone[status] as any || "secondary"}>{getDiagnosticStatusLabel(status)}</Badge></div><p className="font-medium">{row.paciente_nome}</p><p className="text-xs text-muted-foreground">{row.custom_data?.exame_nome || "Exame diagnóstico"}</p></div>
                <div className="flex flex-wrap gap-2">
                  {status === "agendado" && <Button size="sm" variant="outline" onClick={() => void changeStatus(row, "paciente_chegou")}>Paciente chegou</Button>}
                  {status === "paciente_chegou" && <Button size="sm" onClick={() => void changeStatus(row, "exame_realizado_em_laudo")}>Exame realizado</Button>}
                  {status === "exame_realizado_em_laudo" && canWriteReport && <Button size="sm" onClick={() => openLaudo(row)}><FileText className="mr-1 h-4 w-4" />Laudar / liberar</Button>}
                  {status === "laudo_liberado" && <Badge variant="outline"><CheckCircle2 className="mr-1 h-3 w-3" />Laudo liberado</Badge>}
                </div>
              </div>;
            })}
          </CardContent>
        </Card>

        {laudoRow && <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Stethoscope className="h-4 w-4" /> Laudo — {laudoRow.paciente_nome}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Descrição / Achados</Label><Textarea rows={4} value={laudo.descricao} onChange={e => setLaudo(p => ({ ...p, descricao: e.target.value }))} /></div>
            <div><Label>Conclusão *</Label><Textarea rows={3} value={laudo.conclusao} onChange={e => setLaudo(p => ({ ...p, conclusao: e.target.value }))} /></div>
            <div><Label>Hipótese / Impressão</Label><Textarea rows={2} value={laudo.hipotese} onChange={e => setLaudo(p => ({ ...p, hipotese: e.target.value }))} /></div>
            <div><Label>CRM do laudista *</Label><Input value={laudo.crm} onChange={e => setLaudo(p => ({ ...p, crm: e.target.value }))} placeholder="CRM/UF e número" /></div>
            <div className="flex flex-wrap gap-2"><Button onClick={() => void changeStatus(laudoRow, "laudo_liberado")}>Liberar Laudo Oficial</Button><Button variant="outline" onClick={() => setLaudoRow(null)}>Cancelar</Button></div>
            <p className="text-xs text-muted-foreground">A liberação grava o profissional, CRM, data/hora e histórico de status na trilha auditável do agendamento.</p>
          </CardContent>
        </Card>}
      </> : <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
        {selectedUnit && selectedRoom ? "Esta sala não está configurada como aparelho de diagnóstico." : "Selecione uma unidade e uma sala configurada como aparelho diagnóstico."}
      </CardContent></Card>}
    </div>
  );
}
