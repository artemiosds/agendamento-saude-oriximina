import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Tratamentos from "./Tratamentos";

const { user, getCycles, getSessions, getCycleAppointments } = vi.hoisted(() => ({
  user: { id: "prof-1", role: "profissional", unidadeId: "unit-1", usuario: "prof.teste" },
  getCycles: vi.fn(),
  getSessions: vi.fn(),
  getCycleAppointments: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user }) }));
vi.mock("@/contexts/PermissionsContext", () => ({ usePermissions: () => ({ can: () => user.role === "master" }) }));
vi.mock("@/contexts/PacientesContext", () => {
  const pacientes = [{ id: "patient-1", nome: "Paciente de teste" }];
  const hydrateTreatmentPatients = async () => pacientes;
  return { usePacientes: () => ({ pacientes, hydrateTreatmentPatients }) };
});
vi.mock("@/contexts/OperacionalContext", () => {
  const units = [{ id: "unit-1", nome: "Unidade de teste" }];
  const staff = [{ id: "prof-1", nome: "Profissional de teste" }];
  const data = {
    unidades: units, funcionarios: staff, salas: [], disponibilidades: [], bloqueios: [],
    getAvailableDates: () => [], getAvailableSlots: () => [], getTurnoInfo: () => [],
  };
  return { useOperacional: () => data };
});
vi.mock("@/contexts/FilaContext", () => ({ useFila: () => ({ fila: [] }) }));
vi.mock("@/contexts/AgendamentosContext", () => ({ useAgendamentos: () => ({}) }));
vi.mock("@/hooks/useUnidadeFilter", () => ({ useUnidadeFilter: () => ({ unidadesVisiveis: [], profissionaisVisiveis: [] }) }));
vi.mock("@/hooks/useTreatmentPtsData", () => ({
  useTreatmentPtsData: () => ({ createPts: [], cyclePts: [], linkedPts: null }),
}));
vi.mock("@/hooks/useSoapCustomOptions", () => ({
  useSoapCustomOptions: () => ({ getOptionsForField: () => [], getOptionWithId: () => [] }),
}));
vi.mock("@/hooks/useRealtimeSubscription", () => ({ useRealtimeSubscription: () => {} }));
vi.mock("@/lib/utils", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/utils")>(),
  todayLocalStr: () => "2026-11-22",
}));
vi.mock("@/services/treatmentService", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/services/treatmentService")>(),
  treatmentService: { getSessions },
}));
vi.mock("@/services/treatmentAppointmentRecovery", () => ({
  recoverMissingTreatmentAppointments: async (_cycleId: string, sessions: unknown[]) => sessions,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: getCycles,
    from: (table: string) => ({
      select: () => {
        const query = {
          eq: () => query,
          in: () => query,
          not: () => query,
          order: () => query,
          then: (resolve: (result: { data: unknown[]; error: null }) => void) =>
            resolve({ data: table === "agendamentos" ? getCycleAppointments() : [], error: null }),
        };
        return query;
      },
    }),
  },
}));

const cycle = {
  id: "cycle-1", patient_id: "patient-1", professional_id: "prof-1", unit_id: "unit-1",
  treatment_type: "Fisioterapia", start_date: "2026-11-19", total_sessions: 8, sessions_done: 1,
  frequency: "semanal", status: "em_andamento",
};
const sessions = [
  ["agendada", "2026-11-21"],
  ["agendada", "2026-11-22"],
  ["agendada", "2026-11-23"],
  ["realizada", "2026-11-20"],
  ["cancelada", "2026-11-20"],
  ["remarcada", "2026-11-20"],
  ["pendente_agendamento", "2026-11-19"],
  ["agendada", null],
].map(([status, scheduled_date], index) => ({
  id: `session-${index + 1}`,
  cycle_id: cycle.id,
  patient_id: cycle.patient_id,
  professional_id: cycle.professional_id,
  session_number: index + 1,
  total_sessions: cycle.total_sessions,
  appointment_id: status === "agendada" && scheduled_date ? `appointment-${index + 1}` : null,
  status,
  scheduled_date,
}));

beforeEach(() => {
  user.role = "profissional";
  getCycles.mockResolvedValue({ data: { cycles: [cycle], total: 1 }, error: null });
  getSessions.mockResolvedValue([
    ...sessions,
    { ...sessions[0], id: "other-session", cycle_id: "other-cycle", appointment_id: null },
  ]);
  getCycleAppointments.mockReturnValue(sessions.filter((session) => session.appointment_id).map((session) => ({
    id: session.appointment_id,
    data: session.scheduled_date,
    hora: "08:00",
    status: "confirmado",
    paciente_id: cycle.patient_id,
    profissional_id: cycle.professional_id,
    unidade_id: cycle.unit_id,
  })));
});

async function openCycle() {
  render(<Tratamentos />);
  fireEvent.click(await screen.findByText("Paciente de teste"));
  await screen.findByText("8 de 8 sessões registradas");
}

describe("Sinalização das datas das sessões", () => {
  it("conta somente sessões agendadas no passado do ciclo aberto e distingue a sessão de hoje", async () => {
    await openCycle();
    expect(screen.getByRole("status")).toHaveTextContent("Há 1 sessão com data anterior aguardando regularização.");
    expect(screen.getAllByText("Data passada · Regularizar")).toHaveLength(1);
    expect(screen.getAllByText("Hoje", { exact: true })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Remarcar" })).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Registrar sessão 2" })).not.toBeInTheDocument();
  });

  it.each(["profissional", "master"])("abre registro e falta na data agendada para %s", async (role) => {
    user.role = role;
    await openCycle();
    fireEvent.click(screen.getByRole("button", { name: "Registrar sessão 1" }));
    const registerDialog = screen.getByRole("dialog", { name: "Registrar Sessão" });
    expect(within(registerDialog).getByText("21/11/2026")).toHaveAttribute("datetime", "2026-11-21");
    expect(within(registerDialog).getByRole("combobox")).toHaveTextContent("Realizada");
    fireEvent.click(within(registerDialog).getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Lançar falta na sessão 1" }));
    const absenceDialog = screen.getByRole("dialog", { name: "Lançar Falta" });
    expect(within(absenceDialog).getByText("21/11/2026")).toHaveAttribute("datetime", "2026-11-21");
    expect(within(absenceDialog).getByText("Tipo de Falta *")).toBeInTheDocument();
  });

  it("abre a remarcação existente para a sessão agendada do dia anterior", async () => {
    await openCycle();
    fireEvent.click(screen.getAllByRole("button", { name: "Remarcar" })[0]);
    expect(screen.getByRole("dialog", { name: "Remarcar Sessão 1/8" })).toBeInTheDocument();
  });

  it("mostra os avisos a quem apenas consulta e mantém as ações restritas", async () => {
    user.role = "recepcao";
    await openCycle();
    expect(screen.getByText("Data passada · Regularizar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar sessão 1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lançar falta na sessão 1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remarcar" })).not.toBeInTheDocument();
  });
});
