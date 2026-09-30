import { describe, expect, it } from "vitest";
import { parseBpaDate } from "./bpaDate";

describe("datas da exportação BPA-I", () => {
  it.each([
    ["2026-08-04", { ano: 2026, mes: 8, dia: 4 }],
    ["20260804", { ano: 2026, mes: 8, dia: 4 }],
    ["04/08/2026", { ano: 2026, mes: 8, dia: 4 }],
    ["2026-08-04T12:00:00Z", { ano: 2026, mes: 8, dia: 4 }],
  ])("interpreta %s", (input, expected) => expect(parseBpaDate(input)).toEqual(expected));

  it.each(["20260231", "2026-13-04", "", "00000000"])("rejeita data inválida %s", (input) => {
    expect(parseBpaDate(input)).toBeNull();
  });
});
