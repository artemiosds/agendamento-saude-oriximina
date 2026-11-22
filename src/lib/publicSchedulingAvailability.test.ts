import { describe, expect, it } from "vitest";
import { buildPublicAvailability, type SchedulingWindow } from "../../supabase/functions/_shared/public-scheduling-availability";

const date = "2026-11-23";
const morning: SchedulingWindow = {
  profissional_id: "p1", unidade_id: "u1", data_inicio: "2026-11-01", data_fim: "2026-12-31",
  dias_semana: [1, 2], hora_inicio: "08:00", hora_fim: "09:00",
  vagas_por_hora: 2, vagas_por_dia: 8, duracao_consulta: 20,
};

describe("Horários ofertáveis para agendamento público", () => {
  it("publica só horários livres na janela, omitindo a grade e a capacidade internas", () => {
    const slots = buildPublicAvailability({
      from: date, to: date, onlineLimit: 5, windows: [morning],
      blocks: [{ unidade_id: "u1", profissional_id: null, data_inicio: date, data_fim: date, dia_inteiro: false, hora_inicio: "08:40", hora_fim: "09:00" }],
      appointments: [{ profissional_id: "p1", unidade_id: "u1", data: date, hora: "08:00:00", origem: "online" }],
    });
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ data_inicio: date, data_fim: date, hora_inicio: "08:20", hora_fim: "08:21", vagas_por_dia: 1, vagas_por_hora: 0 });
  });

  it("preserva a regra de turno e a independência da cota externa", () => {
    const input = { from: date, to: date, onlineLimit: 5, blocks: [], windows: [{ ...morning, vagas_por_hora: 0, vagas_por_dia: 1 }] };
    const appointment = { profissional_id: "p1", unidade_id: "u1", data: date, hora: "08:00" };
    expect(buildPublicAvailability({ ...input, appointments: [{ ...appointment, origem: "externo" }] }).map(x => x.hora_inicio)).toEqual(["08:00"]);
    expect(buildPublicAvailability({ ...input, appointments: [{ ...appointment, origem: "recepcao" }] })).toEqual([]);
  });

  it("aplica o limite diário online por profissional mesmo entre unidades", () => {
    const slots = buildPublicAvailability({
      from: date, to: date, onlineLimit: 1, windows: [morning], blocks: [],
      appointments: [{ profissional_id: "p1", unidade_id: "u2", data: date, hora: "08:00", origem: "online" }],
    });
    expect(slots).toEqual([]);
  });
});
