import jsPDF from 'jspdf';

/**
 * Renderiza HTML (com CSS institucional) em um PDF A4 e retorna base64.
 * Usa jsPDF.html() (html2canvas por baixo).
 */
export async function htmlToPdfBase64(fullHtml: string, filenameHint = 'documento'): Promise<{ base64: string; filename: string }> {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-100000px';
  container.style.top = '0';
  container.style.width = '794px'; // ~A4 @ 96dpi
  container.style.background = '#ffffff';
  container.style.color = '#000000';
  container.innerHTML = fullHtml;
  document.body.appendChild(container);

  try {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    await pdf.html(container, {
      x: 24,
      y: 24,
      width: pageWidth - 48,
      windowWidth: 794,
      autoPaging: 'text',
      html2canvas: { scale: 0.85, useCORS: true, backgroundColor: '#ffffff' },
    });
    const dataUri = pdf.output('datauristring');
    const base64 = dataUri.split(',')[1] || '';
    const safe = filenameHint.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 60) || 'documento';
    return { base64, filename: `${safe}_${Date.now()}.pdf` };
  } finally {
    document.body.removeChild(container);
  }
}
