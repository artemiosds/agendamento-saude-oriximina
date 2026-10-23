import { describe, expect, it } from "vitest";
import { getAuditActorLabel, isSystemAuditOrigin } from "./auditActor";

describe("audit actor label", () => {
  it("prefers the explicitly recorded user name", () => {
    expect(getAuditActorLabel({ user_nome: " Maria da Silva ", origem: "frontend" }))
      .toBe("Maria da Silva");
  });

  it("does not describe a missing frontend actor as automation", () => {
    expect(getAuditActorLabel({ user_nome: "", origem: "frontend" }))
      .toBe("Responsável não registrado");
    expect(getAuditActorLabel({ user_nome: null, origem: null }))
      .toBe("Responsável não registrado");
  });

  it("uses the automation label only for an explicit system origin", () => {
    expect(getAuditActorLabel({ user_nome: "", origem: "sistema" }))
      .toBe("Sistema / Automação");
    expect(isSystemAuditOrigin("CRON")).toBe(true);
    expect(isSystemAuditOrigin("frontend")).toBe(false);
  });
});
