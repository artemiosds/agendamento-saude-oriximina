import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DebouncedTextarea } from "@/components/ui/debounced-textarea";

describe("texto clínico com buffer externo", () => {
  it("entrega o último valor imediatamente ao buffer e mantém o texto no campo ao perder o foco", () => {
    const record = vi.fn();
    render(<DebouncedTextarea buffered aria-label="Anamnese" value="" onChange={event => record(event.target.value)} />);
    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Texto clínico" } });
    fireEvent.change(field, { target: { value: "Texto clínico completo" } });
    fireEvent.blur(field);
    expect(record.mock.calls).toEqual([["Texto clínico"], ["Texto clínico completo"]]);
    expect(field.value).toBe("Texto clínico completo");
  });

  it("aceita uma substituição explícita do texto, como copiar o SOAP anterior", () => {
    const onChange = vi.fn();
    const { rerender } = render(<DebouncedTextarea buffered value="" onChange={onChange} />);
    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Texto local" } });
    rerender(<DebouncedTextarea buffered value="SOAP anterior" onChange={onChange} />);
    expect(field.value).toBe("SOAP anterior");
  });
});
