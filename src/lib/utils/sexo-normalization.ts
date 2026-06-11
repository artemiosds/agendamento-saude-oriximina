/**
 * Normalizes the gender (sexo) value to the standard "masculino" or "feminino".
 * Handles various common database variations.
 */
export function normalizeSexo(value: any): "masculino" | "feminino" | "" {
  if (!value) return "";
  
  const normalized = String(value).trim().toLowerCase();
  
  if (normalized === "masculino" || normalized === "m" || normalized === "male") {
    return "masculino";
  }
  
  if (normalized === "feminino" || normalized === "f" || normalized === "female") {
    return "feminino";
  }
  
  return "";
}
