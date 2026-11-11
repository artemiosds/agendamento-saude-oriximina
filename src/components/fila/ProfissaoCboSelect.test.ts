import { describe, expect, it } from "vitest";
import { buildProfissaoOptions, getProfissaoLabel } from "./ProfissaoCboSelect";

describe("seletor de profissão e CBO da fila", () => {
  it("agrupa profissionais quando todos compartilham o mesmo CBO", () => {
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

  it("oferece cada CBO separadamente quando a profissão possui códigos diferentes", () => {
    const options = buildProfissaoOptions([
      { id: "1", nome: "A", profissao: "Fisioterapeuta", customData: { cbo_codigo: "223605" } },
      { id: "2", nome: "B", profissao: "Fisioterapeuta", customData: { cbo_codigo: "223606" } },
    ]);
    expect(options).toHaveLength(2);
    expect(options.map((option) => option.cboCodigo)).toEqual(["223605", "223606"]);
    expect(options.every((option) => option.value === "Fisioterapeuta")).toBe(true);
  });

  it("mantém a opção sem CBO separada e não associa o código de outro profissional", () => {
    const options = buildProfissaoOptions([
      { id: "1", nome: "A", profissao: "Fonoaudióloga", customData: { cbo_codigo: "223810" } },
      { id: "2", nome: "B", profissao: "Fonoaudióloga", customData: {} },
    ]);
    expect(options).toHaveLength(2);
    expect(options.find((option) => option.cboCodigo === "223810")?.label).toBe("Fonoaudióloga • CBO 223810");
    expect(options.find((option) => !option.cboCodigo)?.label).toBe("Fonoaudióloga • CBO não informado");
  });

  it("expõe claramente quando todos os profissionais estão sem CBO", () => {
    const options = buildProfissaoOptions([
      { id: "1", nome: "A", profissao: "Psicóloga", customData: {} },
      { id: "2", nome: "B", profissao: "Psicóloga", customData: {} },
    ]);
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      value: "Psicóloga",
      label: "Psicóloga • CBO não informado",
      total: 2,
    });
    expect(options[0].cboCodigo).toBeUndefined();
  });

  it("não escolhe arbitrariamente um CBO no rótulo geral quando há vários", () => {
    expect(getProfissaoLabel([
      { id: "1", nome: "A", profissao: "Fisioterapeuta", customData: { cbo_codigo: "223605" } },
      { id: "2", nome: "B", profissao: "Fisioterapeuta", customData: { cbo_codigo: "223606" } },
    ], "Fisioterapeuta")).toBe("Fisioterapeuta • CBO múltiplos");
  });
});