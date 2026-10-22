import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Pacientes from "./Pacientes";

const fixture = vi.hoisted(() => {
  const patient = { id: "p1", nome: "PACIENTE TESTE", nomeMae: "MAE TESTE", cpf: "", cns: "123456789012345",
    telefone: "93999999999", dataNascimento: "2000-01-01", email: "", endereco: "", naturalidade: "Oriximiná",
    municipio: "Oriximiná", unidadeId: "u1", sexo: "feminino", cid: "CID ANTIGO", especialidade_destino: "ESPECIALIDADE ANTIGA",
    custom_data: { cep: "68270-000", uf: "PA", logradouro: "RUA TESTE", bairro: "CENTRO", tipoLogradouro: "Rua",
      tipoLogradouroCodigo: "081", nacionalidade: "brasileiro", racaCor: "parda", campo_extra: true } };
  return { patient, pacientes: [patient], empty: [], unidades: [{ id: "u1", nome: "UNIDADE TESTE" }],
    user: { id: "user", usuario: "admin.sms", role: "master", unidadeId: "u1", nome: "TESTE" },
    refresh: vi.fn(async () => {}), applySaved: vi.fn(), log: vi.fn(), update: vi.fn(), insert: vi.fn(), from: vi.fn(), toast: vi.fn(), directory: vi.fn() };
});
vi.mock("@/contexts/PacientesContext", () => ({ usePacientes: () => ({
  pacientes: fixture.pacientes, refreshPacientes: fixture.refresh, applySavedPaciente: fixture.applySaved,
  addPaciente: vi.fn(), updatePaciente: vi.fn(),
}) }));
vi.mock("@/contexts/AgendamentosContext", () => ({ useAgendamentos: () => ({ agendamentos: fixture.empty }) }));
vi.mock("@/contexts/FilaContext", () => ({ useFila: () => ({ fila: fixture.empty }) }));
vi.mock("@/contexts/OperacionalContext", () => ({ useOperacional: () => ({
  unidades: fixture.unidades, funcionarios: fixture.empty, logAction: fixture.log, resolveScopedUnidadeId: async () => 'u1',
}) }));
vi.mock("@/services/patientDirectoryService", () => ({ fetchPatientDirectory: (...args: unknown[]) => fixture.directory(...args) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: fixture.user }) }));
vi.mock("@/contexts/PermissionsContext", () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock("@/hooks/useUnidadeFilter", () => ({ useUnidadeFilter: () => ({ unidadesVisiveis: fixture.unidades, profissionaisVisiveis: fixture.empty }) }));
vi.mock("@/hooks/useCustomFields", () => ({ useCustomFields: () => ({ getNativeLabel: (_key: string, label: string) => label }) }));
vi.mock("@/hooks/useWebhookNotify", () => ({ useWebhookNotify: () => ({ notify: vi.fn() }) }));
vi.mock("@/hooks/useEnsurePortalAccess", () => ({ useEnsurePortalAccess: () => ({ ensurePortalAccess: vi.fn() }) }));
vi.mock("@/lib/paciente-duplicity", () => ({ checkPatientDuplicity: async () => ({ isDuplicate: false }) }));
vi.mock("sonner", () => ({ toast: { error: fixture.toast, success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => fixture.from(table) } }));
vi.mock("@/components/PatientProfessionCarenessNotice", () => ({ PatientProfessionCarenessNotice: () => null }));
vi.mock("@/components/DocumentCenter", () => ({ default: () => null }));
vi.mock("@/components/pacientes/ApacLaudoModal", () => ({ default: () => null }));
vi.mock("@/components/FichaImpressao", () => ({ FichaImpressao: () => null }));
vi.mock("@/components/ImportarPacientesCSV", () => ({ default: () => null }));
vi.mock("./pacientes/PacienteItemCard", () => ({ default: ({ paciente, onEditar }) =>
  <button onClick={() => onEditar(paciente)}>Editar teste</button>,
}));
// O formulário real tem testes próprios de foco, endereço e sincronização.
vi.mock("@/components/CadastroPacienteForm", async importOriginal => {
  const mod = await importOriginal<typeof import("@/components/CadastroPacienteForm")>();
  return { ...mod, default: ({ onSave, onChange, form, errors }) => <>
    <button onClick={() => onChange({ ...form, nome: fixture.patient.nome, nomeMae: fixture.patient.nomeMae,
      cns: fixture.patient.cns, telefone: fixture.patient.telefone, dataNascimento: fixture.patient.dataNascimento,
      naturalidade: fixture.patient.naturalidade, municipio: fixture.patient.municipio, sexo: fixture.patient.sexo,
      customData: { ...fixture.patient.custom_data }, especialidadeDestino: "FONOAUDIOLOGIA", cid: "CID NOVO" })}>Preencher teste</button>
    <button onClick={onSave}>Salvar teste</button><output data-testid="errors">{JSON.stringify(errors)}</output>
  </> };
});
beforeEach(() => {
  vi.clearAllMocks();
  fixture.directory.mockResolvedValue({ rows: [{ ...fixture.patient, nome_mae: fixture.patient.nomeMae,
    data_nascimento: fixture.patient.dataNascimento, unidade_id: fixture.patient.unidadeId,
    especialidade_destino: fixture.patient.especialidade_destino }], total: 1 });
  fixture.from.mockImplementation((table: string) => {
    if (table === "pacientes") return {
      update: (payload: object) => { fixture.update(payload); return {
        eq: () => ({ select: () => ({ single: async () => ({ data: { id: "p1" }, error: null }) }) }),
      }; },
      insert: async (payload: object) => { fixture.insert(payload); return { error: null }; },
    };
    if (table === "patient_procedures") return { delete: () => ({ eq: async () => ({ error: null }) }) };
    throw new Error("Consulta inesperada: " + table);
  });
});
afterEach(cleanup);
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={client}><Pacientes /></QueryClientProvider></MemoryRouter>);
}
describe("gravação real do handler de Pacientes com consultas simuladas", () => {
  it("salva edição sem enviar nenhum campo do histórico no UPDATE cadastral", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Editar teste" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar teste" }));
    await waitFor(() => expect(fixture.update).toHaveBeenCalledTimes(1));
    const payload = fixture.update.mock.calls[0][0];
    expect(payload).toMatchObject({ nome: fixture.patient.nome, custom_data: { campo_extra: true, numero: "S/N" } });
    for (const key of ["cid", "especialidade_destino", "ubs_origem", "profissional_solicitante", "tipo_encaminhamento",
      "diagnostico_resumido", "justificativa", "data_encaminhamento"]) expect(payload).not.toHaveProperty(key);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Salvar teste" })).not.toBeInTheDocument());
    expect(fixture.applySaved).toHaveBeenCalledWith({ id: "p1" });
    expect(fixture.refresh).not.toHaveBeenCalled(); // sem carregamento integral do cadastro
  });
  it("mantém dados de encaminhamento no INSERT de novo cadastro e salva com sucesso", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Novo Paciente" }));
    fireEvent.click(screen.getByRole("button", { name: "Preencher teste" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar teste" }));
    await waitFor(() => expect(fixture.insert).toHaveBeenCalledTimes(1));
    expect(fixture.insert.mock.calls[0][0]).toMatchObject({
      especialidade_destino: "FONOAUDIOLOGIA", cid: "CID NOVO", unidade_id: "u1",
      custom_data: { cep: "68270-000", campo_extra: true, numero: "S/N" },
    });
    expect(fixture.update).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Salvar teste" })).not.toBeInTheDocument());
  });
  it("não consulta a gravação quando faltam dados e informa a primeira pendência", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Novo Paciente" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar teste" }));
    await waitFor(() => expect(fixture.toast).toHaveBeenCalledWith("Nome completo é obrigatório"));
    expect(screen.getByTestId("errors")).toHaveTextContent("nome");
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.insert).not.toHaveBeenCalled();
  });
});

describe("visibilidade e carregamento do diretório", () => {
  it("consulta uma página por unidade e mostra paciente sem agendamento próprio do profissional", async () => {
    fixture.user = { id: 'prof1', usuario: 'prof1', role: 'profissional', unidadeId: 'u1', nome: 'PROFISSIONAL' };
    setup();
    await waitFor(() => expect(fixture.directory).toHaveBeenCalledWith(expect.objectContaining({ unitId: 'u1', limit: 50, full: false })));
    expect(await screen.findByRole('button', { name: 'Editar teste' })).toBeInTheDocument();
    fixture.user = { id: 'user', usuario: 'admin.sms', role: 'master', unidadeId: 'u1', nome: 'TESTE' };
  });
});
