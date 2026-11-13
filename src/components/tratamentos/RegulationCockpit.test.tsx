import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import RegulationCockpit from "./RegulationCockpit";
import type { CapacityPlanningInput } from "@/lib/treatmentCapacityPlanning";

const professional = {id:"p1",unitId:"u1",unitName:"CER II",name:"Profissional de teste",profession:"Fisioterapeuta",cboCode:"223605",appointmentDurationMinutes:30};
const input: CapacityPlanningInput = {
  today:"2026-11-10",endDate:"2026-12-15",periodDates:[],professionals:[professional],
  availabilities:[{professionalId:"p1",unitId:"u1",startDate:"2026-11-10",endDate:"2026-12-15",weekdays:[3],vacanciesPerDay:2,vacanciesPerHour:1,startTime:"08:00",endTime:"09:00"}],
  appointments:[],blocks:[],externalQuotas:[],pendingSessions:[],queueDemand:[
    {id:"request",patientId:"person",patientName:"Paciente de teste",unitId:"u1",status:"apto_agendamento",destinationProfession:"Fisioterapia",cboCode:"223605",linkedToAppointment:false,inTreatment:false,requestDate:"2026-11-09"},
  ],
};

function AgendaDestination() {
  const { state } = useLocation();
  return <div data-testid="scope">{JSON.stringify(state.regulation || state.manualAvailability)}</div>;
}

describe("cockpit de regulação e navegação oficial", () => {
  it("mostra o estoque sem data sem somá-lo à ocupação da semana", () => {
    const pendingSessions = Array.from({length:726},()=>({professionalId:"p1",unitId:"u1",cycleStatus:"em_andamento",status:"pendente_agendamento",scheduledDate:null,appointmentId:null}));
    render(<MemoryRouter><RegulationCockpit input={{...input,pendingSessions}} period={7} professionals={[professional]} queueAvailable canSchedule={false}/></MemoryRouter>);
    expect(screen.getByText("726")).toBeTruthy();
    expect(screen.getByText("0%")).toBeTruthy();
    expect(screen.getByText(/vaga\(s\) disponível\(is\) após proteger sessões datadas/)).toBeTruthy();
  });

  it.each([["Psicóloga","Psicologia"],["Nutricionista","Nutrição"],["Médico","Medicina"],["Terapeuta Ocupacional","Terapia Ocupacional"]])("abre a Agenda manual para %s sem fila automática", (profession, specialty) => {
    const other = {...professional,id:"p2",profession,cboCode:"251510"};
    const otherInput = {...input,professionals:[other],availabilities:input.availabilities.map(row=>({...row,professionalId:"p2"}))};
    render(<MemoryRouter initialEntries={["/painel/tratamentos"]}><Routes>
      <Route path="/painel/tratamentos" element={<RegulationCockpit input={otherInput} period={7} professionals={[other]} queueAvailable canSchedule/>}/>
      <Route path="/painel/agenda" element={<AgendaDestination/>}/>
    </Routes></MemoryRouter>);
    expect(screen.getByText(`${specialty} · CER II`)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Localizar vagas e agendar"}));
    expect(JSON.parse(screen.getByTestId("scope").textContent || "{}")).toMatchObject({professionalId:"p2",unitId:"u1",specialty,days:7,candidates:[]});
  });

  it("exibe métricas e envia apenas escopo e candidatos à Agenda, sem agendar", () => {
    render(<MemoryRouter initialEntries={["/painel/tratamentos"]}><Routes>
      <Route path="/painel/tratamentos" element={<RegulationCockpit input={input} period={7} professionals={[professional]} queueAvailable canSchedule/>}/>
      <Route path="/painel/agenda" element={<AgendaDestination/>}/>
    </Routes></MemoryRouter>);
    expect(screen.getByText("Pacientes aptos na fila (Fisio/Fono)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Localizar vagas e agendar"}));
    expect(JSON.parse(screen.getByTestId("scope").textContent || "{}")).toMatchObject({
      professionalId:"p1",unitId:"u1",specialty:"Fisioterapia",days:7,
      candidates:[{id:"request",name:"Paciente de teste",requestDate:"2026-11-09"}],
    });
  });
});
