const PORTAL_QR_STORAGE_KEY = "portal_qr_cartaz_v1";
const PUBLISHED_ORIGIN = "https://agendamento-saude-sms-oriximina.site";
const LEGACY_LOVABLE_LINK = "https://agendamento-saude-oriximina.lovable.app/portal";
export { PORTAL_QR_STORAGE_KEY };
export function getDefaultPatientPortalLink(): string {
  const origin = typeof window !== "undefined" && !window.location.hostname.includes("id-preview")
    && !window.location.hostname.includes("localhost") ? window.location.origin : PUBLISHED_ORIGIN;
  return `${origin}/portal`;
}
export function getPatientPortalLink(): string {
  const fallback = getDefaultPatientPortalLink();
  try {
    if (typeof window === "undefined") return fallback;
    const saved = JSON.parse(window.localStorage.getItem(PORTAL_QR_STORAGE_KEY) || "null");
    const savedLink = typeof saved?.link === "string" ? saved.link.trim() : "";
    if (savedLink && savedLink !== LEGACY_LOVABLE_LINK) return savedLink;
  } catch { /* Usa o endereço padrão publicado se o armazenamento estiver indisponível. */ }
  return fallback;
}
