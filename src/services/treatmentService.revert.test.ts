import { beforeEach, describe, expect, it, vi } from "vitest";
import { treatmentService } from "./treatmentService";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

describe("Reversão de uma sessão realizada", () => {
  beforeEach(() => rpc.mockReset());

  it("envia a justificativa e confirma a sessão devolvida pelo banco", async () => {
    rpc.mockResolvedValue({ data: { success: true, session_id: "s1" }, error: null });

    await expect(treatmentService.revertCompletedSession("s1", "  Ajuste clínico  ")).resolves.toBeUndefined();

    expect(rpc).toHaveBeenCalledWith("revert_completed_treatment_session", {
      p_session_id: "s1",
      p_justificativa: "Ajuste clínico",
    });
  });

  it("rejeita a justificativa em branco antes da chamada", async () => {
    await expect(treatmentService.revertCompletedSession("s1", " \n\t")).rejects.toThrow("justificativa");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("propaga a recusa de escopo do banco", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Permissão negada." } });

    await expect(treatmentService.revertCompletedSession("s1", "Ajuste clínico")).rejects.toThrow("Permissão negada");
  });

  it("rejeita sucesso associado a outra sessão", async () => {
    rpc.mockResolvedValue({ data: { success: true, session_id: "s2" }, error: null });

    await expect(treatmentService.revertCompletedSession("s1", "Ajuste clínico")).rejects.toThrow("não confirmou");
  });

  it("não confirma sucesso quando a conexão cai", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "", message: "Failed to fetch" } });

    await expect(treatmentService.revertCompletedSession("s1", "Ajuste clínico")).rejects.toThrow("não confirmou");
  });
});
