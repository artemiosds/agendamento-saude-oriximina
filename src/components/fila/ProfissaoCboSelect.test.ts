import { describe, expect, it } from "vitest";
import { buildProfissaoOptions } from "./ProfissaoCboSelect";

describe("seletor de profissão e CBO da fila", () => {
  it("exibe e disponibiliza o CBO quando todos os profissionais têm o mesmo código", () => {
    const options = buildProfissaoOptions([
      { id: "1", nome: "A", profissao: "Fisioterapeuta", customData: { cbo_codigo: "223605" } },
      { id: "2", nome: "B", profissao: "Fisioterapeuta", customData: { cbo_codigo: "223605" } },
    ]);

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      value: "Fisioterapeuta",
      label: "Fisioterapeuta • CBO 223605",
      cboCodigo: "223605",
      total: 2,
    });
  });

  it("não escolhe um código quando a mesma profissão tem CBOs diferentes", () => {
    const options = buildProfissaoOptions([
      { id: "1", nome: "A", profissao: "Fisioterapeuta", customData: { cbo_codigo: "223605" } },
      { id: "2", nome: "B", profissao: "Fisioterapeuta", customData: { cbo_codigo: "223606" } },
    ]);

    expect(options[0]).toMatchObject({
      label: "Fisioterapeuta • CBO múltiplos",
      total: 2,
    });
    expect(options[0].cboCodigo).toBeUndefined();
  });

  it("não confirma CBO único quando algum profissional da profissão está sem código", () => {
    const options = buildProfissaoOptions([
      { id: "1", nome: "A", profissao: "Fonoaudióloga", customData: { cbo_codigo: "223810" } },
      { id: "2", nome: "B", profissao: "Fonoaudióloga", customData: {} },
    ]);

    expect(options[0]).toMatchObject({
      label: "Fonoaudióloga • CBO não confirmado",
      total: 2,
    });
    expect(options[0].cboCodigo).toBeUndefined();
  });

  it("mantém a profissão sem inventar código quando todos estão sem CBO", () => {
    const options = buildProfissaoOptions([
      { id: "1", nome: "A", profissao: "Psicóloga", customData: {} },
      { id: "2", nome: "B", profissao: "Psicóloga", customData: {} },
    ]);

    expect(options[0]).toMatchObject({ value: "Psicóloga", label: "Psicóloga", total: 2 });
    expect(options[0].cboCodigo).toBeUndefined();
  });
});
