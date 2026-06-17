/**
 * Laudo APAC — utilitário de PDF (ETAPA 1)
 *
 * Esta etapa apenas baixa o PDF oficial intacto, sem escrever dados.
 * A função de coleta de dados automáticos (buildSkeletonHTML e helpers
 * em ApacLaudoModal.tsx) permanece intacta para uso na ETAPA 2.
 */

const TEMPLATE_URL = "/templates/laudo-apac-oficial.pdf";

/**
 * Baixa o PDF oficial do Laudo APAC intacto (1 página, sem alterações).
 * Usado na ETAPA 1 para validar que o template está acessível.
 */
export async function baixarLaudoApacTemplate(filename = "laudo-apac.pdf"): Promise<void> {
  const res = await fetch(TEMPLATE_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Não foi possível carregar o template do Laudo APAC (HTTP ${res.status}).`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
