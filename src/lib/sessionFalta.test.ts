import { describe, it, expect } from "vitest";
import { isSessionFalta } from "./sessionFalta";
describe("isSessionFalta", () => {
  it("reconhece paciente_faltou", () => expect(isSessionFalta("paciente_faltou")).toBe(true));
  it("reconhece falta legado", () => expect(isSessionFalta("falta")).toBe(true));
  it("não conta realizada", () => expect(isSessionFalta("realizada")).toBe(false));
});
