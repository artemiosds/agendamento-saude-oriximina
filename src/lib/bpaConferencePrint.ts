/** Presentation only: never resolves diagnoses or changes production quantities. */
export interface BpaConferenceRow {
  paciente_nome?: string; paciente_cns?: string; paciente_cpf?: string;
  data_nascimento?: string; sexo?: string; tipo_logradouro?: string;
  logradouro?: string; numero?: string; bairro?: string;
  data_atendimento?: string; codigo_sigtap?: string; cid_usado?: string;
  cids_adicionais?: string[]; _ctx?: { paciente_id?: string; pront_id?: string; [key: string]: unknown };
}
const escape = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]!);

export function buildBpaConferenceGroups(rows: readonly BpaConferenceRow[]): string {
  const groups = new Map<string, { row: BpaConferenceRow; entries: { row: BpaConferenceRow; index: number }[] }>();
  rows.forEach((row, index) => {
    const identity = row._ctx?.paciente_id || row.paciente_cpf || row.paciente_cns || `registro:${index}`;
    // Never hide changes in registration/address between records.
    const key = JSON.stringify([identity, row.paciente_nome, row.paciente_cns, row.paciente_cpf, row.data_nascimento,
      row.sexo, row.tipo_logradouro, row.logradouro, row.numero, row.bairro]);
    if (!groups.has(key)) groups.set(key, { row, entries: [] });
    groups.get(key)!.entries.push({ row, index });
  });
  return [...groups.values()].map(({ row, entries }) => `<table class="bpa-group-table">
    <colgroup><col style="width:5%"><col style="width:12%"><col style="width:17%"><col style="width:13%"><col style="width:43%"><col style="width:10%"></colgroup>
    <thead><tr><th colspan="6" class="bpa-patient">
      <div><strong>${escape(row.paciente_nome)}</strong> · Nasc.: <span class="bpa-nowrap">${escape(row.data_nascimento)}</span> · Sexo: ${escape(row.sexo)}</div>
      <div>CNS: <span class="bpa-nowrap">${escape(row.paciente_cns)}</span> · CPF: <span class="bpa-nowrap">${escape(row.paciente_cpf)}</span></div>
      <div>Endereço: ${escape([row.tipo_logradouro, row.logradouro].filter(Boolean).join(' '))}, <span class="bpa-nowrap">${escape(row.numero || '—')}</span> · Bairro: ${escape(row.bairro)}</div>
    </th></tr><tr><th>Nº</th><th>Atendimento</th><th>SIGTAP</th><th>CID no TXT</th><th>Adicionais deste registro*</th><th>Conferido</th></tr></thead>
    <tbody>${entries.map(({ row: r, index }) => `<tr data-bpa-record="${index + 1}"><td class="bpa-nowrap">${index + 1}</td><td class="bpa-nowrap">${escape(r.data_atendimento)}</td><td class="bpa-nowrap bpa-code">${escape(r.codigo_sigtap || '—')}</td><td class="bpa-nowrap bpa-cid">${escape(r.cid_usado && r.cid_usado !== '—' ? r.cid_usado : 'Sem CID')}</td><td class="bpa-additional">${escape(r.cids_adicionais?.join(', ') || '—')}</td><td aria-label="Marcação de conferência"></td></tr>`).join('')}</tbody></table>`).join('');
}

export const BPA_CONFERENCE_CSS = `
  .bpa-group-table { width:100%; border-collapse:collapse; table-layout:fixed; margin:8px 0; font-family:Arial,sans-serif; }
  .bpa-group-table thead { display:table-header-group; }
  .bpa-group-table tr { break-inside:avoid; page-break-inside:avoid; }
  .bpa-group-table th, .bpa-group-table td { border:1px solid #bccbd5; padding:4px 5px; font-size:9.5pt; line-height:1.25; vertical-align:middle; text-align:center; color:#18394c; }
  .bpa-group-table thead th { background:#18394c; color:#fff; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
  .bpa-group-table .bpa-patient { background:#eaf0f4; color:#18394c; text-align:left; padding:6px 8px; font-size:9pt; }
  .bpa-group-table .bpa-patient div { line-height:1.3; }
  .bpa-group-table .bpa-patient strong { font-size:10pt; }
  .bpa-group-table .bpa-additional { text-align:left; overflow-wrap:break-word; }
  .bpa-group-table .bpa-cid, .bpa-group-table .bpa-code { font-weight:700; }
  .bpa-group-table .bpa-nowrap { white-space:nowrap; overflow-wrap:normal; word-break:normal; hyphens:none; }
  .bpa-group-table tbody tr:nth-child(even) { background:#f5f7f9; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
  .bpa-print-legend { font:8.5pt/1.3 Arial,sans-serif; color:#334155; margin:6px 0; }
`;
