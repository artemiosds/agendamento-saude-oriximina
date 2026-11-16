export interface ExecutiveReportKpis {
  total: number;
  completed: number;
  attendanceRate: number;
  absences: number;
}

export interface ExecutiveReportMonthlyPoint {
  date: string;
  appointments: number;
  completed: number;
  absences: number;
}

export interface ExecutiveReportSpecialty {
  name: string;
  appointments: number;
  absences: number;
}

export interface ExecutiveReportVisualsInput {
  kpis: ExecutiveReportKpis;
  monthly: ExecutiveReportMonthlyPoint[];
  specialties: ExecutiveReportSpecialty[];
}

const COLORS = {
  navy: '#17365D',
  teal: '#168C87',
  orange: '#D97706',
  muted: '#64748B',
  grid: '#DCE4EC',
};

function escapeMarkup(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);
}

function safeNumber(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function formatNumber(value: number): string {
  return Math.round(safeNumber(value)).toLocaleString('pt-BR');
}

function monthlySeries(points: ExecutiveReportMonthlyPoint[]) {
  const grouped = new Map<string, { appointments: number; completed: number; absences: number }>();
  points.forEach(point => {
    const month = point.date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    const current = grouped.get(month) || { appointments: 0, completed: 0, absences: 0 };
    current.appointments += safeNumber(point.appointments);
    current.completed += safeNumber(point.completed);
    current.absences += safeNumber(point.absences);
    grouped.set(month, current);
  });
  return Array.from(grouped, ([month, values]) => ({ month, ...values }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function renderTrendChart(points: ExecutiveReportMonthlyPoint[]): string {
  const series = monthlySeries(points);
  if (series.length === 0) return '';

  const width = 720;
  const height = 250;
  const left = 48;
  const right = 18;
  const top = 22;
  const bottom = 46;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxValue = Math.max(1, ...series.flatMap(point => [point.appointments, point.completed, point.absences]));
  const x = (index: number) => left + (series.length === 1 ? plotWidth / 2 : (index / (series.length - 1)) * plotWidth);
  const y = (value: number) => top + plotHeight - (safeNumber(value) / maxValue) * plotHeight;
  const line = (key: 'appointments' | 'completed' | 'absences', color: string) => {
    const coords = series.map((point, index) => `${x(index)},${y(point[key])}`).join(' ');
    const dots = series.map((point, index) => `<circle cx="${x(index)}" cy="${y(point[key])}" r="4" fill="${color}" />`).join('');
    return `<polyline points="${coords}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />${dots}`;
  };
  const grid = [0, 0.5, 1].map(fraction => {
    const value = maxValue * fraction;
    const lineY = y(value);
    return `<line x1="${left}" y1="${lineY}" x2="${width - right}" y2="${lineY}" stroke="${COLORS.grid}" stroke-width="1" /><text x="${left - 8}" y="${lineY + 4}" text-anchor="end" font-size="11" fill="${COLORS.muted}">${formatNumber(value)}</text>`;
  }).join('');
  const labels = series.map((point, index) => {
    const [year, month] = point.month.split('-');
    return `<text x="${x(index)}" y="${height - 16}" text-anchor="middle" font-size="11" fill="${COLORS.muted}">${month}/${year.slice(2)}</text>`;
  }).join('');

  return `<div class="executive-chart-card"><h3>Evolução mensal</h3><p class="executive-chart-subtitle">Agendamentos, conclusões e faltas no período aplicado</p><svg class="executive-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico de evolução mensal de agendamentos, atendimentos concluídos e faltas"><title>Evolução mensal</title><desc>Série mensal agregada a partir dos registros do período selecionado.</desc>${grid}${line('appointments', COLORS.navy)}${line('completed', COLORS.teal)}${line('absences', COLORS.orange)}${labels}</svg><div class="executive-legend"><span><i style="background:${COLORS.navy}"></i>Agendamentos</span><span><i style="background:${COLORS.teal}"></i>Concluídos</span><span><i style="background:${COLORS.orange}"></i>Faltas</span></div></div>`;
}

function renderSpecialtyChart(items: ExecutiveReportSpecialty[]): string {
  const sorted = items
    .filter(item => safeNumber(item.appointments) > 0)
    .sort((a, b) => safeNumber(b.appointments) - safeNumber(a.appointments))
    .slice(0, 7);
  if (sorted.length === 0) return '';

  const width = 720;
  const rowHeight = 31;
  const height = 38 + sorted.length * rowHeight;
  const labelWidth = 220;
  const valueWidth = 48;
  const barWidth = width - labelWidth - valueWidth - 20;
  const maxValue = Math.max(1, ...sorted.map(item => safeNumber(item.appointments)));
  const rows = sorted.map((item, index) => {
    const y = 22 + index * rowHeight;
    const label = escapeMarkup(item.name.length > 34 ? `${item.name.slice(0, 31)}…` : item.name);
    const barLength = (safeNumber(item.appointments) / maxValue) * barWidth;
    const absenceLength = (safeNumber(item.absences) / maxValue) * barWidth;
    return `<text x="0" y="${y + 13}" font-size="11" fill="#334155">${label}</text><rect x="${labelWidth}" y="${y}" width="${barWidth}" height="15" rx="7" fill="#E8EEF4" /><rect x="${labelWidth}" y="${y}" width="${barLength}" height="15" rx="7" fill="${COLORS.navy}" /><rect x="${labelWidth}" y="${y + 18}" width="${barWidth}" height="7" rx="3.5" fill="#F1F5F9" /><rect x="${labelWidth}" y="${y + 18}" width="${absenceLength}" height="7" rx="3.5" fill="${COLORS.orange}" /><text x="${width - 4}" y="${y + 13}" text-anchor="end" font-size="11" font-weight="600" fill="#334155">${formatNumber(item.appointments)}</text>`;
  }).join('');

  return `<div class="executive-chart-card"><h3>Volume por especialidade</h3><p class="executive-chart-subtitle">Áreas com maior volume; faixa laranja indica faltas</p><svg class="executive-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico das sete especialidades com maior volume e indicação das faltas"><title>Volume por especialidade</title><desc>Comparação do volume total e das faltas nas especialidades mais movimentadas.</desc>${rows}</svg><div class="executive-legend"><span><i style="background:${COLORS.navy}"></i>Registros</span><span><i style="background:${COLORS.orange}"></i>Faltas</span></div></div>`;
}

export function buildExecutiveReportVisuals(input: ExecutiveReportVisualsInput): string {
  const { kpis } = input;
  const cards = [
    { label: 'Atendimentos no escopo', value: formatNumber(kpis.total), detail: 'registros no período', color: COLORS.navy },
    { label: 'Concluídos', value: formatNumber(kpis.completed), detail: 'atendimento realizado', color: COLORS.teal },
    { label: 'Comparecimento', value: `${Math.round(safeNumber(kpis.attendanceRate))}%`, detail: 'sobre a base efetiva', color: COLORS.teal },
    { label: 'Faltas', value: formatNumber(kpis.absences), detail: 'registros no período', color: COLORS.orange },
  ].map(card => `<div class="executive-kpi" style="border-top-color:${card.color}"><span>${card.label}</span><strong>${card.value}</strong><small>${card.detail}</small></div>`).join('');

  const charts = [renderTrendChart(input.monthly), renderSpecialtyChart(input.specialties)].filter(Boolean).join('');
  return `<style>
    .executive-summary-visuals{margin:18px 0 24px;font-family:Arial,sans-serif;color:#17324d;break-inside:avoid-page}
    .executive-summary-visuals h3{margin:0 0 4px;color:#17365d;font-size:12pt}
    .executive-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0 16px}
    .executive-kpi{border:1px solid #dbe4ec;border-top:4px solid;border-radius:8px;padding:10px 12px;min-height:72px;background:#f8fafc}
    .executive-kpi span,.executive-kpi small{display:block;color:#64748b;font-size:8pt}
    .executive-kpi strong{display:block;margin:5px 0 2px;font-size:19pt;line-height:1.1;color:#17365d}
    .executive-chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}
    .executive-chart-card{border:1px solid #dbe4ec;border-radius:8px;padding:12px;margin-top:10px;break-inside:avoid-page}
    .executive-chart-subtitle{margin:0 0 8px;color:#64748b;font-size:8pt}
    .executive-chart{display:block;width:100%;height:auto;overflow:visible}
    .executive-legend{display:flex;flex-wrap:wrap;gap:12px;margin-top:4px;color:#475569;font-size:8pt}
    .executive-legend span{display:inline-flex;align-items:center;gap:5px}
    .executive-legend i{width:9px;height:9px;border-radius:50%;display:inline-block}
    @media(max-width:700px){.executive-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.executive-chart-grid{grid-template-columns:1fr}}
    @media print{.executive-summary-visuals{break-inside:avoid-page}.executive-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}.executive-chart-grid{grid-template-columns:1fr 1fr}.executive-chart-card{break-inside:avoid-page}}
  </style><div class="executive-summary-visuals"><h3>Painel executivo do período</h3><div class="executive-kpis">${cards}</div><div class="executive-chart-grid">${charts}</div></div>`;
}
