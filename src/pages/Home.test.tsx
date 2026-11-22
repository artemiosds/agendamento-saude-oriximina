import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import Home from "./Home";

afterEach(cleanup);

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function renderHome() {
  render(<MemoryRouter><Home /><Location /></MemoryRouter>);
}

describe("Home navigation", () => {
  it("keeps the citizen actions linked to the existing scheduling and portal routes", () => {
    renderHome();
    const hero = screen.getByRole("heading", { name: "Sua saúde, mais perto de você." }).closest("section")!;
    expect(hero.querySelectorAll("a")).toHaveLength(2);
    fireEvent.click(screen.getByRole("link", { name: "Agendar Online" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/agendar");
    const portal = screen.getByRole("link", { name: "Acessar Portal do Paciente" });
    expect(portal).toHaveAccessibleDescription("Já tem consulta marcada? Veja seus agendamentos e imprima comprovantes no Portal do Paciente.");
    expect(hero.querySelector("a button")).toBeNull();
    fireEvent.click(portal);
    expect(screen.getByTestId("location")).toHaveTextContent("/portal");
  });

  it("makes the patient portal available directly in the public navigation", () => {
    renderHome();
    const navigation = screen.getByRole("navigation", { name: "Navegação principal" });
    const portal = within(navigation).getByRole("link", { name: "Portal do Paciente" });
    expect(portal).toHaveAttribute("href", "/portal");
    fireEvent.click(portal);
    expect(screen.getByTestId("location")).toHaveTextContent("/portal");
  });

  it("opens restricted access and preserves both professional destinations", async () => {
    renderHome();
    fireEvent.keyDown(screen.getByRole("button", { name: "Área Restrita" }), { key: "ArrowDown" });
    const server = await screen.findByRole("menuitem", { name: "Painel do Servidor" });
    expect(server).toHaveAttribute("href", "/login");
    expect(screen.getByRole("menuitem", { name: "Acesso Regulador / Externo" })).toHaveAttribute("href", "/externo");
    fireEvent.click(server);
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
  });
});
