import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Renderiza HTML em PDF A4 usando html2canvas + jsPDF.addImage.
 * Mais confiável que jsPDF.html() para conteúdo off-screen.
 */
export async function htmlToPdfBase64(
  fullHtml: string,
  filenameHint = 'documento',
): Promise<{ base64: string; filename: string }> {
  // Container visível em tela mas fora do fluxo (necessário para html2canvas medir corretamente)
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.zIndex = '-1';
  container.style.opacity = '0';
  container.style.pointerEvents = 'none';
  container.style.width = '794px'; // A4 @ 96dpi
  container.style.background = '#ffffff';
  container.style.color = '#000000';
  container.style.padding = '24px';
  container.style.boxSizing = 'border-box';
  container.innerHTML = fullHtml;
  document.body.appendChild(container);

  try {
    // Aguarda fontes/imagens
    if ((document as any).fonts?.ready) {
      try { await (document as any).fonts.ready; } catch { /* noop */ }
    }
    await new Promise((r) => setTimeout(r, 100));

    const canvas = await html2canvas(container, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      windowWidth: 794,
    });

    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Paginação: adiciona a imagem completa e desloca com negative y para próxima página
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
    document.body.removeChild(container);
  }
}
