import { describe, expect, it } from "vitest";
import { extractBpaCidCodes, resolveBpaCid, resolveBpaCidDetails, resolveBpaTreatmentCycleCid, resolveBpaTreatmentCycleCidsForProcedures } from "./bpaCid";

describe("CID estruturado sem perda de vínculo", () => {
  it("lê listas, objetos e JSON e prioriza o diagnóstico marcado", () => {
    const valores = [{ codigo: "F82" }, { cid_codigo: "G80.9", principal: true }, { value: "M54.5" }];
    expect(extractBpaCidCodes(valores)).toEqual(["G809", "F82", "M545"]);
    expect(extractBpaCidCodes(JSON.stringify(valores))).toEqual(["G809", "F82", "M545"]);
  });
  it("preserva cinco CIDs do procedimento sem misturar outro diagnóstico do paciente", () => {
    expect(resolveBpaCidDetails({ procedureCid: ["F82", "G809", "M545", "F840", "R262"], paciente: { cid: "I10" } }))
      .toEqual({ cid: "F82", adicionais: ["G809", "M545", "F840", "R262"] });
  });
  it("aceita prontuário sem PTS e PTS estruturado apenas como fallback", () => {
    expect(resolveBpaCid({ prontuario: { custom_data: { esp_hipotese_cid: { codigo: "F82" } } }, ptsCid: "G809" })).toBe("F82");
    expect(resolveBpaCidDetails({ ptsCid: [{ cid_codigo: "G809" }, { cid_codigo: "F82" }] })).toEqual({ cid: "G809", adicionais: ["F82"] });
  });
  it("não extrai diagnósticos de propriedades sem vínculo e suporta objetos circulares", () => {
    const v: any = { observacao: "I10", codigo: "F82" }; v.cids = v;
    expect(extractBpaCidCodes(v)).toEqual(["F82"]);
  });
});

describe("CID da linha BPA-I", () => {
  it("recupera CID salvo pelo resolvedor nos campos cid10/cid_principal", () => {
    expect(resolveBpaCid({ prontuario: { custom_data: { cid10: "M54.5 - Lombalgia" } } })).toBe("M545");
    expect(resolveBpaCid({ prontuario: { custom_data: { cid_principal: "F84.0" } } })).toBe("F840");
  });

  it("prioriza vínculo específico do SIGTAP e não fabrica um código", () => {
    expect(resolveBpaCid({
      procedureCid: "G80",
      prontuario: { custom_data: { cid10: "M54.5" } },
    })).toBe("G80");
    expect(resolveBpaCid({ prontuario: { custom_data: { evolucao: "dor crônica" } } })).toBe("");
  });

  it("mantém compatibilidade com código simples e com CID embutido em texto", () => {
    expect(extractBpaCidCodes("CID: I64 / AVC")).toEqual(["I64"]);
  });
});

describe("resolveBpaCid — hipótese e PTS", () => {
  it("usa a hipótese do prontuário", () => {
    expect(resolveBpaCid({ prontuario: { hipotese: "F84.0 autismo" } })).toBe("F840");
  });
  it("usa o CID do PTS quando o prontuário não tem CID", () => {
    expect(resolveBpaCid({ prontuario: {}, ptsCid: "G80.9" })).toBe("G809");
  });
  it("prontuário tem prioridade sobre o PTS", () => {
    expect(resolveBpaCid({ prontuario: { custom_data: { esp_hipotese_cid: "M54.5" } }, ptsCid: "G80.9" })).toBe("M545");
  });
});

