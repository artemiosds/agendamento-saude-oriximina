import React, { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DebouncedTextarea } from "./debounced-textarea";

describe("DebouncedTextarea", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("mantém a digitação local e envia apenas o texto completo após a pausa", () => {
    const onChange = vi.fn();
    render(<DebouncedTextarea name="evolucao" value="" onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Evo" } });
    act(() => { vi.advanceTimersByTime(300); });
    fireEvent.change(input, { target: { value: "Evolução completa" } });
    expect(input).toHaveValue("Evolução completa");
    expect(onChange).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(499); });
    expect(onChange).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].target).toEqual({ value: "Evolução completa", name: "evolucao" });
  });

  it("entrega o último texto ao formulário antes do clique em salvar", () => {
    const save = vi.fn();
    function Form() {
      const [text, setText] = useState("");
      return <><DebouncedTextarea value={text} onChange={e => setText(e.target.value)} />
        <button onClick={() => save(text)}>Salvar</button></>;
    }
    render(<Form />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Última letra preservada" } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(save).toHaveBeenCalledWith("Última letra preservada");
  });

  it("envia uma única vez o valor pendente e o nome do campo ao desmontar", () => {
    const onChange = vi.fn();
    const { unmount } = render(<DebouncedTextarea name="conduta" value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Conduta final" } });
    unmount();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].target).toEqual({ value: "Conduta final", name: "conduta" });
    act(() => { vi.runAllTimers(); });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("preserva texto pendente durante atualização externa e aceita dados carregados sem pendência", () => {
    const onChange = vi.fn();
    const { rerender } = render(<DebouncedTextarea value="Inicial" onChange={onChange} rows={2} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Texto em edição" } });
    rerender(<DebouncedTextarea value="Inicial" onChange={onChange} rows={3} />);
    expect(screen.getByRole("textbox")).toHaveValue("Texto em edição");
    expect(onChange).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(500); });
    rerender(<DebouncedTextarea value="Texto em edição" onChange={onChange} rows={3} />);
    rerender(<DebouncedTextarea value="Outro registro" onChange={onChange} rows={3} />);
    expect(screen.getByRole("textbox")).toHaveValue("Outro registro");
  });
});
