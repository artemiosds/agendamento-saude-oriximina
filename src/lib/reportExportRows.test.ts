import { describe, expect, it } from 'vitest';
import {
  APPOINTMENT_EXPORT_HEADERS,
  ATTENDANCE_MAP_EXPORT_HEADERS,
  buildAppointmentExportMatrix,
  buildAttendanceMapExportMatrix,
  serializeReportCsv,
  serializeSpreadsheetRowsXml,
} from './reportExportRows';

describe('matrizes compartilhadas das exportações de relatórios', () => {
  it('mantém os agendamentos exportados na mesma quantidade e ordem do snapshot exibido', () => {
    const visibleSnapshot = [
      { data: '16/11/2026', hora: '08:00', pacienteNome: 'Paciente Sintético A', profissionalNome: 'Profissional Teste', unidadeId: 'unit-1', tipo: 'Consulta', status: 'concluido', origem: 'recepcao' },
      { data: '16/11/2026', pacienteNome: 'Paciente Sintético B', unidadeId: 'unit-1', tipo: 'Atendimento (S/ Agend.)', status: 'concluido', origem: 'prontuario' },
    ];
    const matrix = buildAppointmentExportMatrix(visibleSnapshot, id => id === 'unit-1' ? 'Unidade Teste' : undefined, { concluido: 'Concluído' });

    expect(matrix.headers).toEqual(APPOINTMENT_EXPORT_HEADERS);
    expect(matrix.rows).toHaveLength(visibleSnapshot.length);
    expect(matrix.rows[0]).toEqual(['16/11/2026', '08:00', 'Paciente Sintético A', 'Profissional Teste', 'Unidade Teste', 'Consulta', 'Concluído', 'recepcao', '-', '-', '-']);
    expect(matrix.rows[1][2]).toBe('Paciente Sintético B');
    expect(matrix.rows[1][7]).toBe('prontuario');
  });

  it('usa a mesma matriz do mapa em todas as exportações e normaliza CPF, CNS e colunas', () => {
    const matrix = buildAttendanceMapExportMatrix([{
      num: 1,
      paciente_nome: 'Paciente Sintético',
      data_atendimento: '2026-11-16',
      data_nascimento: '2000-01-02',
      cpf: '00000000000',
      cns: '700000000000001',
      logradouro: 'Rua Teste',
      municipio: 'Oriximiná',
      profissional_nome: 'Profissional Teste',
      especialidade: 'Fisioterapia',
    }], value => value ? `BR:${value}` : 'Não informado');

    expect(matrix.headers).toEqual(ATTENDANCE_MAP_EXPORT_HEADERS);
    expect(matrix.rows[0]).toHaveLength(matrix.headers.length);
    expect(matrix.rows[0]).toContain('000.000.000-00');
    expect(matrix.rows[0]).toContain('700 0000 0000 0001');
    expect(matrix.rows[0][0]).toBe('01');
    expect(matrix.rows[0]).not.toContain('Não informado');
  });

  it('escapa aspas e caracteres XML sem alterar os dados do snapshot', () => {
    const matrix = buildAppointmentExportMatrix([
      { data: '16/11/2026', pacienteNome: 'Paciente "Teste" & Cia', status: 'pendente' },
    ], () => undefined, {});
    const metadata = [['Cobertura', 'PARCIAL — fonte: prontuários']];
    const csv = serializeReportCsv(metadata, matrix);
    const xml = serializeSpreadsheetRowsXml(metadata, matrix);

    expect(csv).toContain('"Paciente ""Teste"" & Cia"');
    expect(xml.metadataRowsXml).toContain('PARCIAL — fonte: prontuários');
    expect(xml.dataRowsXml).toContain('Paciente &quot;Teste&quot; &amp; Cia');
    expect(xml.headerRowXml).toContain('Origem');
  });
});
