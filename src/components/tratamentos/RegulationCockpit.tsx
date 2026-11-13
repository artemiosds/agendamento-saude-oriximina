import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { eligibleEvaluationRequests, classifyTreatmentCapacitySpecialty, type CapacityProfessionalInput } from "@/lib/treatmentCapacityAnalytics";
import { planInitialEvaluations, type CapacityPlanningInput } from "@/lib/treatmentCapacityPlanning";
import { addDaysToDateStr, formatDateBR, nowMinutesInBrazil } from "@/lib/utils";

interface Props {
  input: CapacityPlanningInput;
  period: number;
  professionals: CapacityProfessionalInput[];
  queueAvailable: boolean;
  canSchedule: boolean;
}

const riskColor = { "Capacidade segura": "text-emerald-700", "Atenção": "text-amber-700", "Esgotado": "text-red-700", "Sem grade": "text-muted-foreground" };

export default function RegulationCockpit({ input, period, professionals, queueAvailable, canSchedule }: Props) {
  const navigate = useNavigate();
  const horizon = Math.min(15, period);
  const rows = useMemo(() => professionals.flatMap(p => {
    const specialty = classifyTreatmentCapacitySpecialty(p.profession);
    if (specialty !== "Fisioterapia" && specialty !== "Fonoaudiologia") return [];
    const professional = input.professionals.find(x=>x.id===p.id && x.unitId===p.unitId);
    if (!professional) return [];
    const plan = planInitialEvaluations(input, professional, horizon, nowMinutesInBrazil());
    const candidates = eligibleEvaluationRequests(input.queueDemand, professional, input.today);
    const totals = period === horizon ? plan : planInitialEvaluations(input, professional, period, nowMinutesInBrazil());
    return [{ professional, specialty, plan, totals, candidates }];
  }), [input, professionals, horizon, period]);
  const days = Array.from({ length:7 }, (_,i)=>addDaysToDateStr(input.today,i));
  const slots = rows.reduce((n,r)=>n+r.plan.count,0);
  const demand = new Set(rows.flatMap(r=>r.candidates.map(c=>c.patientId))).size;
  const operational = rows.reduce((n,r)=>n+r.totals.configured,0);
  const committed = rows.reduce((n,r)=>n+r.totals.occupied+r.totals.projected,0);
  const cards = [
    ["Vagas seguras para novos pacientes", slots, `Próximos ${horizon} dias, após proteger os ciclos.`],
    ["Sessões aguardando marcação", rows.reduce((n,r)=>n+r.plan.pending,0), "Ciclos em andamento, sem agendamento vinculado."],
    ["Pacientes aptos na fila", queueAvailable ? demand : "Indisponível", "Pacientes distintos com destino e CBO compatíveis."],
    ["Ocupação da grade regular", operational ? Math.round(100*committed/operational) + "%" : "Sem capacidade", `Agendamentos internos e pendências sobre ${operational} vagas cadastradas em ${period} dias. Pendências não são reservas.`],
  ];
  return <section aria-label="Cockpit de regulação" className="space-y-4">
    <h3 className="font-semibold">Regulação de Fisioterapia e Fonoaudiologia</h3>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label,value,note])=><div key={label} className="rounded-lg border p-4">
      <p className="text-sm">{label}</p><p className="my-1 text-2xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{note}</p>
    </div>)}</div>
    <p className="text-xs text-muted-foreground">Solicitações sem destino ou CBO explícito ficam fora da lista apta e exigem conferência. A oferta de vagas é revalidada na Agenda.</p>
    {!rows.length && <p className="text-sm">Nenhum profissional destas especialidades no filtro atual.</p>}
    {rows.map(({professional:p, specialty, plan, candidates})=>{
      const key = p.id + "|" + p.unitId;
      const orphan = plan.offers.find(s=>s.singleVisit);
      return <article key={key} className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap justify-between gap-2"><div><h4 className="font-semibold">{p.name}</h4><p className="text-xs text-muted-foreground">{specialty} · {p.unitName || p.unitId}</p></div><strong className={riskColor[plan.risk]}>{plan.risk}</strong></div>
        <p className="text-sm">{plan.count > 0 ? `${plan.count} vaga(s) segura(s) para avaliação` : "Nenhuma vaga confirmável para avaliação"} · {plan.projected} pendência(s) no horizonte{plan.review && " · Revisar pendências ou grade"}</p>
        {plan.count > 0 && <p className="text-sm text-muted-foreground">{p.name} ({specialty}) possui {plan.count} vaga(s) pontual(is) nos próximos {horizon} dias. {queueAvailable ? `${candidates.length} paciente(s) apto(s) na mesma unidade e com CBO compatível.` : "A fila não está disponível para conferência."} {plan.offers.slice(0,2).map(offer=>`${formatDateBR(offer.date)} às ${offer.time}`).join(" e ")}.</p>}
        <div className="grid grid-cols-4 gap-1 sm:grid-cols-7" aria-label="Próximos sete dias por turno">{days.map(date=>{
          const daySlots = plan.offers.filter(s=>s.date===date);
          const turns = ["Manhã","Tarde","Noite"].map((label,i)=>({label, n:daySlots.filter(s=> (s.time < "12:00" ? 0 : s.time < "18:00" ? 1 : 2) === i).reduce((n,s)=>n+s.count,0)}));
          return <div key={date} className="rounded bg-muted/60 p-2 text-xs"><strong>{new Date(date+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit"})}</strong>
            {turns.filter(t=>t.n || t.label !== "Noite").map(t=><p key={t.label}>{t.label} {t.n}</p>)}</div>;
        })}</div>
        {orphan && <p className="rounded border border-sky-300 bg-sky-50 p-2 text-sm text-sky-950">Ideal para avaliação inicial ou encaixe único · {formatDateBR(orphan.date)} às {orphan.time}. Mesmo horário indisponível nas três semanas seguintes.</p>}
        {canSchedule && <div className="flex flex-wrap items-end gap-2">
          <Button type="button" size="sm" variant="outline" disabled={!plan.count} onClick={()=>navigate("/painel/agenda",{state:{regulation:{professionalId:p.id,unitId:p.unitId,specialty,days:horizon,
            candidates: queueAvailable ? candidates.map(c=>({ id:c.id, name:c.patientName || "Paciente", requestDate:c.requestDate || null })) : []}}})}>
            Localizar vagas e agendar</Button>
        </div>}
      </article>;
    })}
  </section>;
}
