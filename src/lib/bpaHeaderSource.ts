const digits = (value: unknown): string => String(value ?? "").replace(/\D/g, "");

export interface BpaHeaderDocumentSource {
  unidadeCustomData?: Record<string, unknown> | null;
  unidade?: Record<string, unknown> | null;
  bpaConfig?: Record<string, unknown> | null;
  systemConfig?: Record<string, unknown> | null;
}

/**
 * Resolve o documento de origem sem inventar CNPJ. O valor zerado preserva o
 * comportamento aceito pelo importador quando não existe documento cadastrado.
 */
export function resolveBpaHeaderDocument(source: BpaHeaderDocumentSource): string {
  const unidadeCd = source.unidadeCustomData || {};
  const unidade = source.unidade || {};
  const bpa = source.bpaConfig || {};
  const sistema = source.systemConfig || {};
  const instituicao = (sistema.config_sistema as Record<string, unknown> | undefined)?.instituicao as
    | Record<string, unknown>
    | undefined;

  const candidates = [
    unidadeCd.cnpj,
    unidade.cnpj,
    unidadeCd.cpf,
    bpa.documento_origem_bpa,
    bpa.documento_origem,
    bpa.cnpj,
    instituicao?.cnpj,
  ];

  for (const candidate of candidates) {
    const value = digits(candidate);
    if (value) return value.slice(-14).padStart(14, "0");
  }

  return "00000000000000";
}