import type { WeeklySafeOfferRow } from "@/lib/treatmentCapacityPlanning";

const escapeHtml = (value: string) => String(value).replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
export const shortDate = (date: string) => new Date(date + "T12:00:00").toLocaleDateString("pt-BR");
const longDate = (date: string) => new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

export function renderWeeklyOfferMap(rows: WeeklySafeOfferRow[], startDate: string, endDate: string, unitNames: Map<string, string>) {
  const groups = new Map<string, WeeklySafeOfferRow[]>();
  for (const row of rows) groups.set(row.unitId, [...(groups.get(row.unitId) || []), row]);
  const sections = [...groups].map(([unitId, offers]) => `
    <section style="break-inside:avoid-page;margin:12px 0 20px">
      <h2 style="font-size:14px;margin:8px 0">Unidade: ${escapeHtml(unitNames.get(unitId) || unitId)}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:10px;table-layout:fixed">
        <thead><tr><th>Profissional</th><th>Especialidade</th><th>Dia</th><th>Turno</th><th>Horários livres seguros</th><th>Vagas</th></tr></thead>
        <tbody>${offers.map(row => `<tr>
          <td>${escapeHtml(row.professionalName)}</td><td>${escapeHtml(row.specialty)}</td>
          <td>${escapeHtml(longDate(row.date))}</td><td>${escapeHtml(row.shift)}</td>
          <td>${row.times.map(slot => `${escapeHtml(slot.time)}${slot.count > 1 ? ` (${slot.count})` : ""}`).join(", ")}</td>
          <td style="text-align:center">${row.vacancies}</td>
        </tr>`).join("")}</tbody>
      </table>
    </section>`).join("");
  return `<p style="font-size:11px">Período: ${escapeHtml(shortDate(startDate))} a ${escapeHtml(shortDate(endDate))}</p>
    ${sections || '<p>Nenhuma vaga segura confirmável para novos pacientes nesta semana e nos filtros selecionados.</p>'}
    <p style="font-size:10px;margin-top:18px">Horários calculados com proteção dos ciclos contínuos em andamento. Vagas sujeitas a preenchimento pela regulação oficial. Este mapa não reserva horários; confirme a disponibilidade na Agenda antes de agendar.</p>`;
}
