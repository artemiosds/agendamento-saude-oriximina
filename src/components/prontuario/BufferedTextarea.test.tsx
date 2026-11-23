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

  it("protege texto, foco e seleção contra prop atrasada no modo protegido", () => {
    const onChange = vi.fn();
    const { rerender } = render(<DebouncedTextarea buffered bufferedResetKey={0} value="Inicial" onChange={onChange} />);
    const field = screen.getByRole('textbox') as HTMLTextAreaElement;
    field.focus();
    fireEvent.change(field, { target: { value: 'Texto clínico mais recente' } });
    field.setSelectionRange(5, 12);
    rerender(<DebouncedTextarea buffered bufferedResetKey={0} value="Resposta antiga do servidor" onChange={onChange} />);
    expect(field).toHaveValue('Texto clínico mais recente');
    expect(field).toHaveFocus();
    expect([field.selectionStart, field.selectionEnd]).toEqual([5, 12]);
    fireEvent.blur(field);
    rerender(<DebouncedTextarea buffered bufferedResetKey={0} rows={4} value="Resposta antiga do servidor" onChange={onChange} />);
    expect(field).toHaveValue('Texto clínico mais recente');
  });

  it("aceita comando explícito e outra ficha mesmo quando o valor externo não mudou", () => {
    const onChange = vi.fn();
    const { rerender } = render(<DebouncedTextarea buffered bufferedResetKey={0} value="" onChange={onChange} />);
    const field = screen.getByRole('textbox');
    fireEvent.change(field, { target: { value: 'Paciente anterior' } });
    rerender(<DebouncedTextarea buffered bufferedResetKey={1} value="" onChange={onChange} />);
    expect(field).toHaveValue('');
    fireEvent.change(field, { target: { value: 'Texto digitado' } });
    rerender(<DebouncedTextarea buffered bufferedResetKey={2} value="SOAP anterior confirmado" onChange={onChange} />);
    expect(field).toHaveValue('SOAP anterior confirmado');
  });
});
