import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PatientReferral } from "@/services/patientReferralService";
import { formatLocalDate, printReferral } from "./referralPrinter";
const print = vi.hoisted(() => ({ send: vi.fn(), shell: vi.fn((_title, body) => body) }));
vi.mock("@/lib/printLayout", () => ({
  loadDocumentConfig: async () => ({}), buildDocumentShell: print.shell, printViaIframe: print.send,
}));
beforeEach(() => vi.clearAllMocks());
describe("datas de calendário no encaminhamento", () => {
  it("mantém o dia independentemente de UTC ou fuso brasileiro", () => {
    expect(formatLocalDate("2026-10-21")).toBe("21/10/2026");
    expect(formatLocalDate("2026-10-21T00:00:00.000Z", true)).toBe("21/10/26");
    expect(formatLocalDate(null)).toBe("-");
    expect(formatLocalDate("21/10/2026")).toBe("21/10/2026");
  });
  it.each(["data_nascimento", "dataNascimento"])("imprime data do encaminhamento e nascimento em %s sem retroceder", async field => {
    await printReferral({ data_encaminhamento: "2026-10-21", especialidade_destino: "Fonoaudiologia" } as PatientReferral,
      { nome: "PACIENTE TESTE", [field]: "2000-01-01" });
    const html = print.send.mock.calls[0][0];
    expect(html).toContain("21/10/2026");
    expect(html).toContain("01/01/2000");
    expect(html).not.toContain("20/10/2026");
    expect(html).not.toContain("31/12/1999");
  });
});
