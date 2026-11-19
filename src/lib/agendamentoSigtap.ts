export interface ExameAgendado { codigo: string; nome: string }

export function examesAgendados(metadata: unknown, codigo?: string, nome?: string): ExameAgendado[] {
  const lista = (metadata as { procedimentos_agendados?: unknown } | null)?.procedimentos_agendados;
  const validos = Array.isArray(lista) ? lista.filter((p): p is ExameAgendado =>
    p && typeof p.codigo === 'string' && /^\d{10}$/.test(p.codigo) && typeof p.nome === 'string') : [];
  if (validos.length) return [...new Map(validos.map(p => [p.codigo, p])).values()];
  return codigo && /^\d{10}$/.test(codigo) ? [{ codigo, nome: nome || codigo }] : [];
}

export function termoSigtap(termo: string) {
  return termo.trim().replace(/^(raio[ -]?x|rx)\b/i,'radiografia').replace(/^ecocardiograma/i,'ecocardiografia')
    .replace(/^ultrassom/i,'ultrassonografia').replace(/^([\d. -]+)$/, s=>s.replace(/\D/g,''));
}

export function usarProcedimentoLegado(metadata: unknown): boolean {
  return !(metadata && typeof metadata === 'object' && 'procedimentos_agendados' in metadata);
}
