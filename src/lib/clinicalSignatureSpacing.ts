// Local layout rules: only the six explicitly approved institutional models.
const approved = new Set([
  "atestado médico padrão",
  "receituário médico padrão",
  "encaminhamento clínico padrão",
  "declaração de justificativa de falta",
  "declaração de comparecimento",
  "termo de compromisso cer ii",
]);
const normalize = (s: string) => s.trim().toLocaleLowerCase("pt-BR");
export const usesClinicalSignatureSpacing = (name?: string) => approved.has(normalize(name || ""));
export const CLINICAL_SIGNATURE_SPACE_MM = 32;
const rules: Record<string, RegExp[]> = {
  "atestado médico padrão": [/assinatura\s+e\s+carimbo/i],
  "declaração de justificativa de falta": [/profissional\s+de\s+saúde/i, /paciente\s*:/i],
  "declaração de comparecimento": [/profissional\s+de\s+saúde/i, /paciente\s*:/i],
  "termo de compromisso cer ii": [/paciente\s+ou\s+responsável\s+legal/i, /profissional\s+responsável/i],
};

const text = (el: Element) => (el.textContent || "").replace(/\u00a0/g, " ").trim();
const isSignatureLine = (el: Element) => el.tagName === "P" && /^[_\s]{12,}$/.test(text(el));
const isEmptyParagraph = (el: Element) =>
  el.tagName === "P" && !text(el) && !el.querySelector("img,table,input,.blank-field,.blank-line,.blank-check");

// Preserve original text and inline formatting. Group only the verified tail of each
// institutional template; unfamiliar custom layouts are left alone.
export function spaceClinicalSignatureLines(root: HTMLElement, name?: string): number {
  const rule = rules[normalize(name || "")];
  if (!rule || root.querySelector("[data-clinical-signature-layout]")) return 0;
  const children = Array.from(root.children);
  const indices = children.flatMap((el, i) => isSignatureLine(el) ? [i] : []);
  if (indices.length !== rule.length) return 0;
  const groups = indices.map((start, i) => children.slice(start, indices[i + 1] ?? children.length));
  // Do not consume arbitrary edited content. Each signature tail must be short,
  // paragraph-only and have the expected explicit caption.
  if (groups.some((group, i) =>
    group.some(el => el.tagName !== "P") ||
    group.filter(el => !isEmptyParagraph(el)).length > 6 ||
    !rule[i].test(group.map(text).join(" "))
  )) return 0;
  for (const group of groups) {
    const first = group[0];
    let previous = first.previousElementSibling;
    while (previous && isEmptyParagraph(previous)) {
      const before = previous.previousElementSibling;
      previous.remove();
      previous = before;
    }
    const block = root.ownerDocument.createElement("div");
    block.setAttribute("data-clinical-signature-layout", "manual");
    block.style.paddingTop = CLINICAL_SIGNATURE_SPACE_MM + "mm";
    block.style.breakInside = "avoid";
    block.style.pageBreakInside = "avoid";
    block.style.textAlign = "center";
    first.before(block);
    for (const el of group) {
      if (isEmptyParagraph(el)) el.remove();
      else block.append(el);
    }
  }
  return groups.length;
}

export function layoutClinicalSignatures(html: string, name?: string): { html: string; grouped: number } {
  if (!usesClinicalSignatureSpacing(name)) return { html, grouped: 0 };
  const doc = new DOMParser().parseFromString("<body>" + html + "</body>", "text/html");
  const grouped = spaceClinicalSignatureLines(doc.body, name);
  return { html: grouped ? doc.body.innerHTML : html, grouped };
}

// For templates without an existing manual signature line, reserve space above
// the existing digital signature and stamp footer; do not generate a new signature.
export function clinicalSignatureFooterStyle(name?: string, grouped = 0): string {
  if (!usesClinicalSignatureSpacing(name)) return "";
  return grouped
    ? ' style="margin-top:12mm;break-inside:avoid;page-break-inside:avoid"'
    : ' style="margin-top:0;padding-top:32mm;break-inside:avoid;page-break-inside:avoid"';
}
