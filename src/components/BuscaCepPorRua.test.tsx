import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BuscaCepPorRua from "./BuscaCepPorRua";
import type { EnderecoPaciente } from "@/lib/enderecoPaciente";
const api = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock("@/lib/enderecoPaciente", async original => ({
  ...await original<typeof import("@/lib/enderecoPaciente")>(), buscarCepsPorEndereco: api.search,
}));
const address: EnderecoPaciente = {
  cep: "68005000", municipio: "SANTAREM", uf: "PA", ibge_municipio: "1506807", logradouro: "RUA TESTE", bairro: "CENTRO",
};
const base = { value: "", municipio: "Santarém", uf: "PA", cep: "", placeholder: "Rua teste", onChange: vi.fn(), onSelect: vi.fn() };
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); api.search.mockResolvedValue([address]); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("busca por rua sem bloquear o formulário", () => {
  it("não consulta ao abrir, focar ou digitar; pesquisa somente ao clicar", async () => {
    const { rerender } = render(<BuscaCepPorRua {...base} value="RUA SALVA" />);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(api.search).not.toHaveBeenCalled();
    fireEvent.focus(screen.getByPlaceholderText("Rua teste"));
    for (const value of ["SAO", "SAO J", "SAO JOAO"]) {
      rerender(<BuscaCepPorRua {...base} value={value} />);
      await act(() => vi.advanceTimersByTimeAsync(100));
    }
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(api.search).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Pesquisar CEP desta rua" })));
    expect(api.search).toHaveBeenCalledTimes(1);
  });
  it("descarta resposta antiga e cancela requisição ao trocar município", async () => {
    let resolve: (rows: EnderecoPaciente[]) => void;
    let signal: AbortSignal;
    api.search.mockImplementation((_uf, _city, _street, s) => { signal = s; return new Promise(r => { resolve = r; }); });
    const { rerender } = render(<BuscaCepPorRua {...base} value="RUA UM" />);
    fireEvent.click(screen.getByRole("button", { name: "Pesquisar CEP desta rua" }));
    rerender(<BuscaCepPorRua {...base} value="RUA UM" municipio="Belém" />);
    expect(signal!.aborted).toBe(true);
    await act(async () => resolve!([address]));
    expect(screen.queryByRole("list", { name: "Endereços encontrados" })).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(api.search).toHaveBeenCalledTimes(1);
  });
  it("carregar resultados não redesenha o formulário pai e não bloqueia Salvar", async () => {
    let resolve: (rows: EnderecoPaciente[]) => void;
    api.search.mockImplementation(() => new Promise(r => { resolve = r; }));
    const parentRender = vi.fn(), save = vi.fn();
    function Form() {
      parentRender();
      const [street, setStreet] = useState("");
      return <><BuscaCepPorRua {...base} value={street} onChange={setStreet} /><button onClick={save}>Salvar</button></>;
    }
    render(<Form />);
    fireEvent.change(screen.getByPlaceholderText("Rua teste"), { target: { value: "RUA TESTE" } });
    const count = parentRender.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Pesquisar CEP desta rua" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(parentRender).toHaveBeenCalledTimes(count);
    await act(async () => resolve!([address]));
    expect(parentRender).toHaveBeenCalledTimes(count);
    fireEvent.click(screen.getByRole("button", { name: /68005-000/ }));
    expect(base.onSelect).toHaveBeenCalledWith(address);
  });
  it("falha de conexão não desabilita o campo e permite tentar novamente", async () => {
    api.search.mockRejectedValueOnce(new Error("offline"));
    render(<BuscaCepPorRua {...base} value="RUA OFFLINE" />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Pesquisar CEP desta rua" })));
    expect(screen.getByPlaceholderText("Rua teste")).not.toBeDisabled();
    expect(screen.getByText(/continuar preenchendo manualmente/)).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" })));
    expect(api.search).toHaveBeenCalledTimes(2);
  });
  it("não pesquisa sem os dados mínimos ou em município com CEP geral", () => {
    const { rerender } = render(<BuscaCepPorRua {...base} value="AB" />);
    expect(screen.queryByRole("button", { name: "Pesquisar CEP desta rua" })).not.toBeInTheDocument();
    rerender(<BuscaCepPorRua {...base} value="RUA TESTE" municipio="Oriximiná" cep="68270-000" />);
    expect(screen.queryByRole("button", { name: "Pesquisar CEP desta rua" })).not.toBeInTheDocument();
    expect(api.search).not.toHaveBeenCalled();
  });
});
