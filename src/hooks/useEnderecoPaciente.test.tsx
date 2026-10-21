import { useState } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEnderecoPaciente } from "./useEnderecoPaciente";
import type { EnderecoPaciente } from "@/lib/enderecoPaciente";

const mocks = vi.hoisted(() => ({ buscar: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/enderecoPaciente", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/enderecoPaciente")>(), buscarEnderecoCep: mocks.buscar,
}));
vi.mock("sonner", () => ({ toast: { warning: mocks.warning, info: mocks.info } }));
const initial: EnderecoPaciente = {
  cep: "68270-000", municipio: "Oriximiná", uf: "PA", ibge_municipio: "1505304", logradouro: "", bairro: "",
};
const resultCep = (municipio = "OBIDOS"): EnderecoPaciente => ({
  ...initial, cep: "68250000", municipio, uf: "PA", ibge_municipio: "1505106", logradouro: "RUA UM", bairro: "CENTRO",
});
function useForm(start = initial, key = "patient") {
  const [form, setForm] = useState({ ...start, numero: "12", complemento: "CASA", nome: "PACIENTE" });
  const address = useEnderecoPaciente(form, patch => setForm(prev => ({ ...prev, ...patch })), key);
  return { form, setForm, ...address };
}
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("automação segura do endereço", () => {
  it("não consulta nem modifica dados ao montar um paciente existente", async () => {
    const start = { ...initial, cep: "", municipio: "Manaus", uf: "AM", ibge_municipio: "", logradouro: "Rua antiga" };
    const { result } = renderHook(() => useForm(start));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.form).toMatchObject(start);
    expect(mocks.buscar).not.toHaveBeenCalled();
  });

  it("aplica debounce e evita consulta duplicada no blur", async () => {
    mocks.buscar.mockResolvedValue(resultCep());
    const { result } = renderHook(() => useForm());
    act(() => result.current.changeCep("68250-000"));
    await act(() => vi.advanceTimersByTimeAsync(349));
    expect(mocks.buscar).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    await act(() => result.current.lookupCep());
    expect(mocks.buscar).toHaveBeenCalledTimes(1);
    expect(result.current.form).toMatchObject({ municipio: "OBIDOS", ibge_municipio: "1505106", numero: "12", complemento: "CASA" });
  });

  it("preserva digitação no endereço e em outros campos durante a consulta", async () => {
    let resolve: (v: EnderecoPaciente) => void;
    mocks.buscar.mockImplementation(() => new Promise(r => { resolve = r; }));
    const { result } = renderHook(() => useForm());
    act(() => result.current.changeCep("68250-000"));
    await act(() => vi.advanceTimersByTimeAsync(350));
    act(() => {
      result.current.changeField("logradouro", "RUA MANUAL");
      result.current.setForm(p => ({ ...p, nome: "NOME EDITADO" }));
    });
    await act(async () => { resolve!(resultCep()); });
    expect(result.current.form).toMatchObject({ logradouro: "RUA MANUAL", nome: "NOME EDITADO", bairro: "CENTRO" });
  });

  it("descarta resposta atrasada quando o atendente troca o CEP", async () => {
    const resolvers: Array<(v: EnderecoPaciente) => void> = [];
    mocks.buscar.mockImplementation(() => new Promise(r => resolvers.push(r)));
    const { result } = renderHook(() => useForm());
    act(() => result.current.changeCep("68250-000"));
    await act(() => vi.advanceTimersByTimeAsync(350));
    act(() => result.current.changeCep("68170-000"));
    await act(() => vi.advanceTimersByTimeAsync(350));
    await act(async () => resolvers[1]({ ...resultCep("JURUTI"), ibge_municipio: "1503903" }));
    await act(async () => resolvers[0](resultCep()));
    expect(result.current.form).toMatchObject({ cep: "68170-000", municipio: "JURUTI", ibge_municipio: "1503903" });
  });

  it("preenche UF/IBGE e CEP vazio pelo município, preservando CEP informado", () => {
    const { result } = renderHook(() => useForm({ ...initial, cep: "" }));
    act(() => result.current.selectMunicipio("Óbidos", "PA"));
    expect(result.current.form).toMatchObject({ cep: "68250-000", municipio: "OBIDOS", uf: "PA", ibge_municipio: "1505106" });
    act(() => result.current.selectMunicipio("Manaus", "AM"));
    expect(result.current.form).toMatchObject({ cep: "68250-000", uf: "AM", ibge_municipio: "1302603" });
    act(() => result.current.selectUf("PA"));
    expect(result.current.form).toMatchObject({ municipio: "", uf: "PA", ibge_municipio: "" });
  });

  it("falha de rede mantém campos editáveis e encerra o spinner", async () => {
    mocks.buscar.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useForm());
    act(() => result.current.changeCep("68250-000"));
    await act(() => vi.advanceTimersByTimeAsync(350));
    expect(result.current.loading).toBe(false);
    expect(mocks.warning).toHaveBeenCalledTimes(1);
    act(() => result.current.changeField("bairro", "MANUAL"));
    expect(result.current.form.bairro).toBe("MANUAL");
  });

  it("cancela consulta ao desmontar e não aplica resposta a outro paciente", async () => {
    let resolve: (v: EnderecoPaciente) => void;
    let signal: AbortSignal;
    mocks.buscar.mockImplementation((_cep, s) => { signal = s; return new Promise(r => { resolve = r; }); });
    const { result, unmount } = renderHook(() => useForm());
    act(() => result.current.changeCep("68250-000"));
    await act(() => vi.advanceTimersByTimeAsync(350));
    unmount();
    expect(signal!.aborted).toBe(true);
    await act(async () => resolve!(resultCep()));
    expect(mocks.warning).not.toHaveBeenCalled();
  });

  it("descarta resultado ao trocar de paciente sem desmontar o formulário", async () => {
    let resolve: (v: EnderecoPaciente) => void;
    mocks.buscar.mockImplementation(() => new Promise(r => { resolve = r; }));
    const { result, rerender } = renderHook(({ id }) => useForm(initial, id), { initialProps: { id: "p1" } });
    act(() => result.current.changeCep("68250-000"));
    await act(() => vi.advanceTimersByTimeAsync(350));
    rerender({ id: "p2" });
    await act(async () => resolve!(resultCep()));
    expect(result.current.form.municipio).toBe("Oriximiná");
    expect(result.current.loading).toBe(false);
  });
});