describe("CID por continuidade do ciclo de tratamento", () => {
  const base = {
    cycleId: "ciclo-1",
    procedureCode: "0302050027",
    patientId: "paciente-1",
    professionalId: "prof-1",
    unitId: "unidade-1",
    status: "realizada",
  };
  const target = {
    ...base,
    appointmentId: "agenda-7",
    sessionNumber: 7,
    scheduledDate: "2026-10-27",
  };

  it("usa o CID da sessão mais próxima do mesmo ciclo e procedimento", () => {
    const result = resolveBpaTreatmentCycleCid([
      { ...base, appointmentId: "agenda-4", sessionNumber: 4, scheduledDate: "2026-10-15", cids: ["M758", "M759", "M755"] },
      { ...base, appointmentId: "agenda-5", sessionNumber: 5, scheduledDate: "2026-10-20", cids: ["M759", "M755", "M758"] },
      { ...base, appointmentId: "agenda-6", sessionNumber: 6, scheduledDate: "2026-10-22", cids: ["M758", "M759"] },
      { ...base, appointmentId: "agenda-8", sessionNumber: 8, scheduledDate: "2026-10-29", cids: ["M758", "M751"] },
    ], target);
    expect(result).toEqual({ cids: ["M758", "M759"], sessionNumber: 6, scheduledDate: "2026-10-22" });
  });

  it("recupera CID entre competências diferentes quando o ciclo é o mesmo", () => {
    const result = resolveBpaTreatmentCycleCid([
      { ...base, appointmentId: "agenda-outubro", sessionNumber: 8, scheduledDate: "2026-10-29", cids: ["M758", "M751"] },
      { ...base, appointmentId: "agenda-novembro", sessionNumber: 9, scheduledDate: "2026-11-03", cids: ["M759"] },
    ], {
      ...base,
      appointmentId: "agenda-novembro-alvo",
      sessionNumber: 10,
      scheduledDate: "2026-11-05",
    });
    expect(result).toEqual({ cids: ["M759"], sessionNumber: 9, scheduledDate: "2026-11-03" });
  });

  it("pode recuperar de uma sessão posterior quando as primeiras sessões não têm CID", () => {
    const result = resolveBpaTreatmentCycleCid([
      { ...base, appointmentId: "agenda-4", sessionNumber: 4, scheduledDate: "2026-10-15", cids: ["M758", "M759", "M755"] },
      { ...base, appointmentId: "agenda-5", sessionNumber: 5, scheduledDate: "2026-10-20", cids: ["M759", "M755", "M758"] },
    ], { ...base, appointmentId: "agenda-1", sessionNumber: 1, scheduledDate: "2026-10-06" });
    expect(result?.cids).toEqual(["M758", "M759", "M755"]);
    expect(result?.sessionNumber).toBe(4);
  });

  it("não reutiliza CID de falta, outro ciclo, outro procedimento ou outro vínculo", () => {
    const result = resolveBpaTreatmentCycleCid([
      { ...base, appointmentId: "agenda-falta", sessionNumber: 6, status: "falta", cids: ["F840"] },
      { ...base, appointmentId: "agenda-outro-ciclo", cycleId: "ciclo-2", sessionNumber: 6, cids: ["F840"] },
      { ...base, appointmentId: "agenda-outro-proc", procedureCode: "0301010072", sessionNumber: 6, cids: ["F840"] },
      { ...base, appointmentId: "agenda-outro-paciente", patientId: "paciente-2", sessionNumber: 6, cids: ["F840"] },
      { ...base, appointmentId: "agenda-7", sessionNumber: 7, cids: ["F840"] },
    ], target);
    expect(result).toBeNull();
  });

  it("recupera CID antes da validação apenas para o mesmo SIGTAP no ciclo do paciente", () => {
    const candidates = [
      {
        ...base,
        appointmentId: "agenda-14",
        sessionNumber: 3,
        scheduledDate: "2026-10-14",
        cids: ["M538", "M545", "M796"],
      },
    ];
    const resolved = resolveBpaTreatmentCycleCidsForProcedures(
      [
        { codigo: "0302050027", cid: "" },
        { codigo: "0301010048", cid: "" },
        { codigo: "0302050027", cid: "F840" },
      ],
      candidates,
      {
        cycleId: "ciclo-1",
        patientId: "paciente-1",
        professionalId: "prof-1",
        unitId: "unidade-1",
        appointmentId: "agenda-7",
        sessionNumber: 1,
        scheduledDate: "2026-10-07",
      },
    );

    expect(resolved.get("0302050027")).toEqual({
      cids: ["M538", "M545", "M796"],
      sessionNumber: 3,
      scheduledDate: "2026-10-14",
    });
    expect(resolved.has("0301010048")).toBe(false);

    // Quando a própria linha já tem CID, o fallback não cria nem substitui valor.
    const alreadyHasCid = resolveBpaTreatmentCycleCidsForProcedures(
      [{ codigo: "0302050027", cid: "F840" }],
      candidates,
      {
        cycleId: "ciclo-1",
        patientId: "paciente-1",
        professionalId: "prof-1",
        unitId: "unidade-1",
        appointmentId: "agenda-7",
        sessionNumber: 1,
        scheduledDate: "2026-10-07",
      },
    );
    expect(alreadyHasCid.size).toBe(0);
  });

  it("prioriza o CID do atendimento atual antes do fallback do ciclo", () => {
    expect(resolveBpaCidDetails({
      procedureCid: ["M545"],
      treatmentCycleCid: ["F840", "F82"],
    })).toEqual({ cid: "M545", adicionais: [] });
  });

  it("só usa o CID do ciclo quando as fontes do atendimento atual estão vazias", () => {
    expect(resolveBpaCidDetails({ treatmentCycleCid: ["F840", "F82"] }))
      .toEqual({ cid: "F840", adicionais: ["F82"] });
  });
});
