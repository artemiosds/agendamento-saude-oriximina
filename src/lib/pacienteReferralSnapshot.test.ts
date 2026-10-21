import { describe, expect, it } from "vitest";
import { emptyPacienteForm } from "@/components/CadastroPacienteForm";
import { latestReferral, mergeLatestReferral, patientDemographicUpdate } from "./pacienteReferralSnapshot";
import type { PatientReferral } from "@/services/patientReferralService";

describe("isolamento da gravação cadastral e do histórico", () => {
  it("sincroniza somente campos de encaminhamento presentes na notificação", () => {
    const form = { ...emptyPacienteForm, nome: "NOME EDITADO", telefone: "93999999999",
      customData: { cep: "68270-000", campo_extra: true }, justificativa: "MANTER" };
    const next = mergeLatestReferral(form, { especialidade_destino: "FONOAUDIOLOGIA", cid: "H90", ubs_origem: null });
    expect(next).toMatchObject({ nome: form.nome, telefone: form.telefone, especialidadeDestino: "FONOAUDIOLOGIA",
      cid: "H90", ubsOrigem: "", justificativa: "MANTER", customData: form.customData });
    expect(form.cid).toBe("");
  });
  it("UPDATE cadastral não sobrescreve o histórico mesmo com snapshot antigo", () => {
    const original = { nome: "ANTIGO", cid: "CID NOVO", especialidade_destino: "FONOAUDIOLOGIA",
      ubs_origem: "UBS NOVA", profissional_solicitante: "NOVO", tipo_encaminhamento: "ubs",
      diagnostico_resumido: "NOVO", justificativa: "NOVA", data_encaminhamento: "2026-10-21" };
    const update = patientDemographicUpdate({ ...original, nome: "ATUALIZADO", cid: "CID VELHO",
      especialidade_destino: "ANTIGA", unidade_id: "unidade-preservada", custom_data: { cep: "68270-000", extra: true } });
    expect(Object.keys(update)).toEqual(["nome", "unidade_id", "custom_data"]);
    expect({ ...original, ...update }).toMatchObject({ nome: "ATUALIZADO", cid: "CID NOVO", especialidade_destino: "FONOAUDIOLOGIA" });
  });
  it("define o mais recente pela criação, sem promover edição de encaminhamento antigo", () => {
    const old = { id: "a", created_at: "2026-10-01", updated_at: "2026-10-22" } as PatientReferral;
    const recent = { id: "b", created_at: "2026-10-21", updated_at: "2026-10-21" } as PatientReferral;
    expect(latestReferral([old, recent])).toBe(recent);
    expect(latestReferral([])).toBeUndefined();
  });
});
