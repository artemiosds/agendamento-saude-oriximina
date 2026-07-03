import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Renderiza o HTML institucional em páginas A4 reais antes de enviar à Autentique.
 *
 * A falha anterior vinha de capturar o documento inteiro como UMA imagem alta e
 * depois deslocar essa mesma imagem no jsPDF. Esse recorte por altura fixa corta
 * linhas no meio (exatamente o que aparece no visualizador da Autentique).
 * Aqui a paginação acontece no DOM primeiro: cada folha A4 é montada com margem
 * ABNT, os parágrafos são distribuídos entre páginas e só então cada folha é
 * rasterizada inteira. Assim nenhuma linha é dividida pelo corte do PDF.
 */
export async function htmlToPdfBase64(
  fullHtml: string,
  filenameHint = 'documento',
): Promise<{ base64: string; filename: string }> {
  const A4_WIDTH_PX = Math.round((210 / 25.4) * 96);
  const A4_HEIGHT_PX = Math.round((297 / 25.4) * 96);
  const mmToPx = (mm: number) => (mm / 25.4) * 96;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = `${A4_WIDTH_PX}px`;
  iframe.style.height = `${A4_HEIGHT_PX}px`;
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.zIndex = '-1';
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(/<html[\s>]/i.test(fullHtml)
      ? fullHtml
      : `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body>${fullHtml}</body></html>`);
    doc.close();

    await new Promise((r) => setTimeout(r, 250));
    const anyDoc = doc as any;
    if (anyDoc.fonts?.ready) { try { await anyDoc.fonts.ready; } catch { /* noop */ } }
    await Promise.all(Array.from(doc.images || []).map((img) => {
      const image = img as HTMLImageElement;
      if (image.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      });
    }));

    const originalPage = doc.querySelector('.doc-page') as HTMLElement | null;
    const originalContent = doc.querySelector('.doc-content') as HTMLElement | null;
    if (!originalPage || !originalContent) {
      throw new Error('Estrutura institucional do documento não encontrada para paginação A4.');
    }

    const win = doc.defaultView;
    const bodyStyle = win?.getComputedStyle(doc.body);
    const px = (value?: string, fallback = 0) => {
      const parsed = Number.parseFloat(value || '');
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    };

    const margins = {
      top: px(bodyStyle?.paddingTop, mmToPx(30)),
      right: px(bodyStyle?.paddingRight, mmToPx(20)),
      bottom: px(bodyStyle?.paddingBottom, mmToPx(20)),
      left: px(bodyStyle?.paddingLeft, mmToPx(30)),
    };

    const header = originalPage.querySelector('.doc-header') as HTMLElement | null;
    const titleBar = originalPage.querySelector('.doc-title-bar') as HTMLElement | null;
    const emit = originalPage.querySelector('.doc-emit') as HTMLElement | null;
    const meta = originalPage.querySelector('.doc-meta') as HTMLElement | null;
    const footer = originalPage.querySelector('.doc-footer') as HTMLElement | null;
    const sourceAbntText = originalContent.querySelector('.abnt-text') as HTMLElement | null;
    const sourceSignFooter = originalContent.querySelector('.doc-sign-footer') as HTMLElement | null;

    doc.head.insertAdjacentHTML('beforeend', `
      <style id="pdf-a4-autentique-pagination">
        html, body {
          width: ${A4_WIDTH_PX}px !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
        }
        body.pdf-render-document {
          overflow: visible !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .pdf-book {
          width: ${A4_WIDTH_PX}px;
          background: #ffffff;
        }
        .pdf-sheet {
          width: ${A4_WIDTH_PX}px;
          height: ${A4_HEIGHT_PX}px;
          padding: ${margins.top}px ${margins.right}px ${margins.bottom}px ${margins.left}px;
          box-sizing: border-box;
          background: #ffffff;
          color: #111827;
          overflow: hidden;
          position: relative;
        }
        .pdf-sheet + .pdf-sheet { margin-top: 0; }
        .pdf-sheet .doc-page {
          width: 100%;
          height: auto;
          min-height: 0;
          position: static;
          overflow: visible;
        }
        .pdf-sheet .doc-content,
        .pdf-sheet .doc-abnt,
        .pdf-sheet .abnt-text {
          overflow: visible !important;
        }
        .pdf-sheet .doc-abnt {
          margin-top: 12pt;
        }
        .pdf-sheet .doc-footer {
          display: none !important;
        }
        .pdf-page-footer {
          position: absolute;
          left: ${margins.left}px;
          right: ${margins.right}px;
          bottom: 14px;
          border-top: 1px solid #cbd5e1;
          padding-top: 4px;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 7px;
          line-height: 1.25;
          color: #64748b;
          text-align: center;
          background: #ffffff;
        }
        .pdf-page-footer .page-number {
          margin-top: 1px;
          color: #94a3b8;
        }
      </style>
    `);

    type PageParts = {
      sheet: HTMLElement;
      page: HTMLElement;
      content: HTMLElement;
      textWrap: HTMLElement;
      abntText: HTMLElement;
    };

    const book = doc.createElement('div');
    book.className = 'pdf-book';

    const makePage = (firstPage: boolean): PageParts => {
      const sheet = doc.createElement('div');
      sheet.className = 'pdf-sheet';

      const page = doc.createElement('div');
      page.className = originalPage.className || 'doc-page';

      if (firstPage) {
        [header, titleBar, emit, meta].forEach((node) => {
          if (node) page.appendChild(node.cloneNode(true));
        });
      }

      const content = doc.createElement('div');
      content.className = originalContent.className || 'doc-content';

      const textWrap = doc.createElement('div');
      textWrap.className = 'content-block doc-abnt';
      const abntText = doc.createElement('div');
      abntText.className = 'abnt-text';
      textWrap.appendChild(abntText);
      content.appendChild(textWrap);
      page.appendChild(content);
      sheet.appendChild(page);
      book.appendChild(sheet);
      return { sheet, page, content, textWrap, abntText };
    };

    const overflows = (sheet: HTMLElement) => sheet.scrollHeight > sheet.clientHeight + 2;
    let current = makePage(true);

    const shallowCloneWithText = (element: HTMLElement, text: string) => {
      const clone = element.cloneNode(false) as HTMLElement;
      clone.textContent = text;
      return clone;
    };

    const appendOversizedTextBlock = (element: HTMLElement) => {
      const text = element.textContent || '';
      if (!text.trim()) {
        current.abntText.appendChild(element.cloneNode(true));
        return;
      }

      const tokens = text.split(/(\s+)/).filter(token => token.length > 0);
      let line = '';
      let working = shallowCloneWithText(element, '');
      current.abntText.appendChild(working);

      for (const token of tokens) {
        const next = line + token;
        working.textContent = next;
        if (overflows(current.sheet) && line.trim()) {
          working.textContent = line.trimEnd();
          current = makePage(false);
          line = token.trimStart();
          working = shallowCloneWithText(element, line);
          current.abntText.appendChild(working);
        } else {
          line = next;
        }
      }
    };

    const appendTextBlock = (node: Element) => {
      const clone = node.cloneNode(true) as HTMLElement;
      current.abntText.appendChild(clone);
      if (!overflows(current.sheet)) return;

      clone.remove();
      current = makePage(false);
      current.abntText.appendChild(clone);
      if (overflows(current.sheet)) {
        clone.remove();
        appendOversizedTextBlock(node as HTMLElement);
      }
    };

    const textBlocks = sourceAbntText
      ? Array.from(sourceAbntText.children)
      : Array.from(originalContent.children).filter((child) => !child.classList.contains('doc-sign-footer'));

    textBlocks.forEach(appendTextBlock);

    if (sourceSignFooter) {
      const signClone = sourceSignFooter.cloneNode(true) as HTMLElement;
      current.content.appendChild(signClone);
      if (overflows(current.sheet)) {
        signClone.remove();
        current = makePage(false);
        current.content.appendChild(sourceSignFooter.cloneNode(true));
      }
    }

    doc.body.className = 'pdf-render-document';
    doc.body.innerHTML = '';
    doc.body.appendChild(book);

    Array.from(book.querySelectorAll<HTMLElement>('.pdf-sheet')).forEach((sheet) => {
      const emptyText = sheet.querySelector('.abnt-text');
      const emptyWrap = sheet.querySelector('.content-block.doc-abnt');
      if (emptyText && emptyWrap && !emptyText.textContent?.trim() && emptyText.children.length === 0) {
        emptyWrap.remove();
      }
    });

    const sheets = Array.from(book.querySelectorAll<HTMLElement>('.pdf-sheet'));
    const footerHtml = footer?.innerHTML || '';
    sheets.forEach((sheet, index) => {
      const pageFooter = doc.createElement('div');
      pageFooter.className = 'pdf-page-footer';
      pageFooter.innerHTML = `${footerHtml}<div class="page-number">Pág. ${index + 1}/${sheets.length}</div>`;
      sheet.appendChild(pageFooter);
    });

    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    for (let index = 0; index < sheets.length; index++) {
      if (index > 0) pdf.addPage();
      const canvas = await html2canvas(sheets[index], {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        windowWidth: A4_WIDTH_PX,
        windowHeight: A4_HEIGHT_PX,
        width: A4_WIDTH_PX,
        height: A4_HEIGHT_PX,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.94);
      pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
    }

    const dataUri = pdf.output('datauristring');
    const base64 = dataUri.split(',')[1] || '';
    const safe = filenameHint.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 60) || 'documento';
    return { base64, filename: `${safe}_${Date.now()}.pdf` };
  } finally {
    document.body.removeChild(iframe);
  }
}
