import { afterEach, describe, expect, it, vi } from "vitest";
import { buscarEnderecoCep } from "./enderecoPaciente";
import { getCodigoIbge, getMunicipioEndereco } from "./municipiosIbge";

const ok = (data: object) => Promise.resolve({ ok: true, json: async () => data } as Response);
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("endereço via CEP", () => {
  it("prioriza BrasilAPI e resolve IBGE oficial sem outra consulta", async () => {
    const fetcher = vi.fn((_url: string) => ok({ cep: "68250000", city: "Óbidos", state: "PA", street: "Rua São João", neighborhood: "Centro" }));
    vi.stubGlobal("fetch", fetcher);
    expect(await buscarEnderecoCep("68250-000", new AbortController().signal)).toMatchObject({
      municipio: "OBIDOS", uf: "PA", ibge_municipio: "1505106", logradouro: "RUA SAO JOAO", bairro: "CENTRO",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toContain("brasilapi.com.br/api/cep/v2/68250000");
  });

  it("usa ViaCEP quando BrasilAPI retorna erro HTTP", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false })
      .mockImplementationOnce(() => ok({ cep: "68170-000", localidade: "Juruti", uf: "PA", ibge: "1503903" }));
    vi.stubGlobal("fetch", fetcher);
    expect((await buscarEnderecoCep("68170000", new AbortController().signal)).ibge_municipio).toBe("1503903");
    expect(fetcher.mock.calls[1][0]).toBe("https://viacep.com.br/ws/68170000/json/");
  });

  it("cancela BrasilAPI em 2,5 segundos e aplica o fallback", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockImplementationOnce((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Timeout", "AbortError")));
    })).mockImplementationOnce(() => ok({ cep: "68270-000", localidade: "Oriximiná", uf: "PA" }));
    vi.stubGlobal("fetch", fetcher);
    const pending = buscarEnderecoCep("68270000", new AbortController().signal);
    await vi.advanceTimersByTimeAsync(2500);
    expect((await pending).ibge_municipio).toBe("1505304");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("não dispara fallback após cancelamento pelo formulário", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Abort", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetcher);
    const pending = buscarEnderecoCep("68270000", controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejeita CEP inexistente, UF inválida e resultado de outro CEP", async () => {
    for (const data of [{ erro: "true" }, { cep: "68270-000", localidade: "Oriximiná", uf: "AM" }, { cep: "00000-000", city: "Oriximiná", state: "PA" }]) {
      vi.stubGlobal("fetch", vi.fn(() => ok(data)));
      await expect(buscarEnderecoCep("68270000", new AbortController().signal)).rejects.toThrow();
    }
  });
});

describe("base local oficial IBGE", () => {
  it("corrige códigos antigos e cobre municípios além das capitais", () => {
    expect(getCodigoIbge("Faro", "PA")).toBe("1503002");
    expect(getCodigoIbge("Curuá", "PA")).toBe("1502855");
    expect(getCodigoIbge("Terra Santa", "PA")).toBe("1507979");
    expect(getCodigoIbge("Nhamundá", "AM")).toBe("1303007");
    expect(getCodigoIbge("Campinas", "SP")).toBe("3509502");
    expect(getMunicipioEndereco("Bom Jesus")).toBeUndefined();
    expect(getMunicipioEndereco("Manaus", "AM")?.cep).toBe("");
    expect(getMunicipioEndereco("Oriximiná", "PA")?.cep).toBe("68270-000");
    expect(getMunicipioEndereco("Prainha", "PA")).toMatchObject({ cep: "68130-000", ibge: "1506005" });
    expect(getMunicipioEndereco("Almeirim", "PA")).toMatchObject({ cep: "68230-000", ibge: "1500503" });
    for (const [cidade, uf] of [["Santarém", "PA"], ["Belém", "PA"], ["Ananindeua", "PA"], ["Macapá", "AP"], ["Manaus", "AM"], ["Itaituba", "PA"]]) {
      expect(getMunicipioEndereco(cidade, uf)?.cep).toBe("");
      expect(getCodigoIbge(cidade, uf)).toMatch(/^\d{7}$/);
    }
  });
});
