/**
 * Logo específica por unidade (custom_data.logo_url da tabela unidades).
 * Ocupa o lugar da logo da direita nos cabeçalhos impressos; sem logo própria,
 * o documento mantém a logo institucional configurada.
 */
let activeUnitLogo = '';

export function isValidLogoUrl(url: unknown): url is string {
  return typeof url === 'string' && /^(https?:\/\/|\/)/.test(url.trim());
}

export function setActiveUnitLogo(url: unknown): void {
  activeUnitLogo = isValidLogoUrl(url) ? url.trim() : '';
}

export function getActiveUnitLogo(): string {
  return activeUnitLogo;
}

/** Logo da unidade tem prioridade; senão a institucional; senão o padrão. */
export function resolveUnitLogo(unitLogo: unknown, institutional: string, fallback: string): string {
  if (isValidLogoUrl(unitLogo)) return unitLogo.trim();
  if (isValidLogoUrl(institutional)) return institutional;
  return fallback;
}
