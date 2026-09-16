const digits = (value: unknown): string => String(value ?? "").replace(/\D/g, "");

/** Normaliza telefone somente para o campo nacional de 11 posições do BPA-I. */
export function normalizeBpaPhone(value: unknown): string {
  let phone = digits(value);
  if (!phone) return "";

  // Cadastro canônico/entrada internacional: remove somente o DDI brasileiro.
  if ((phone.length === 12 || phone.length === 13) && phone.startsWith("55")) {
    phone = phone.slice(2);
  }

  // DDD 55 é válido em um número nacional de 10/11 dígitos e não é DDI.
  return phone.length === 10 || phone.length === 11 ? phone : "";
}