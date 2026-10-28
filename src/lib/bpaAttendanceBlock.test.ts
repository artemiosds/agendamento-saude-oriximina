import { describe, expect, it } from "vitest";
import { UNKNOWN_BPA_BLOCK, describeBpaBlock, resolveBpaAppointmentBlock, createBpaAttendanceBlockResolver, type BpaAvailability } from "./bpaAttendanceBlock";
const names = new Map([["eco", "ECOCARDIOGRAMA"]]);
const base: BpaAvailability = { id: "1", profissional_id: "p", unidade_id: "u", sala_id: "eco", data_inicio: "2026-10-01", data_fim: "2026-10-31", dias_semana: [3], hora_inicio: "13:30:00", hora_fim: "14:00:00", vagas_por_hora: 0 };
const risk = { ...base, id: "2", sala_id: "RISCO CIRURGICO", hora_inicio: "14:30:00", hora_fim: "15:00:00" };
const availability = [base, risk];
const appointment = { id: "a", paciente_id: "x", profissional_id: "p", unidade_id: "u", data: "2026-10-28", hora: "13:30" };
const record = { agendamento_id: "a", paciente_id: "x", profissional_id: "p", unidade_id: "u", data_atendimento: "2026-10-28" };
const ecoKey = describeBpaBlock(base, names).key, riskKey = describeBpaBlock(risk, names).key;
describe("seleção BPA por bloco da Agenda", () => {
  it("separa Eco e Risco do mesmo profissional na mesma tarde", () => {
    expect(resolveBpaAppointmentBlock(appointment, availability, names)).toBe(ecoKey);
    expect(resolveBpaAppointmentBlock({ ...appointment, hora: "14:30" }, availability, names)).toBe(riskKey);
    expect(describeBpaBlock(base, names).label).toBe("Tarde — ECOCARDIOGRAMA · 13:30 às 14:00");
  });
  it("normaliza o período já presente no nome sem duplicá-lo ou criar opções por caixa", () => {
    const named = { ...risk, sala_id: "TARDE - RISCO CIRURGICO" };
    expect(describeBpaBlock(named, names).label).toBe("Tarde — RISCO CIRURGICO · 14:30 às 15:00");
    expect(describeBpaBlock(named, names).key).toBe(describeBpaBlock({ ...risk, sala_id: "Tarde - Risco Cirurgico" }, names).key);
  });
  it("preserva os limites usados pela Agenda, inclusive horário de transição", () => {
    expect(resolveBpaAppointmentBlock({ ...appointment, hora: "14:29" }, availability, names)).toBe(ecoKey);
    expect(resolveBpaAppointmentBlock({ ...appointment, hora: "15:15" }, availability, names)).toBe(riskKey);
  });
  it("não mistura unidade, profissional, vigência ou dia da semana", () => {
    for (const patch of [{ unidade_id: "outra" }, { profissional_id: "outro" }, { data: "2026-10-27" }, { data: "2026-11-04" }, { hora: "" }]) {
      expect(resolveBpaAppointmentBlock({ ...appointment, ...patch }, availability, names)).toBe(UNKNOWN_BPA_BLOCK);
    }
  });
  it("não transforma disponibilidade por hora em bloco por turno", () => {
    expect(resolveBpaAppointmentBlock(appointment, [{ ...base, vagas_por_hora: 2 }], names)).toBe(UNKNOWN_BPA_BLOCK);
  });
  it("classifica como não identificado configurações conflitantes no mesmo início", () => {
    expect(resolveBpaAppointmentBlock(appointment, [base, { ...risk, hora_inicio: base.hora_inicio }], names)).toBe(UNKNOWN_BPA_BLOCK);
  });
  it("usa o agendamento vinculado, independentemente do horário da digitação", () => {
    const resolve = createBpaAttendanceBlockResolver([appointment], availability, names);
    expect(resolve({ ...record, hora_atendimento: "18:30" })).toBe(ecoKey);
  });
  it("recupera vínculo legado somente quando o encontro é único", () => {
    const legacy = { ...record, agendamento_id: undefined };
    expect(createBpaAttendanceBlockResolver([appointment], availability, names)(legacy)).toBe(ecoKey);
    expect(createBpaAttendanceBlockResolver([appointment, { ...appointment, id: "b", hora: "14:30" }], availability, names)(legacy)).toBe(UNKNOWN_BPA_BLOCK);
  });
  it("não contorna vínculo explícito inválido por um encontro parecido", () => {
    const resolve = createBpaAttendanceBlockResolver([appointment], availability, names);
    expect(resolve({ ...record, agendamento_id: "inexistente" })).toBe(UNKNOWN_BPA_BLOCK);
    expect(resolve({ ...record, unidade_id: "outra" })).toBe(UNKNOWN_BPA_BLOCK);
    expect(resolve({ ...record, profissional_id: "outro" })).toBe(UNKNOWN_BPA_BLOCK);
  });
  it("mantém procedimentos, CID e registros de entrada intactos ao filtrar", () => {
    const rows = [{ ...record, cid: "I10", procedimentos: ["0301010072"] }, { ...record, agendamento_id: "b", cid: "Z01" }];
    const before = JSON.stringify(rows);
    const resolve = createBpaAttendanceBlockResolver([appointment, { ...appointment, id: "b", hora: "14:30" }], availability, names);
    const selected = rows.filter(p => resolve(p) === ecoKey);
    expect(selected).toEqual([rows[0]]);
    expect(JSON.stringify(rows)).toBe(before);
    expect(rows.filter(p => resolve(p) === riskKey)).toEqual([rows[1]]);
  });
});
