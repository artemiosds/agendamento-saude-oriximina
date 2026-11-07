/**
 * Licenciamento por módulos (SaaS). Guardado em system_config id='licenca'.
 * Padrão = tudo ligado (Oriximiná nunca perde funcionalidade).
 */
export type LicenseModule = 'faturamento_sus' | 'reabilitacao' | 'triagem' | 'regulacao';

export const LICENSE_MODULES: { id: LicenseModule; label: string; descricao: string }[] = [
  { id: 'faturamento_sus', label: 'Faturamento SUS & BPA', descricao: 'BPA-I, SIGTAP, CNS/CBO.' },
  { id: 'reabilitacao', label: 'Reabilitação (CER II & PTS)', descricao: 'Gestão de Tratamentos, PTS, Avaliação Multi e Relatório de Alta.' },
  { id: 'triagem', label: 'Triagem & Acolhimento', descricao: 'Triagem, histórico de triagem e Avaliação de Enfermagem.' },
  { id: 'regulacao', label: 'Regulação & Fila Especializada', descricao: 'Fila de Espera.' },
];

export type LicenseState = Record<LicenseModule, boolean>;

export const DEFAULT_LICENSE: LicenseState = {
  faturamento_sus: true, reabilitacao: true, triagem: true, regulacao: true,
};

const PATH_MODULE: Record<string, LicenseModule> = {
  '/painel/bpa-exportar': 'faturamento_sus',
  '/painel/bpa-producao': 'faturamento_sus',
  '/painel/tratamentos': 'reabilitacao',
  '/painel/pts': 'reabilitacao',
  '/painel/multiprofissional': 'reabilitacao',
  '/painel/alta': 'reabilitacao',
  '/painel/triagem': 'triagem',
  '/painel/historico-triagem': 'triagem',
  '/painel/enfermagem': 'triagem',
  '/painel/fila': 'regulacao',
};

export function normalizeLicense(raw: any): LicenseState {
  const out = { ...DEFAULT_LICENSE };
  if (raw && typeof raw === 'object') {
    for (const m of LICENSE_MODULES) if (raw[m.id] === false) out[m.id] = false;
  }
  return out;
}

export function moduleForPath(path: string): LicenseModule | null {
  const clean = path.replace(/\/+$/, '');
  return PATH_MODULE[clean] ?? null;
}

export function isPathLicensed(path: string, lic: LicenseState): boolean {
  const m = moduleForPath(path);
  return m ? lic[m] !== false : true;
}
