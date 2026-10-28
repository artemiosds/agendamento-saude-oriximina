import React, { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import BpaBlockMultiSelect from "./BpaBlockMultiSelect";

const options = [{ key: "eco", label: "Tarde — ECOCARDIOGRAMA · 13:30 às 14:00" }, { key: "risco", label: "Tarde — RISCO CIRURGICO · 14:30 às 15:00" }];
function Harness() {
  const [value, setValue] = useState<string[]>([]);
  return <BpaBlockMultiSelect value={value} onChange={setValue} options={options} />;
}
afterEach(cleanup);
describe("múltipla escolha de blocos do BPA", () => {
  it("marca Eco e Risco sem fechar o menu e permite voltar a Todos", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Todos os blocos" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.getByRole("menuitemcheckbox", { name: "Todos os blocos" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: options[0].label }));
    expect(screen.getByRole("menuitemcheckbox", { name: options[0].label })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: options[1].label }));
    expect(screen.getByRole("menuitemcheckbox", { name: options[0].label })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemcheckbox", { name: options[1].label })).toHaveAttribute("aria-checked", "true");
    expect(document.getElementById("bloco_atendimento")).toHaveTextContent("2 blocos selecionados");
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Todos os blocos" }));
    expect(screen.getByRole("menuitemcheckbox", { name: "Todos os blocos" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemcheckbox", { name: options[0].label })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("menuitemcheckbox", { name: options[1].label })).toHaveAttribute("aria-checked", "false");
  });
  it("permite incluir os não identificados junto de outro bloco", () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: options[0].label }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Sem bloco identificado" }));
    expect(screen.getByRole("menuitemcheckbox", { name: "Sem bloco identificado" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: options[0].label }));
    expect(document.getElementById("bloco_atendimento")).toHaveTextContent("Sem bloco identificado");
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Sem bloco identificado" }));
    expect(document.getElementById("bloco_atendimento")).toHaveTextContent("Todos os blocos");
  });
  it("respeita bloqueio durante carregamento ou geração", () => {
    render(<BpaBlockMultiSelect value={[]} options={options} onChange={() => {}} disabled />);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
