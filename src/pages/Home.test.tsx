import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    fireEvent.click(screen.getByRole("link", { name: "Consultar Agendamento" }));
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
