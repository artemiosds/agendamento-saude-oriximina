import { describe, expect, it } from "vitest";
import { resolveProntuarioProfessional } from "./prontuarioProfessional";

describe("responsável do prontuário", () => {
  const loggedUser = { id: "editor-id", nome: "Editor" };

  it("atribui um prontuário novo ao usuário logado", () => {
    expect(resolveProntuarioProfessional(false, { profissional_id: "", profissional_nome: "" }, loggedUser))
      .toEqual({ id: "editor-id", nome: "Editor" });
  });

  it("preserva o responsável original ao editar", () => {
    expect(resolveProntuarioProfessional(true, { profissional_id: "original-id", profissional_nome: "Original" }, loggedUser))
      .toEqual({ id: "original-id", nome: "Original" });
  });

  it("não substitui vínculo vazio de um registro antigo pelo editor", () => {
    expect(resolveProntuarioProfessional(true, { profissional_id: "", profissional_nome: "" }, loggedUser))
      .toEqual({ id: "", nome: "" });
  });
});
