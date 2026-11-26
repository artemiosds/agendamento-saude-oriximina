/** Relatório de alta: fontes verificáveis, sem inferência de resultados clínicos. */
export const ALTA_NOTE_TYPES = ["avaliacao_inicial","consulta","retorno","reavaliacao","sessao","procedimento","visita_domiciliar"] as const;
export const ALTA_NOTE_STATUS = ["finalizado","concluido","validado","emitido"] as const;
export const ALTA_SESSION_STATUS = ["realizada","falta","paciente_faltou"] as const;

export type AltaNote = {
  id: string; paciente_id: string; profissional_id: string; profissional_nome: string;
  unidade_id: string; data_atendimento: string; tipo_registro: string; status: string | null;
  hipotese: string | null; procedimentos_texto: string | null; queixa_principal: string | null;
  evolucao: string | null; agendamento_id: string | null; custom_data: unknown;
};
export type AltaCycle = {
  id: string; patient_id: string; professional_id: string; unit_id: string;
  specialty: string | null; treatment_type: string | null; start_date: string | null;
  status: string | null; pts_id: string | null;
};
export type AltaSession = {
  id: string; cycle_id: string; patient_id: string; professional_id: string;
  appointment_id: string | null; scheduled_date: string | null; status: string | null;
  procedure_done: string | null;
};
export type AltaPts = {
  id: string; patient_id: string; unit_id: string; professional_id: string;
  status: string; updated_at: string | null;
  diagnostico_funcional: string | null; objetivos_terapeuticos: string | null;
  objetivo_geral: string | null; motivo_encaminhamento: string | null;
  barreiras: string | null; potencialidades: string | null; rede_apoio: string | null;
};
export type AltaGoal = { id: string; pts_id: string; titulo: string; status: string; responsavel_id: string | null };
export type AltaSourceBundle = {
  patientId: string; unitId: string; professionalId: string | null; through: string;
  notes: AltaNote[]; cycles: AltaCycle[]; sessions: AltaSession[]; pts: AltaPts[]; goals: AltaGoal[];
  patientCid: string;
};
export type AltaSourceMeta = {
  unitId: string; cycleId: string | null; ptsId: string | null; through: string;
  noteCount: number; performed: number; absences: number; undated: number;
  periodStart: string; periodEnd: string;
};
const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
const date = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
const uniqueById = <T extends {id:string}>(rows: T[]) => [...new Map(rows.map(row => [row.id,row])).values()];
const orderDates = (a:string,b:string) => a.localeCompare(b);

/** Date-only bounds and exact IDs; no matching by specialty/name or inferred appointments. */
export function selectAltaSources(bundle: AltaSourceBundle, scope: string, ptsId: string, through: string, from = "", to = through) {
  const upper = date(through);
  const lower = date(from);
  const end = date(to) || upper;
  if (!upper || end > upper || (lower && lower > end)) throw new Error("Confira as datas do período e da alta.");
  const sameProfessional = (id: string) => !bundle.professionalId || id === bundle.professionalId;
  const cycles = uniqueById(bundle.cycles).filter(c => c.patient_id === bundle.patientId && c.unit_id === bundle.unitId && sameProfessional(c.professional_id));
  if (scope !== "all" && !cycles.some(c=>c.id===scope)) throw new Error("Ciclo não pertence ao contexto do relatório.");
  const scopedCycles = cycles.filter(c=>scope==="all" || c.id===scope);
  const cycleMap = new Map(scopedCycles.map(c=>[c.id,c]));
  const eligibleSessions = uniqueById(bundle.sessions).filter(s=>{
    const cycle = cycleMap.get(s.cycle_id);
    return !!cycle && s.patient_id===bundle.patientId && s.professional_id===cycle.professional_id && sameProfessional(s.professional_id)
      && ALTA_SESSION_STATUS.some(status=>status===s.status);
  });
  const undated = eligibleSessions.filter(s=>!date(s.scheduled_date)).length;
  const inRange = (d: unknown) => !!date(d) && date(d)<=end && (!lower||date(d)>=lower);
  const sessions = eligibleSessions.filter(s=>inRange(s.scheduled_date));
  const appointments = new Set(sessions.map(s=>s.appointment_id).filter(Boolean));
  const notes = uniqueById(bundle.notes).filter(n=>{
    if(n.paciente_id!==bundle.patientId||n.unidade_id!==bundle.unitId||!sameProfessional(n.profissional_id)||!inRange(n.data_atendimento)
       ||!ALTA_NOTE_TYPES.some(t=>t===n.tipo_registro)||!ALTA_NOTE_STATUS.some(t=>t===n.status)) return false;
    if(scope==="all") return true;
    if(n.profissional_id!==cycleMap.get(scope)?.professional_id)return false;
    const cd=n.custom_data && typeof n.custom_data==="object" ? n.custom_data as Record<string,unknown> : {};
    const explicit=cd.treatment_cycle_id||cd.cycle_id||cd.treatmentCycleId||cd.clinical_metrics_cycle_id;
    return explicit ? explicit===scope : !!n.agendamento_id&&appointments.has(n.agendamento_id);
  }).sort((a,b)=>orderDates(a.data_atendimento,b.data_atendimento)||a.id.localeCompare(b.id));
  const pts=bundle.pts.find(p=>p.id===ptsId&&p.patient_id===bundle.patientId&&p.unit_id===bundle.unitId)||null;
  if(ptsId && !pts)throw new Error("PTS não pertence ao contexto do relatório.");
  const goals=pts?bundle.goals.filter(g=>g.pts_id===pts.id&&(!bundle.professionalId||g.responsavel_id===bundle.professionalId)): [];
  const dates=[...notes.map(n=>n.data_atendimento),...sessions.map(s=>date(s.scheduled_date))].filter(Boolean).sort(orderDates);
  const performed=sessions.filter(s=>s.status==="realizada").length;
  const absences=sessions.filter(s=>s.status==="falta"||s.status==="paciente_faltou").length;
  const meta:AltaSourceMeta={unitId:bundle.unitId,cycleId:scope==="all"?null:scope,ptsId:pts?.id||null,through:upper,noteCount:notes.length,performed,absences,undated,periodStart:dates[0]||"",periodEnd:dates[dates.length-1]||""};
  return {notes,sessions,cycles:scopedCycles,pts,goals,meta};
}
export const firstRecorded = <T>(rows: T[], pick: (row:T)=>unknown) => rows.map(row=>text(pick(row))).find(Boolean)||"";
export const lastRecorded = <T>(rows: T[], pick: (row:T)=>unknown) => firstRecorded([...rows].reverse(),pick);
export function recordedProcedures(notes: AltaNote[], sessions: AltaSession[]): string {
  // Explicitly recorded procedures only, never planned sessions or PTS goals.
  return [...new Set([...notes.map(n=>text(n.procedimentos_texto)),...sessions.filter(s=>s.status==="realizada").map(s=>text(s.procedure_done))].filter(Boolean))].join("\n");
}
