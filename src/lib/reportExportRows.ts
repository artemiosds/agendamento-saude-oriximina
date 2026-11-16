export interface ReportExportMatrix {
  headers: string[];
  rows: string[][];
}

export interface AppointmentExportRecord {
  data?: string | null;
  hora?: string | null;
  pacienteNome?: string | null;
  profissionalNome?: string | null;
  unidadeId?: string | null;
  tipo?: string | null;
  status?: string | null;
  origem?: string | null;
}

export interface AttendanceMapExportRecord {
  num: number;
  paciente_nome?: string | null;
  data_atendimento?: string | null;
  data_nascimento?: string | null;
  cpf?: string | null;
  cns?: string | null;
  telefone?: string | null;
  tipo_logradouro?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  profissional_nome?: string | null;
  especialidade?: string | null;
  procedimentos_realizados?: string | null;
  procedimento_sigtap?: string | null;
  cid?: string | null;
  observacoes?: string | null;
}

export const APPOINTMENT_EXPORT_HEADERS = [
  'Data', 'Hora', 'Paciente', 'Profissional', 'Unidade', 'Tipo', 'Status', 'Origem',
  'Hora Início', 'Hora Fim', 'Duração (min)',
];

export const ATTENDANCE_MAP_EXPORT_HEADERS = [
  'Nº', 'Nome do Paciente', 'Data Atendimento', 'Data Nascimento', 'CPF', 'CNS', 'Telefone',
  'Tipo de Logradouro', 'Logradouro', 'Número', 'Complemento', 'Bairro', 'Município',
  'Profissional', 'Especialidade', 'Procedimentos Realizados', 'Proc. SIGTAP', 'CID', 'Observações',
];

const displayValue = (value: string | null | undefined): string => value?.trim() || '-';

export const buildAppointmentExportMatrix = (
  appointments: readonly AppointmentExportRecord[],
  resolveUnitName: (unitId: string) => string | undefined,
  statusLabels: Readonly<Record<string, string>>,
): ReportExportMatrix => ({
  headers: [...APPOINTMENT_EXPORT_HEADERS],
  rows: appointments.map(appointment => [
    displayValue(appointment.data),
    displayValue(appointment.hora),
    displayValue(appointment.pacienteNome),
    displayValue(appointment.profissionalNome),
    displayValue(appointment.unidadeId ? resolveUnitName(appointment.unidadeId) : undefined),
    displayValue(appointment.tipo),
    displayValue(appointment.status ? statusLabels[appointment.status] || appointment.status : undefined),
    displayValue(appointment.origem),
    '-',
    '-',
    '-',
  ]),
});

const formatCpf = (value: string | null | undefined): string => {
  const digits = (value || '').replace(/\D/g, '');
  return digits.length === 11
    ? digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    : displayValue(value);
};

const formatCns = (value: string | null | undefined): string => {
  const digits = (value || '').replace(/\D/g, '');
  return digits.length === 15
    ? `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7, 11)} ${digits.slice(11)}`
    : displayValue(value);
};

export const buildAttendanceMapExportMatrix = (
  records: readonly AttendanceMapExportRecord[],
  formatDate: (value: string | null | undefined) => string,
): ReportExportMatrix => ({
  headers: [...ATTENDANCE_MAP_EXPORT_HEADERS],
  rows: records.map(record => [
    String(record.num).padStart(2, '0'),
    displayValue(record.paciente_nome),
    formatDate(record.data_atendimento),
    formatDate(record.data_nascimento),
    formatCpf(record.cpf),
    formatCns(record.cns),
    displayValue(record.telefone),
    displayValue(record.tipo_logradouro),
    displayValue(record.logradouro),
    displayValue(record.numero),
    displayValue(record.complemento),
    displayValue(record.bairro),
    displayValue(record.municipio),
    displayValue(record.profissional_nome),
    displayValue(record.especialidade),
    displayValue(record.procedimentos_realizados),
    displayValue(record.procedimento_sigtap),
    displayValue(record.cid),
    displayValue(record.observacoes),
  ]),
});

export const serializeReportCsv = (
  metadataRows: string[][],
  matrix: ReportExportMatrix,
): string => {
  const escapeCell = (value: string) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return '\uFEFF' + [...metadataRows, matrix.headers, ...matrix.rows]
    .map(row => row.map(escapeCell).join(';'))
    .join('\n');
};

export const serializeSpreadsheetRowsXml = (
  metadataRows: string[][],
  matrix: ReportExportMatrix,
): { metadataRowsXml: string; headerRowXml: string; dataRowsXml: string } => {
  const escapeXml = (value: string) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const rowToXml = (row: string[]) => `<Row>${row.map(value => `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`).join('')}</Row>`;

  return {
    metadataRowsXml: [...metadataRows].map(rowToXml).join('\n'),
    headerRowXml: `<Row>${matrix.headers.map(header => `<Cell ss:StyleID="header"><Data ss:Type="String">${escapeXml(header)}</Data></Cell>`).join('')}</Row>`,
    dataRowsXml: matrix.rows.map(rowToXml).join('\n'),
  };
};
