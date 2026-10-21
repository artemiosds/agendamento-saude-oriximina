import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PatientReferralHistory from "./PatientReferralHistory";
import type { PatientReferral } from "@/services/patientReferralService";
const api = vi.hoisted(() => ({ get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock("@/services/patientReferralService", () => ({
  getPatientReferrals: api.get, createPatientReferral: api.create, updatePatientReferral: api.update,
  deletePatientReferral: api.remove, uploadReferralAttachment: vi.fn(), deleteReferralAttachment: vi.fn(), getReferralFileUrl: vi.fn(),
}));
vi.mock("@/components/Pacientes/EspecialidadeDestinoCombobox", () => ({
  default: ({ onChange }: { onChange: (v: string) => void }) => <button onClick={() => onChange("FONOAUDIOLOGIA")}>Escolher Fonoaudiologia</button>,
}));
const referral = (id: string, patient_id = "p1", created_at = "2026-10-21T12:00:00Z"): PatientReferral => ({
  id, patient_id, created_at, updated_at: created_at, especialidade_destino: "FONOAUDIOLOGIA",
  data_encaminhamento: "2026-10-21", status: "pendente", justificativa: id, attachments: [],
});
beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue([]); });
afterEach(cleanup);
describe("sincronização do histórico e datas", () => {
  it("notifica o mais recente ao carregar e exibe data correta na tabela e no modal", async () => {
    const recent = referral("recent");
    api.get.mockResolvedValue([recent]);
    const callback = vi.fn();
    render(<PatientReferralHistory patientId="p1" patientData={{}} onLatestReferralChange={callback} />);
    await waitFor(() => expect(callback).toHaveBeenCalledWith(recent));
    fireEvent.click(screen.getByText("21/10/26"));
    expect(screen.getByText("21/10/2026")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(1);
  });
  it("não promove encaminhamento antigo editado sobre o mais recente", async () => {
    const recent = referral("recent");
    const old = referral("old", "p1", "2026-10-01T12:00:00Z");
    api.get.mockResolvedValue([recent, old]);
    api.update.mockResolvedValue({ ...old, cid: "H90" });
    const callback = vi.fn();
    render(<PatientReferralHistory patientId="p1" patientData={{}} onLatestReferralChange={callback} />);
    await screen.findAllByTitle("Editar");
    fireEvent.click(screen.getAllByTitle("Editar")[1]);
    fireEvent.click(screen.getByRole("button", { name: /^Atualizar$/ }));
    await waitFor(() => expect(api.update).toHaveBeenCalled());
    await waitFor(() => expect(callback.mock.calls.length).toBeGreaterThan(1));
    expect(callback.mock.calls.every(([r]) => r.id === recent.id)).toBe(true);
  });
  it("sincroniza criação persistida antes do recarregamento da lista", async () => {
    const created = referral("created");
    api.create.mockResolvedValue(created);
    const callback = vi.fn();
    render(<PatientReferralHistory patientId="p1" patientData={{}} onLatestReferralChange={callback} />);
    await screen.findByText("Nenhum encaminhamento registrado.");
    fireEvent.click(screen.getByRole("button", { name: "Novo Encaminhamento" }));
    fireEvent.click(screen.getByRole("button", { name: "Escolher Fonoaudiologia" }));
    fireEvent.click(screen.getByRole("button", { name: /^Salvar$/ }));
    await waitFor(() => expect(callback).toHaveBeenCalledWith(created));
  });
  it("sincroniza encaminhamento pendente e sua remoção antes do novo cadastro", async () => {
    const callback = vi.fn();
    render(<PatientReferralHistory patientData={{}} onLatestReferralChange={callback} />);
    fireEvent.click(screen.getByRole("button", { name: "Novo Encaminhamento" }));
    fireEvent.click(screen.getByRole("button", { name: "Escolher Fonoaudiologia" }));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar à lista" }));
    await waitFor(() => expect(callback).toHaveBeenCalledWith(expect.objectContaining({ especialidade_destino: "FONOAUDIOLOGIA" })));
    expect(api.create).not.toHaveBeenCalled();
    const row = screen.getByText("FONOAUDIOLOGIA").closest("tr")!;
    fireEvent.click(row.querySelector("button")!);
    expect(callback).toHaveBeenLastCalledWith(expect.objectContaining({ especialidade_destino: "", data_encaminhamento: "" }));
  });
  it("descarta consulta atrasada de outro paciente", async () => {
    let resolve: (data: PatientReferral[]) => void;
    api.get.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValueOnce([referral("p2ref", "p2")]);
    const callback = vi.fn();
    const { rerender } = render(<PatientReferralHistory patientId="p1" patientData={{}} onLatestReferralChange={callback} />);
    rerender(<PatientReferralHistory patientId="p2" patientData={{}} onLatestReferralChange={callback} />);
    await waitFor(() => expect(callback).toHaveBeenCalledWith(expect.objectContaining({ patient_id: "p2" })));
    await act(async () => resolve!([referral("p1late")]));
    expect(callback.mock.calls.every(([r]) => r.patient_id === "p2")).toBe(true);
  });
});
