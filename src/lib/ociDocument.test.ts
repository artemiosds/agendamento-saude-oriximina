import { describe, expect, it } from "vitest";
import { createEmptyOciData, renderOciDocument, type OciPatientData } from "./ociDocument";

const paciente: OciPatientData = {
  nome: "Paciente de teste",
  sexo: "Masculino",
  prontuario: "123",
  cns: "",
  dataNascimento: "",
  racaCor: "",
  etnia: "",
  nomeMae: "",
  nomeResponsavel: "",
  telefone: "",
  telefoneResponsavel: "",
  enderecoCompleto: "",
  municipio: "",
  codigoIbge: "",
  uf: "",
  cep: "",
};

const profissional = {
  nome: "Profissional não autorizado para a solicitação",
  documentoTipo: "CNS" as const,
  documentoNumero: "777888999",
  conselho: "COREN",
  numeroConselho: "12345",
  ufConselho: "PA",
  carimboHtml: '<div class="carimbo-digital">Assinatura automática</div>',
};

describe("documento OCI", () => {
  it("mantém estabelecimento e CNES vazios mesmo quando existirem dados da unidade", () => {
    const data = createEmptyOciData(paciente, profissional, "Unidade de teste", "1234567");
    const html = renderOciDocument(data);
    const estabelecimento = html.split('IDENTIFICAÇÃO DO ESTABELECIMENTO DE SAÚDE (SOLICITANTE)</div>')[1]
      .split('IDENTIFICAÇÃO DO PACIENTE</div>')[0];

    expect(estabelecimento).toContain("Nome do estabelecimento de saúde solicitante");
    expect(estabelecimento).toContain("CNES");
    expect(estabelecimento).not.toContain("Unidade de teste");
    expect(estabelecimento).not.toContain("1234567");
    expect(html).toContain("Paciente de teste");
  });

  it("deixa Solicitação e assinatura vazias, mesmo com dados do profissional disponíveis", () => {
    const data = createEmptyOciData(paciente, profissional, "Unidade de teste", "1234567");
    data.dataSolicitacao = "2026-09-29";

    const html = renderOciDocument(data);
    const solicitacao = html.split('<div class="oci-section">SOLICITAÇÃO</div>')[1]
      .split('<div class="oci-section">AUTORIZAÇÃO</div>')[0];

    expect(solicitacao).toContain("Nome do profissional solicitante");
    expect(solicitacao).toContain("Assinatura e carimbo");
    expect(solicitacao).not.toContain(profissional.nome);
    expect(solicitacao).not.toContain(profissional.documentoNumero);
    expect(solicitacao).not.toContain("Assinatura automática");
    expect(solicitacao).not.toContain("29/09/2026");
    expect(solicitacao).not.toContain('class="oci-checkbox">X');
    expect(html).toContain("Paciente de teste");
  });

  it("usa 15 linhas por padrão e preserva configurações e procedimentos existentes", () => {
    const data = createEmptyOciData(paciente, profissional, "Unidade de teste", "1234567");
    const countRows = (html: string) => html.split('<div class="oci-secondary-list">')[1]
      .split('<div class="oci-section">SOLICITAÇÃO</div>')[0]
      .match(/class="oci-proc-row /g)?.length ?? 0;

    expect(countRows(renderOciDocument(data))).toBe(15);
    expect(countRows(renderOciDocument(data, null, { oci: { linhas_secundarias: 20 } }))).toBe(20);

    data.procedimentosSecundarios = Array.from({ length: 17 }, (_, i) => ({
      codigo: String(i), nome: `Procedimento ${i}`, quantidade: 1,
    }));
    expect(countRows(renderOciDocument(data))).toBe(17);
  });
});
