import { supabase } from "@/integrations/supabase/client";
import { classifyTreatmentCapacitySpecialty, eligibleEvaluationRequests, extractExplicitCboCode, type QueueDemandInput } from "@/lib/treatmentCapacityAnalytics";
import { planInitialEvaluations, type CapacityPlanningInput, type EvaluationSlot } from "@/lib/treatmentCapacityPlanning";
import { addDaysToDateStr, nowMinutesInBrazil, todayLocalStr } from "@/lib/utils";
import { resolveProfessionalCbo } from "@/lib/sigtapClinicalValidation";
import { statusOcupaVaga } from "@/lib/appointmentCapacity";

export interface RegulationScope {
  professionalId: string;
  unitId: string;
  specialty: string;
  days: number;
  candidates?: { id: string; name: string; requestDate: string | null }[];
}
export interface RegulationSelection extends RegulationScope { date: string; time: string; requestId?: string; patientId?: string }

async function pages<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const result: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await query(from, from + 499);
    if (error || !data) throw error || new Error("Leitura incompleta");
    result.push(...data);
    if (data.length < 500) return result;
  }
}

/** Nova leitura no Localizar Vagas e antes do salvamento pelo formulário oficial. */
export async function readRegulationCapacity(scope: RegulationScope, requestId?: string) {
  const today = todayLocalStr();
  const end = addDaysToDateStr(today, scope.days + 20);
  const { professionalId: id, unitId } = scope;
  const [staff, grades, occupied, blocks, quotas, cycles] = await Promise.all([
    supabase.from("funcionarios").select("id,nome,unidade_id,profissao,custom_data,tempo_atendimento").eq("id", id).eq("ativo", true).eq("role", "profissional").single(),
    pages((a,b) => supabase.from("disponibilidades").select("id,data_inicio,data_fim,hora_inicio,hora_fim,dias_semana,vagas_por_dia,vagas_por_hora").eq("profissional_id",id).eq("unidade_id",unitId).gte("data_fim",today).lte("data_inicio",end).order("id").range(a,b)),
    pages((a,b) => supabase.from("agendamentos").select("id,data,hora,status,origem").eq("profissional_id",id).eq("unidade_id",unitId).gte("data",today).lte("data",end).order("id").range(a,b)),
    pages((a,b) => supabase.from("bloqueios").select("id,data_inicio,data_fim,dia_inteiro,hora_inicio,hora_fim,unidade_id,profissional_id").gte("data_fim",today).lte("data_inicio",end).order("id").range(a,b)),
    pages((a,b) => supabase.from("quotas_externas").select("id,ativo,profissional_interno_id,unidade_id,periodo_inicio,periodo_fim,dia_semana,turno,horario_inicio,horario_fim,vagas_total,vagas_usadas").eq("profissional_interno_id",id).eq("unidade_id",unitId).eq("ativo",true).gte("periodo_fim",today).lte("periodo_inicio",end).order("id").range(a,b)),
    pages((a,b) => supabase.from("treatment_cycles").select("id").eq("professional_id",id).eq("unit_id",unitId).eq("status","em_andamento").order("id").range(a,b)),
  ]);
  if (staff.error || !staff.data || classifyTreatmentCapacitySpecialty(staff.data.profissao) !== scope.specialty) throw new Error("Profissional indisponível nesta especialidade");
  const professional = { id, unitId, name: staff.data.nome, profession: staff.data.profissao || "", cboCode: resolveProfessionalCbo(staff.data), appointmentDurationMinutes: staff.data.tempo_atendimento };
  const pendingSessions: CapacityPlanningInput["pendingSessions"] = [];
  for (let i=0; i<cycles.length; i+=100) {
    const rows = await pages((a,b) => supabase.from("treatment_sessions").select("id,professional_id,scheduled_date,appointment_id").in("cycle_id",cycles.slice(i,i+100).map(c=>c.id)).eq("status","pendente_agendamento").order("id").range(a,b));
    for (const s of rows) pendingSessions.push({ professionalId: s.professional_id || id, unitId, cycleStatus: "em_andamento", status: "pendente_agendamento", scheduledDate: s.scheduled_date, appointmentId: s.appointment_id });
  }
  const input: CapacityPlanningInput = { today, endDate:end, periodDates:[], professionals:[professional], queueDemand:[], pendingSessions, externalQuotas:quotas,
    availabilities: grades.map(g => ({ professionalId:id, unitId, startDate:g.data_inicio, endDate:g.data_fim, weekdays:g.dias_semana, vacanciesPerDay:g.vagas_por_dia, vacanciesPerHour:g.vagas_por_hora, startTime:g.hora_inicio,endTime:g.hora_fim })),
    appointments:occupied.map(a=>({professionalId:id,unitId,date:a.data,time:a.hora,status:a.status,origin:a.origem})),
    blocks:blocks.map(b=>({unitId:b.unidade_id,professionalId:b.profissional_id,startDate:b.data_inicio,endDate:b.data_fim,allDay:b.dia_inteiro ?? (!b.hora_inicio || !b.hora_fim), startTime:b.hora_inicio,endTime:b.hora_fim})),
  };
  const plan = planInitialEvaluations(input, professional, scope.days, nowMinutesInBrazil());
  let patientId: string | undefined;
  if (requestId) {
    const { data:q,error } = await supabase.from("fila_espera").select("id,paciente_id,status,unidade_id,profissional_id,especialidade_destino,custom_data").eq("id",requestId).eq("unidade_id",unitId).single();
    if (error || !q) throw new Error("Solicitação indisponível");
    const [direct, booked, active] = await Promise.all([
      supabase.from("agendamentos").select("id").eq("id",requestId).maybeSingle(),
      pages((a,b)=>supabase.from("agendamentos").select("id,status,profissional_id").eq("unidade_id",unitId).eq("paciente_id",q.paciente_id).gte("data",today).order("id").range(a,b)),
      pages((a,b)=>supabase.from("treatment_cycles").select("id,specialty").eq("patient_id",q.paciente_id).eq("unit_id",unitId).in("status",["em_andamento","aguardando_vaga","em_fila"]).order("id").range(a,b)),
    ]);
    if (direct.error) throw direct.error;
    const otherIds = [...new Set(booked.filter(a=>statusOcupaVaga(a.status)).map(a=>a.profissional_id))];
    let linked = q.status === "apto_agendamento" ? false : !!direct.data;
    for (let i=0;i<otherIds.length;i+=100) {
      const ids = otherIds.slice(i,i+100);
      const staff = await supabase.from("funcionarios").select("id,profissao").in("id",ids);
      if (staff.error) throw staff.error;
      linked ||= staff.data.length !== ids.length || staff.data.some(p=>!p.profissao || classifyTreatmentCapacitySpecialty(p.profissao)===scope.specialty);
    }
    const row: QueueDemandInput = { id:q.id, patientId:q.paciente_id, unitId, professionalId:q.profissional_id, status:q.status, destinationProfession:q.especialidade_destino, cboCode:extractExplicitCboCode(q.custom_data,q.especialidade_destino),
      linkedToAppointment:linked, inTreatment:active.some(c=>!c.specialty || classifyTreatmentCapacitySpecialty(c.specialty)===scope.specialty) };
    patientId = eligibleEvaluationRequests([row],professional,today)[0]?.patientId;
    if (!patientId) throw new Error("A solicitação já possui atendimento ou não está mais apta para esta vaga.");
  }
  return { offers: plan.offers, patientId };
}

export function containsEvaluationSlot(offers: EvaluationSlot[], date: string, time: string) {
  return offers.some(slot => slot.date === date && slot.time === time);
}
