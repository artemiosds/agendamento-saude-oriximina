import { beforeEach, describe, expect, it, vi } from "vitest";

const printMock = vi.hoisted(() => ({ open: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/printLayout", () => ({ openPrintDocument: printMock.open }));

import { openPrintDocument } from "@/lib/printLayout";
import { printComprovanteAgendamento } from "./printComprovanteAgendamento";

beforeEach(() => vi.clearAllMocks());

describe("comprovante de agendamento em uma página A4", () => {
  it("usa layout compacto específico sem remover as informações obrigatórias", async () => {
    await printComprovanteAgendamento({
      id: "AGTESTE1",
      data: "2026-10-27",
      hora: "08:00",
      tipo: "Consulta",
      status: "confirmado",
      profissionalNome: "PROFISSIONAL DE TESTE",
      pacienteNome: "PACIENTE DE TESTE",
      pacienteCpf: "00000000000",
      pacienteCns: "700000000000000",
      unidadeNome: "UNIDADE DE TESTE",
      unidadeEndereco: "RUA DE TESTE, CENTRO",
      unidadeTelefone: "93999999999",
    });

    const [title, body, meta, override] = (vi.mocked(openPrintDocument).mock.calls[0] as unknown as [
      string, string, Record<string, string>, {
        margens: { superior: number; inferior: number; esquerda: number; direita: number };
        tipografia: { fonte: string; tamanhoBase: number; tamanhoTitulo: number; espacamento: number; alinhamento: string };
      },
    ]);

    expect(title).toBe("Comprovante de Agendamento");
    expect(meta).toEqual({ Unidade: "UNIDADE DE TESTE" });
    expect(body).toContain('class="content-block comprovante-agendamento"');
    expect(body).toContain('class="receipt-guidance"');
    expect(body).toContain('class="receipt-code"');
    expect(body).toContain(".doc-header .logo-slot img.round { width: 54px !important; max-width: 54px !important; }");
    for (const requiredText of [
      "PACIENTE DE TESTE",
      "00000000000",
      "700000000000000",
      "PROFISSIONAL DE TESTE",
      "Documentos obrigatórios para o atendimento:",
      "CPF.",
      "Cartão SUS (CNS).",
      "Chegue com 15 minutos de antecedência.",
      "Se não puder comparecer, avise a unidade com antecedência.",
      "Código de conferência",
    ]) {
      expect(body).toContain(requiredText);
    }
    expect(override).toMatchObject({
      margens: { superior: 12, inferior: 20, esquerda: 12, direita: 12 },
      tipografia: { fonte: "Arial", tamanhoBase: 9, tamanhoTitulo: 12, espacamento: 1.1, alinhamento: "left" },
    });
  });
});
