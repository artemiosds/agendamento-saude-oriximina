import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Tratamentos from "./Tratamentos";

const { user, getCycles, getSessions, getCycleAppointments, updateSession, sessionEq, sessionNeq, latestSession, recalcAbsence, logAction, toast } = vi.hoisted(() => ({
  user: { id: "prof-1", role: "profissional", unidadeId: "unit-1", usuario: "prof.teste" },
  getCycles: vi.fn(),
  getSessions: vi.fn(),
  getCycleAppointments: vi.fn(),
  updateSession: vi.fn(),
  sessionEq: vi.fn(),
  sessionNeq: vi.fn(),
  latestSession: vi.fn(),
  recalcAbsence: vi.fn(),
  logAction: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));

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
    getAvailableDates: () => [], getAvailableSlots: () => [], getTurnoInfo: () => [], logAction,
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
    rpc: (name: string, params: unknown) => name === "atualizar_status_falta" ? recalcAbsence(params) : getCycles(name, params),
    from: (table: string) => ({
      update: updateSession,
      select: () => {
        const query = {
          eq: () => query,
          in: () => query,
          not: () => query,
          order: () => query,
          maybeSingle: latestSession,
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
  vi.clearAllMocks();
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
  const updateQuery = { eq: sessionEq, neq: sessionNeq };
  updateSession.mockReturnValue(updateQuery);
  sessionEq.mockReturnValue(updateQuery);
  sessionNeq.mockResolvedValue({ count: 1, error: null });
  latestSession.mockResolvedValue({ data: { status: "realizada" }, error: null });
  recalcAbsence.mockResolvedValue({ data: { ok: true }, error: null });
});

async function submitAbsence() {
  await openCycle();
  fireEvent.click(screen.getByRole("button", { name: "Lançar falta na sessão 1" }));
  const dialog = screen.getByRole("dialog", { name: "Lançar Falta" });
  fireEvent.keyDown(within(dialog).getAllByRole("combobox")[1], { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: "Justificada" }));
  fireEvent.change(within(dialog).getByPlaceholderText(/Motivo da falta/), {
    target: { value: "Observação de teste" },
  });
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: "Registrar" }));
  });
  return dialog;
}

describe("Lançar falta com confirmação do banco", () => {
  const scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
  beforeAll(() => Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() }));
  afterAll(() => {
    if (scrollIntoView) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollIntoView);
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  });

  it("mantém o formulário aberto quando a atualização é rejeitada", async () => {
    sessionNeq.mockResolvedValue({ count: null, error: { code: "42501", message: "Acesso negado" } });
    const dialog = await submitAbsence();

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(within(dialog).getByPlaceholderText(/Motivo da falta/)).toHaveValue("Observação de teste");
    expect(recalcAbsence).not.toHaveBeenCalled();
    expect(logAction).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("preserva uma evolução gravada em outro terminal e recarrega o ciclo", async () => {
    sessionNeq.mockResolvedValue({ count: 0, error: null });
    await submitAbsence();

    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(
      "Esta sessão já foi finalizada em outro terminal e não pode ser sobrescrita como falta.",
    ));
    expect(updateSession).toHaveBeenCalledWith(expect.objectContaining({ status: "paciente_faltou" }), { count: "exact" });
    expect(sessionEq.mock.calls).toEqual([["id", "session-1"], ["status", "agendada"]]);
    expect(sessionNeq).toHaveBeenCalledWith("status", "realizada");
    await waitFor(() => expect(getSessions).toHaveBeenCalledTimes(2));
    expect(recalcAbsence).not.toHaveBeenCalled();
    expect(logAction).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("não confirma a falta se a conexão cai antes da resposta do banco", async () => {
    sessionNeq.mockRejectedValueOnce(new TypeError("Conexão interrompida"));
    const dialog = await submitAbsence();

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(dialog).toBeInTheDocument();
    expect(recalcAbsence).not.toHaveBeenCalled();
    expect(logAction).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("calcula o status de faltas e mostra sucesso após a confirmação", async () => {
    await submitAbsence();

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Sessão 1/8 registrada!"));
    expect(recalcAbsence).toHaveBeenCalledWith({ p_paciente_id: "patient-1", p_profissional_id: null });
    expect(logAction).toHaveBeenCalledWith(expect.objectContaining({ acao: "registrar_sessao", entidadeId: "session-1" }));
  });

  it("avisa se a falta foi gravada e o recálculo foi rejeitado", async () => {
    recalcAbsence.mockResolvedValue({ data: null, error: { code: "42501" } });
    await submitAbsence();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      "A falta foi gravada, mas não foi possível confirmar a atualização do status de faltas do paciente.",
    ));
    expect(toast.success).not.toHaveBeenCalled();
  });
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
