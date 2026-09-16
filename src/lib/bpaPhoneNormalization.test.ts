import { describe, expect, it } from "vitest";
import { normalizeBpaPhone } from "./bpaPhoneNormalization";

describe("telefone do Registro 03 BPA-I", () => {
  it.each([
    ["93991123237", "93991123237"],
    ["(93) 99112-3237", "93991123237"],
    ["+55 (93) 99112-3237", "93991123237"],
    ["5593991123237", "93991123237"],
    ["55991123237", "55991123237"],
  ])("normaliza %s sem perder dígitos nacionais", (input, expected) => {
    expect(normalizeBpaPhone(input)).toBe(expected);
  });

  it.each(["", "123", "559399112323700", "abc"])("rejeita telefone inválido %s", (input) => {
    expect(normalizeBpaPhone(input)).toBe("");
  });
});