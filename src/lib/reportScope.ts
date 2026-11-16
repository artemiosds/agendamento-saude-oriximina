export interface ReportScope {
  unit: string;
  professional: string;
  status: string;
  type: string;
  sector: string;
  dateFrom: string;
  dateTo: string;
}

export const reportScopesEqual = (left: ReportScope, right: ReportScope) =>
  left.unit === right.unit
  && left.professional === right.professional
  && left.status === right.status
  && left.type === right.type
  && left.sector === right.sector
  && left.dateFrom === right.dateFrom
  && left.dateTo === right.dateTo;

export const validateReportScope = (scope: ReportScope): string | null => {
  if (scope.dateFrom && scope.dateTo && scope.dateFrom > scope.dateTo) {
    return 'A data inicial não pode ser posterior à data final.';
  }
  return null;
};
