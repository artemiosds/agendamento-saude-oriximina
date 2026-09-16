import { describe, expect, it } from "vitest";
import { buildRegistro03 } from "./bpaTxtLayout";
import { normalizeBpaAddress, type DneLogradouroEntry } from "./bpaAddressNormalization";

const catalog: DneLogradouroEntry[] = [
  { codigo: "001", descricao: "ACESSO" },
  { codigo: "004", descricao: "ALAMEDA" },
  { codigo: "007", descricao: "ATALHO" },
  { codigo: "008", descricao: "AVENIDA" },
  { codigo: "031", descricao: "ESTRADA" },
  { codigo: "074", descricao: "PASSAGEM" },
  { codigo: "081", descricao: "RUA" },
  { codigo: "090", descricao: "RODOVIA" },
  { codigo: "100", descricao: "TRAVESSA" },
  { codigo: "105", descricao: "VIELA" },
];

const normalize = (street: string, number = "", structuredType = "", savedCode = "") =>
  normalizeBpaAddress({ catalog, street, number, structuredType, savedCode });

describe("normalização DNE exclusiva da exportação BPA-I", () => {
  it.each([
    ["Rua João Stumano", "081", "JOAO STUMANO"],
    ["Avenida Brasil", "008", "BRASIL"],
    ["Travessa da Conquista", "100", "DA CONQUISTA"],
    ["Acesso Norte", "001", "NORTE"],
    ["Atalho Verde", "007", "VERDE"],
    ["Alameda Santos", "004", "SANTOS"],
    ["Estrada Velha", "031", "VELHA"],
    ["Rodovia PA 254", "090", "PA 254"],
    ["Viela Um", "105", "UM"],
    ["Passagem Dois", "074", "DOIS"],
  ])("resolve %s somente pelo catálogo", (street, code, expectedStreet) => {
    const result = normalize(street);
    expect(result.codigoLogradouro).toBe(code);
    expect(result.logradouro).toBe(expectedStreet);
    expect(result.alerts).toEqual([]);
  });

  it("preserva código salvo válido e compatível", () => {
    expect(normalize("Rua João Stumano", "", "Rua", "081").codigoLogradouro).toBe("081");
  });

  it("remove tipos repetidos", () => {
    expect(normalize("RUA RUA JOAO STUMANO").logradouro).toBe("JOAO STUMANO");
  });

  it.each([
    ["TR DA CONQUISTA 632", "632", "DA CONQUISTA"],
    ["INDEPENDENCIA 2287", "2287", "INDEPENDENCIA"],
  ])("remove somente o número estruturado duplicado", (street, number, expected) => {
    const result = normalize(street, number, "Travessa");
    expect(result.logradouro).toBe(expected);
    expect(result.numero).toBe(number);
  });

  it("preserva número legítimo ou alfanumérico diferente", () => {
    expect(normalize("Rua 15 de Novembro", "35B").logradouro).toBe("15 DE NOVEMBRO");
    expect(normalize("Rua Projetada 12A", "12").logradouro).toBe("PROJETADA 12A");
  });

  it("não usa código salvo inexistente e gera alerta", () => {
    const result = normalize("Lugar Desconhecido", "", "", "999");
    expect(result.codigoLogradouro).toBe("");
    expect(result.logradouro).toBe("LUGAR DESCONHECIDO");
    expect(result.alerts.length).toBeGreaterThan(0);
  });

  it("rejeita código salvo incompatível e resolve pelo tipo real do catálogo", () => {
    const result = normalize("Avenida Brasil", "", "Avenida", "081");
    expect(result.codigoLogradouro).toBe("008");
    expect(result.alerts.join(" ")).toContain("diverge");
  });

  it("mantém o Registro 03 com 338 posições", () => {
    const address = normalize("Rua João Stumano 12", "12");
    const result = buildRegistro03({ codigoLogradouro: address.codigoLogradouro, logradouro: address.logradouro, numero: address.numero });
    expect(result.line).toHaveLength(338);
  });
});