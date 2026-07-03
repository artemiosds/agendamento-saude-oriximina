import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Renderiza HTML em PDF A4 usando iframe isolado + html2canvas + jsPDF.
 * Isolar em iframe evita herança do CSS global (oklch/tailwind), que quebra html2canvas.
 */
export async function htmlToPdfBase64(
  fullHtml: string,
  filenameHint = 'documento',
): Promise<{ base64: string; filename: string }> {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '0';
  iframe.style.top = '0';
  iframe.style.width = '820px';
  iframe.style.height = '1200px';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.zIndex = '-1';
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;padding:0;background:#fff;color:#000;
        font-family:Georgia,'Times New Roman',serif;font-size:13px;line-height:1.6;}
      #root{width:794px;padding:24px;box-sizing:border-box;background:#fff;color:#000;}
      *{color:inherit;}
      img{max-width:100%;}
    </style></head><body><div id="root">${fullHtml}</div></body></html>`);
    doc.close();

    // Aguarda layout / imagens
    await new Promise((r) => setTimeout(r, 200));
    const anyDoc = doc as any;
    if (anyDoc.fonts?.ready) { try { await anyDoc.fonts.ready; } catch { /* noop */ } }

    const target = doc.getElementById('root') as HTMLElement;
    // Ajusta altura do iframe para conter todo o conteúdo
    iframe.style.height = `${Math.max(target.scrollHeight + 40, 1200)}px`;

    const canvas = await html2canvas(target, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      windowWidth: 794,
      width: 794,
      height: target.scrollHeight,
    });

    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pageHeight;
    }

    const dataUri = pdf.output('datauristring');
    const base64 = dataUri.split(',')[1] || '';
    const safe = filenameHint.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 60) || 'documento';
    return { base64, filename: `${safe}_${Date.now()}.pdf` };
  } finally {
    document.body.removeChild(iframe);
  }
}
