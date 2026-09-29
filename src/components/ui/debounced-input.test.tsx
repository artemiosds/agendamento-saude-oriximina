import React, { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DebouncedInput } from "./debounced-input";

describe("DebouncedInput", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("envia o valor completo após a digitação parar", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { container } = render(<DebouncedInput value="" onChange={onChange} debounceMs={300} />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "Mar" } });
    fireEvent.change(input, { target: { value: "Maria" } });
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(300); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].target.value).toBe("Maria");
  });

  it("atualiza a busca controlada com o nome digitado", async () => {
    vi.useFakeTimers();
    const SearchField = () => {
      const [search, setSearch] = useState("");
      return <><DebouncedInput value={search} onChange={(event) => setSearch(event.target.value)} debounceMs={300} /><output>{search}</output></>;
    };
    render(<SearchField />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "João" } });
    expect(screen.getByRole("status")).toHaveTextContent("");

    await act(async () => { vi.advanceTimersByTime(300); });
    expect(screen.getByRole("status")).toHaveTextContent("João");
  });
});
