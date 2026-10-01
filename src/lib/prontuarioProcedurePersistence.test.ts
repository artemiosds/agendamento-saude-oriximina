import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncProntuarioProcedimentos, type ProntuarioProcedureLink } from "./prontuarioProcedurePersistence";

const database = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: database }));

const oldId = "11111111-1111-4111-8111-111111111111";
const newId = "22222222-2222-4222-8222-222222222222";
const link: ProntuarioProcedureLink = {
  prontuario_id: "33333333-3333-4333-8333-333333333333",
  procedimento_id: newId,
  cids_selecionados: ["F80"],
  quantidade: 1,
  observacao: "",
};

describe("syncProntuarioProcedimentos", () => {
  beforeEach(() => database.from.mockReset());

  it("não apaga vínculos anteriores quando a inclusão falha", async () => {
    const remove = vi.fn();
    database.from.mockReturnValue({
      select: () => ({ eq: async () => ({ data: [{ id: oldId, procedimento_id: oldId }], error: null }) }),
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: new Error("Falha de gravação") }) }) }),
      delete: remove,
    });

    await expect(syncProntuarioProcedimentos(link.prontuario_id, [link])).rejects.toThrow("Falha de gravação");
    expect(remove).not.toHaveBeenCalled();
  });

  it("só remove vínculo antigo depois de confirmar o novo", async () => {
    const operations: string[] = [];
    database.from.mockReturnValue({
      select: () => ({ eq: async () => ({ data: [{ id: oldId, procedimento_id: oldId }], error: null }) }),
      insert: () => ({ select: () => ({ single: async () => {
        operations.push("insert");
        return { data: { id: newId }, error: null };
      } }) }),
      delete: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => {
        operations.push("delete");
        return { data: { id: oldId }, error: null };
      } }) }) }),
    });

    await syncProntuarioProcedimentos(link.prontuario_id, [link]);
    expect(operations).toEqual(["insert", "delete"]);
  });

  it("recusa procedimento sem identificador válido antes de alterar o banco", async () => {
    await expect(syncProntuarioProcedimentos(link.prontuario_id, [{ ...link, procedimento_id: "0301010048" }]))
      .rejects.toThrow("vínculo válido");
    expect(database.from).not.toHaveBeenCalled();
  });
});
