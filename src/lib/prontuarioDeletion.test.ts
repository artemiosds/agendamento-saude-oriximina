import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteProntuario } from "./prontuarioDeletion";

const { from, deleteRows, filterId } = vi.hoisted(() => ({
  from: vi.fn(),
  deleteRows: vi.fn(),
  filterId: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));

describe("Exclusão de prontuário", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    from.mockReturnValue({ delete: deleteRows });
    deleteRows.mockReturnValue({ eq: filterId });
  });

  it("exclui somente o registro mestre e exige confirmação de uma linha afetada", async () => {
    filterId.mockResolvedValue({ error: null, count: 1 });

    await expect(deleteProntuario("prontuario-teste")).resolves.toBeUndefined();

    expect(from.mock.calls).toEqual([["prontuarios"]]);
    expect(deleteRows).toHaveBeenCalledWith({ count: "exact" });
    expect(filterId).toHaveBeenCalledWith("id", "prontuario-teste");
  });

  it("propaga a rejeição do banco sem recorrer à exclusão separada de procedimentos", async () => {
    const denied = { code: "42501", message: "Exclusão rejeitada" };
    filterId.mockResolvedValue({ error: denied, count: null });

    await expect(deleteProntuario("prontuario-teste")).rejects.toBe(denied);
    expect(from.mock.calls).toEqual([["prontuarios"]]);
  });

  it.each([0, null])("rejeita exclusão sem confirmação de uma linha afetada (%s)", async (count) => {
    filterId.mockResolvedValue({ error: null, count });

    await expect(deleteProntuario("prontuario-teste")).rejects.toThrow("O banco não confirmou a exclusão");
  });

  it("propaga a perda de conexão antes da confirmação", async () => {
    filterId.mockRejectedValue(new TypeError("Conexão interrompida"));

    await expect(deleteProntuario("prontuario-teste")).rejects.toThrow("Conexão interrompida");
    expect(from.mock.calls).toEqual([["prontuarios"]]);
  });
});
