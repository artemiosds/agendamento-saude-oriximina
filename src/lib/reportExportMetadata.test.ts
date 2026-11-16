import { describe, expect, it } from 'vitest';
import { buildReportExportMetadataRows } from './reportExportMetadata';

const scope = {
  period: '01/11/2026 a 30/11/2026',
  unit: 'CER II',
  professional: 'Todos',
  specialty: 'Todas',
  status: 'Todos',
  sector: 'Fisioterapia',
  type: 'Todos',
};

describe('metadados das exportações de relatórios', () => {
  it('identifica a cobertura parcial quando o filtro de setor não alcança todas as fontes', () => {
    const rows = buildReportExportMetadataRows({ scope, generatedAt: '16/11/2026 10:00', partialSources: [] });

    expect(rows.find(([label]) => label === 'Cobertura')?.[1]).toMatch(/^PARCIAL/);
    expect(rows.find(([label]) => label === 'Setor')?.[1]).toBe('Fisioterapia');
  });

  it('sinaliza fontes com carga incompleta', () => {
    const rows = buildReportExportMetadataRows({
      scope: { ...scope, sector: 'Todos' },
      generatedAt: '16/11/2026 10:00',
      partialSources: ['prontuarios', 'fila_espera'],
    });

    expect(rows.find(([label]) => label === 'Cobertura')?.[1]).toContain('prontuarios, fila_espera');
  });
});
