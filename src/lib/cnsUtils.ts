/**
 * Cartão Nacional de Saúde (CNS) — utilitários únicos para todo o sistema.
 *
 * Formato oficial: 15 dígitos exibidos como "000 0000 0000 0000".
 * Exemplo: 700 9674 9916 0003
 *
 * Salvar SEMPRE limpo (apenas dígitos) no banco.
 * Exibir/digitar SEMPRE com a máscara 3-4-4-4.
 */

/** Remove tudo que não for dígito e limita a 15 caracteres. */
export function normalizeCNS(value?: string | null): string {
  if (!value) return "";
  return String(value).replace(/\D/g, "").slice(0, 15);
}

/** Aplica a máscara oficial 000 0000 0000 0000 (3-4-4-4). */
export function formatCNS(value?: string | null): string {
  const d = normalizeCNS(value);
  if (!d) return "";
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)} ${d.slice(3)}`;
  if (d.length <= 11) return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7, 11)} ${d.slice(11, 15)}`;
}

/** Alias para clareza em handlers de input (onChange). */
export const maskCNS = formatCNS;

/** Remove a máscara — devolve apenas os dígitos. */
export function unmaskCNS(value?: string | null): string {
  return normalizeCNS(value);
}

/**
 * Valida CNS.
 * - Vazio é válido (CNS não é obrigatório por padrão).
 * - Quando preenchido, deve ter exatamente 15 dígitos.
 */
export function validateCNS(value?: string | null): { valid: boolean; message?: string } {
  const d = normalizeCNS(value);
  if (d.length === 0) return { valid: true };
  if (d.length !== 15) return { valid: false, message: "CNS deve conter 15 dígitos." };
  return { valid: true };
}

/** Comparação segura entre dois CNS (ignora máscara). */
export function cnsEquals(a?: string | null, b?: string | null): boolean {
  const da = normalizeCNS(a);
  const db = normalizeCNS(b);
  return !!da && da === db;
}
