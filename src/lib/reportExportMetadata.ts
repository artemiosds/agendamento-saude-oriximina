export interface ReportExportScopeMetadata {
  period: string;
  unit: string;
  professional: string;
  specialty: string;
  status: string;
  sector: string;
  type: string;
}

export interface ReportExportMetadata {
  scope: ReportExportScopeMetadata;
  generatedAt: string;
  partialSources: string[];
}

export const buildReportExportMetadataRows = ({
  scope,
  generatedAt,
  partialSources,
}: ReportExportMetadata): string[][] => {
  const hasSectorFilter = scope.sector !== 'Todos';
  const hasPartialSources = partialSources.length > 0;
  const coverage = hasPartialSources
    ? `INCOMPLETO — falha ao carregar: ${partialSources.join(', ')}`
    : hasSectorFilter
      ? 'PARCIAL — o filtro de setor alcança atendimentos e fila; outras fontes sem vínculo confiável não são filtradas por setor.'
      : 'Completo dentro das fontes e filtros aplicáveis a este relatório.';

  return [
    ['ESCOPO E CONFERÊNCIA'],
    ['Período', scope.period],
    ['Unidade', scope.unit],
    ['Profissional', scope.professional],
    ['Especialidade', scope.specialty],
    ['Status', scope.status],
    ['Setor', scope.sector],
    ['Tipo', scope.type],
    ['Cobertura', coverage],
    ['Fontes parciais', hasPartialSources ? partialSources.join(', ') : 'Nenhuma'],
    ['Emitido em', generatedAt],
    [''],
  ];
};
