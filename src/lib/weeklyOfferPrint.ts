import type { WeeklySafeOfferRow } from "@/lib/treatmentCapacityPlanning";

const escapeHtml = (value: string) => String(value).replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
export const shortDate = (date: string) => new Date(date + "T12:00:00").toLocaleDateString("pt-BR");
const longDate = (date: string) => new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

export function renderWeeklyOfferMap(rows: WeeklySafeOfferRow[], startDate: string, endDate: string, unitNames: Map<string, string>, periodDays = 7) {
  const groups = new Map<string, WeeklySafeOfferRow[]>();
  for (const row of rows) groups.set(row.unitId, [...(groups.get(row.unitId) || []), row]);
  const sections = [...groups].map(([unitId, offers]) => {
    const byProfessional = new Map<string, WeeklySafeOfferRow[]>();
    for (const row of offers) {
      const professionalRows = byProfessional.get(row.professionalId) || [];
      professionalRows.push(row);
      byProfessional.set(row.professionalId, professionalRows);
    }
    return `
    <section style="margin:12px 0 20px;break-inside:auto">
      <h2 style="font-size:14px;margin:8px 0;break-after:avoid-page">Unidade: ${escapeHtml(unitNames.get(unitId) || unitId)}</h2>
      ${[...byProfessional]
        .map(([, professionalRows]) => `<div style="margin:10px 0;break-inside:auto">
          <h3 style="font-size:11px;margin:4px 0;break-after:avoid-page">${escapeHtml(professionalRows[0].professionalName)} · ${escapeHtml(professionalRows[0].specialty)}</h3>
          <table style="width:100%;border-collapse:collapse;font-size:10px;table-layout:fixed;break-inside:auto">
            <thead style="display:table-header-group"><tr><th>Dia</th><th>Turno</th><th>Horários livres seguros</th><th>Vagas</th></tr></thead>
            <tbody>${professionalRows.map(row => `<tr style="break-inside:avoid-page;page-break-inside:avoid">
              <td>${escapeHtml(longDate(row.date))}</td><td>${escapeHtml(row.shift)}</td>
              <td>${row.times.map(slot => `${escapeHtml(slot.time)}${slot.count > 1 ? ` (${slot.count})` : ""}`).join(", ")}</td>
              <td style="text-align:center">${row.vacancies}</td>
            </tr>`).join("")}</tbody>
          </table>
        </div>`).join("")}
    </section>`;
  }).join("");
  return `<p style="font-size:11px">Período: ${escapeHtml(shortDate(startDate))} a ${escapeHtml(shortDate(endDate))}${periodDays === 7 ? " (semana)" : ` (${periodDays} dias)`}</p>
    ${sections || '<p>Nenhuma vaga segura confirmável para novos pacientes no período e nos filtros selecionados.</p>'}
    <p style="font-size:10px;margin-top:18px">Horários calculados com proteção dos ciclos contínuos em andamento. Vagas sujeitas a preenchimento pela regulação oficial. Este mapa não reserva horários; confirme a disponibilidade na Agenda antes de agendar.</p>`;
}
