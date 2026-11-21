import { formatSigtapCode, requiresCidForCompetence, type SigtapConsultationCatalog, type SigtapConsultationRow } from './sigtapConsultation';
import { instrumentoRotulo } from './sigtapInstruments';

const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeSigtapPrintText = (value: string) => value.replace(/[&<>"']/g, character => entities[character]);

export const sigtapRuleStatus = (value: boolean | null) => value === null ? 'Não confirmado' : value ? 'Sim' : 'Não';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatSigtapValue = (value: number | null) => value === null ? 'Não informado' : currency.format(value);

export function buildSigtapConsultationPrint(
  rows: readonly SigtapConsultationRow[],
  catalog: SigtapConsultationCatalog | null,
  reference: string,
  competence: string,
) {
  const cells = rows.map(row => {
    const rule = catalog?.get(row.codigo);
    return '<tr>' + [
      formatSigtapCode(row.codigo),
      row.nome,
      rule ? instrumentoRotulo([...rule.instrumentos]) : 'Não confirmado',
      sigtapRuleStatus(requiresCidForCompetence(rule, reference, competence)),
      formatSigtapValue(row.valor),
    ].map(value => '<td>' + escapeSigtapPrintText(value) + '</td>').join('') + '</tr>';
  }).join('');

  return `<style>
    .sigtap-print { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 9pt; line-height: 1.3; }
    .sigtap-print thead { display: table-header-group; }
    .sigtap-print tr { break-inside: avoid; page-break-inside: avoid; }
    .sigtap-print th, .sigtap-print td { padding: 2mm 1.4mm; border: 1px solid #cad7df; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    .sigtap-print th { background: #e6eff4; color: #163e55; }
    .sigtap-print-note { margin-top: 3mm; font-size: 8.5pt; }
  </style>
  <table class="sigtap-print">
    <colgroup><col style="width:16%"><col style="width:36%"><col style="width:25%"><col style="width:12%"><col style="width:11%"></colgroup>
    <thead><tr><th scope="col">Código SIGTAP</th><th scope="col">Nome do procedimento</th><th scope="col">Instrumentos de registro</th><th scope="col">Exige CID</th><th scope="col">Valor SUS</th></tr></thead>
    <tbody>${cells}</tbody>
  </table>
  <p class="sigtap-print-note">A coluna Exige CID se refere ao atributo complementar 048 na competência indicada. Confira também as regras do instrumento de registro.</p>`;
}
