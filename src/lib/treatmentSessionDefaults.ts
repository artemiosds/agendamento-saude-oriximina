/** Sugestão visual de plano; não substitui a decisão clínica do profissional. */
export function getDefaultSessionsByProfession(professionOrSpecialty: string): number {
  const profession = String(professionOrSpecialty || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (profession.includes("fisio") || profession.includes("fono") || profession.includes("terapia ocupacional") || profession.includes("terapeuta ocupacional")) return 12;
  if (profession.includes("psico")) return 6;
  if (profession.includes("nutri")) return 5;
  return 10;
}

export function suggestSessionsForProfessional(current: number | "", customized: boolean, profession: string): number | "" {
  return customized ? current : getDefaultSessionsByProfession(profession);
}
