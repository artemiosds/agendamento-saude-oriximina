import { afterEach, describe, expect, it, vi } from "vitest";
import { buscarCepsPorEndereco, LIMITE_CEPS_POR_RUA } from "./enderecoPaciente";
const row = (cep = "68005-000", localidade = "Santarém") => ({
  cep, localidade, uf: "PA", logradouro: "Rua São João", bairro: "Centro",
});
const response = (rows: unknown) => Promise.resolve({ ok: true, json: async () => rows } as Response);
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("consulta limitada por rua", () => {
  it("exige cidade, UF e três letras e escapa os parâmetros", async () => {
    const fetcher = vi.fn((_url: string) => response([row()]));
    vi.stubGlobal("fetch", fetcher);
    expect(await buscarCepsPorEndereco("PA", "Santarém", "ab", new AbortController().signal)).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
    const result = await buscarCepsPorEndereco("PA", "Santarém", "São João/API", new AbortController().signal);
    expect(fetcher.mock.calls[0][0]).toContain("Santar%C3%A9m/S%C3%A3o%20Jo%C3%A3o%2FAPI/json/");
    expect(result[0]).toMatchObject({ municipio: "SANTAREM", uf: "PA", ibge_municipio: "1506807", bairro: "CENTRO" });
  });
  it("limita a oito resultados, remove duplicados e descarta outra cidade", async () => {
    const rows = [row("68250-000", "Óbidos"), row(), row(),
      ...Array.from({ length: 50 }, (_, i) => row(String(68005100 + i)))];
    vi.stubGlobal("fetch", vi.fn(() => response(rows)));
    const result = await buscarCepsPorEndereco("PA", "Santarém", "LIMITADAS", new AbortController().signal);
    expect(result).toHaveLength(LIMITE_CEPS_POR_RUA);
    expect(result.every(r => r.ibge_municipio === "1506807")).toBe(true);
    expect(new Set(result.map(r => r.cep)).size).toBe(result.length);
  });
  it("usa cache por cinco minutos sem compartilhar objetos mutáveis", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(() => response([row()]));
    vi.stubGlobal("fetch", fetcher);
    const first = await buscarCepsPorEndereco("PA", "Santarém", "RUA CACHE", new AbortController().signal);
    first[0].bairro = "ALTERADO";
    const second = await buscarCepsPorEndereco("PA", "Santarém", "rua cache", new AbortController().signal);
    expect(second[0].bairro).toBe("CENTRO");
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 1);
    await buscarCepsPorEndereco("PA", "Santarém", "RUA CACHE", new AbortController().signal);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("aborta em 2,5 segundos e permite nova tentativa", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Timeout", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetcher);
    const check = expect(buscarCepsPorEndereco("PA", "Santarém", "RUA TIMEOUT", new AbortController().signal)).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(2500);
    await check;
  });
});
