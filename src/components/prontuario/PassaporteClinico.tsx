import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IdCard } from "lucide-react";
import { ACTIVE_TREATMENT_CYCLE_STATUSES } from "@/lib/treatmentCycleStatus";
import { todayLocalStr } from "@/lib/utils";
import { strictSpecialtyOf } from "@/lib/localizarVagas";

/** Resumo clínico sob demanda. O banco aplica as políticas de leitura existentes. */
export default function PassaporteClinico({ patientId, professionalId, profession, enabled }: { patientId: string; professionalId: string; profession: string; enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const { data, error, isPending } = useQuery({
    queryKey: ["passaporte-clinico", patientId, professionalId, profession],
    enabled: enabled && open && !!patientId,
    staleTime: 30000,
    queryFn: async () => {
      const today = todayLocalStr();
      const start = new Date(`${today}T12:00:00`);
      start.setDate(start.getDate() - 90);
      const from = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
      const [patientResult, cycleResult, historyResult, attendanceResult, recentAppointments] = await Promise.all([
        supabase.from("pacientes").select("id,nome,is_pne,is_autista,is_tfd,possui_ordem_judicial,mobilidade").eq("id", patientId).single(),
        supabase.from("treatment_cycles").select("id,specialty,treatment_type,total_sessions,sessions_done,status")
          .eq("patient_id", patientId).in("status", [...ACTIVE_TREATMENT_CYCLE_STATUSES]).limit(30),
        supabase.from("prontuarios").select("profissional_id,profissional_nome,agendamento_id,data_atendimento,conduta,evolucao")
          .eq("paciente_id", patientId).neq("profissional_id", professionalId)
          .order("data_atendimento", { ascending: false }).limit(20),
        supabase.from("agendamentos").select("status").eq("paciente_id", patientId)
          .gte("data", from).lte("data", today).limit(500),
        supabase.from("agendamentos").select("id").eq("paciente_id", patientId)
          .order("data", { ascending: false }).limit(30),
      ]);
      for (const result of [patientResult, cycleResult, historyResult, attendanceResult, recentAppointments]) if (result.error) throw result.error;
      const cycles = cycleResult.data || [];
      const names = [...new Set((historyResult.data || []).map((item) => item.profissional_id))];
      const { data: colleagues, error: colleaguesError } = names.length
        ? await supabase.from("funcionarios").select("id,profissao").in("id", names)
        : { data: [], error: null };
      if (colleaguesError) throw colleaguesError;
      const professionById = new Map((colleagues || []).map((item) => [item.id, item.profissao]));
      const linkedIds = (historyResult.data || []).map((item) => item.agendamento_id).filter((id): id is string => !!id);
      const { data: completed, error: completedError } = linkedIds.length
        ? await supabase.from("agendamentos").select("id").in("id", linkedIds).eq("status", "concluido")
        : { data: [], error: null };
      if (completedError) throw completedError;
      const completedIds = new Set((completed || []).map((item) => item.id));
      const recentIds = (recentAppointments.data || []).map((item) => item.id);
      const { data: triages, error: triageError } = recentIds.length
        ? await supabase.from("triage_records").select("alergias,confirmado_em").in("agendamento_id", recentIds)
          .not("confirmado_em", "is", null).order("confirmado_em", { ascending: false }).limit(30)
        : { data: [], error: null };
      if (triageError) throw triageError;
      const knownAllergies = (triages || []).find((item) => (item.alergias || []).length)?.alergias || [];
      const ownArea = strictSpecialtyOf(profession);
      const lastOtherArea = ownArea && (historyResult.data || []).find((item) =>
        !!item.agendamento_id && completedIds.has(item.agendamento_id)
          && !!(item.conduta || item.evolucao)
          && !!strictSpecialtyOf(professionById.get(item.profissional_id))
          && strictSpecialtyOf(professionById.get(item.profissional_id)) !== ownArea,
      );
      const assessed = (attendanceResult.data || []).filter((a) => ["concluido", "falta"].includes(a.status));
      const presence = assessed.filter((a) => a.status === "concluido").length;
      return { patient: patientResult.data!, cycles, last: lastOtherArea, allergies: knownAllergies,
        attendance: assessed.length ? { presence, total: assessed.length } : null,
        attendanceLimited: (attendanceResult.data || []).length === 500 };
    },
  });

  if (!enabled || !patientId) return null;
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button type="button" size="sm" variant="outline" aria-label="Abrir passaporte clínico do paciente"><IdCard className="w-4 h-4 mr-1" /> Passaporte clínico</Button></PopoverTrigger>
    <PopoverContent align="start" className="w-[min(92vw,24rem)] max-h-[70vh] overflow-y-auto space-y-3 text-sm">
      <h3 className="font-semibold">Resumo clínico · {data?.patient.nome || "Paciente"}</h3>
      {isPending ? <p>Carregando informações autorizadas…</p> : error ? <p role="status" className="text-destructive">Não foi possível confirmar os dados clínicos.</p> : data && <>
        <div className="flex gap-1 flex-wrap" aria-label="Condições registradas">
          {data.patient.is_pne && <Badge variant="outline">PCD</Badge>}
          {data.patient.is_autista && <Badge variant="outline">Autismo</Badge>}
          {data.patient.is_tfd && <Badge variant="outline">TFD</Badge>}
          {data.patient.possui_ordem_judicial && <Badge variant="outline">Ordem judicial</Badge>}
          {data.patient.mobilidade && <Badge variant="outline">Mobilidade: {data.patient.mobilidade}</Badge>}
          {data.allergies.length > 0 && <Badge variant="outline">Alergias em triagem: {data.allergies.join(", ")} (reconfirmar)</Badge>}
          {!data.patient.is_pne && !data.patient.is_autista && !data.patient.is_tfd && !data.patient.possui_ordem_judicial && !data.patient.mobilidade && !data.allergies.length && <span className="text-muted-foreground">Sem alertas identificados nos registros consultados; confirme alergias diretamente com o paciente.</span>}
        </div>
        <div><p className="font-medium">Tratamentos ativos</p>{data.cycles.length ? data.cycles.map((c) => <p key={c.id}>{c.specialty || c.treatment_type || "Especialidade não identificada"}: {c.sessions_done}/{c.total_sessions} sessões registradas</p>) : <p className="text-muted-foreground">Nenhum ciclo ativo visível.</p>}</div>
        <div><p className="font-medium">Registro de outra área</p>{data.last && (data.last.conduta || data.last.evolucao) ? <p className="line-clamp-3">{data.last.data_atendimento} · {data.last.profissional_nome}: {data.last.conduta || data.last.evolucao}</p> : <p className="text-muted-foreground">Sem conduta de outra área identificável nos registros recentes.</p>}</div>
        <div><p className="font-medium">Comparecimento nos últimos 90 dias</p><p>{data.attendance && !data.attendanceLimited ? `${data.attendance.presence} de ${data.attendance.total} atendimentos concluídos ou faltas (${Math.round(data.attendance.presence / data.attendance.total * 100)}%)` : "Dados insuficientes para calcular com segurança"}</p></div>
        <p className="text-xs text-muted-foreground">Resumo dos registros acessíveis a este perfil. Confira o histórico antes de decisões clínicas; não substitui evolução nem avaliação.</p>
      </>}
    </PopoverContent>
  </Popover>;
}
