import { useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Download, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PORTAL_PUBLIC_URL, PORTAL_GUIDE_STEPS, PORTAL_GUIDE_SECURITY } from '@/lib/portalAssistance';

/** Generic guide only: no patient identifiers, personalized links or credentials. */
export default function PortalPublicGuide() {
  const qr = useRef<HTMLCanvasElement>(null);
  const running = useRef(false);
  const [busy,setBusy] = useState(false);
  const download = async () => {
    if (running.current || !qr.current) return;
    running.current = true; setBusy(true);
    try {
      const image = qr.current.toDataURL('image/png');
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
      doc.setTextColor(22,56,65);
      doc.setFont('helvetica','bold'); doc.setFontSize(12);
      doc.text('SECRETARIA MUNICIPAL DE SAÚDE DE ORIXIMINÁ',105,16,{align:'center'});
      doc.setFontSize(20); doc.text('Guia de acesso ao Portal do Paciente',105,27,{align:'center'});
      doc.addImage(image,'PNG',82,34,46,46);
      doc.setFont('helvetica','normal'); doc.setFontSize(10);
      doc.text(PORTAL_PUBLIC_URL,105,86,{align:'center'});
      let y=100;
      for (const [i,step] of PORTAL_GUIDE_STEPS.entries()) {
        doc.setTextColor(22,56,65); doc.setFont('helvetica','bold'); doc.setFontSize(13);
        doc.text((i+1)+'. '+step.title,17,y);
        y+=7;
        doc.setFont('helvetica','normal'); doc.setFontSize(12); doc.setTextColor(35,45,50);
        const lines = doc.splitTextToSize(step.text,176) as string[];
        doc.text(lines,17,y,{lineHeightFactor:1.3});
        y+=lines.length*5.6+7;
      }
      doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(22,56,65);
      const warning = doc.splitTextToSize(PORTAL_GUIDE_SECURITY,176) as string[];
      doc.text(warning,17,y,{lineHeightFactor:1.3});
      y+=warning.length*5.6+8;
      doc.setFont('helvetica','normal'); doc.setFontSize(10);
      doc.text('Material de orientação. Não comprova criação ou ativação de conta.',17,y);
      doc.save('guia-portal-paciente-oriximina.pdf');
    } catch { toast.error('Não foi possível gerar o guia. Tente novamente ou utilize o endereço exibido.'); }
    finally { running.current=false; setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(PORTAL_PUBLIC_URL); toast.success('Endereço público copiado.'); }
    catch { toast.error('Não foi possível copiar. Selecione o endereço exibido.'); }
  };
  return <div className="space-y-3">
    <div className="flex flex-col sm:flex-row gap-3 items-center rounded-xl border p-3">
      <div className="shrink-0 rounded-lg bg-white p-1">
        <QRCodeCanvas ref={qr} value={PORTAL_PUBLIC_URL} size={160} marginSize={4} level="M" aria-label="QR Code do endereço público do Portal do Paciente"/>
      </div>
      <div className="min-w-0 space-y-2 text-sm">
        <p className="font-semibold">Acesse pelo celular do paciente</p>
        <p className="break-all select-all text-xs text-muted-foreground">{PORTAL_PUBLIC_URL}</p>
        <Button size="sm" variant="outline" onClick={()=>void copy()}><Copy className="h-4 w-4 mr-1"/>Copiar endereço</Button>
        <p className="text-xs text-muted-foreground">Não faça login do paciente no navegador da administração. O QR Code não autentica nem identifica ninguém.</p>
      </div>
    </div>
    <ol className="space-y-2 text-sm">{PORTAL_GUIDE_STEPS.map((step,i)=><li key={step.title} className="flex gap-2"><span className="rounded-full bg-primary/10 text-primary font-semibold h-6 w-6 shrink-0 flex items-center justify-center">{i+1}</span><div><strong>{step.title}</strong><p className="text-muted-foreground">{step.text}</p></div></li>)}</ol>
    <p className="rounded-lg bg-muted/50 p-3 text-sm">{PORTAL_GUIDE_SECURITY}</p>
    <Button variant="outline" className="w-full" disabled={busy} onClick={()=>void download()}><Download className="h-4 w-4 mr-2"/>{busy?'Gerando guia…':'Baixar guia em PDF para imprimir'}</Button>
    <p className="text-xs text-muted-foreground">Guia institucional genérico, sem dados pessoais ou senha. Não é comprovante de ativação.</p>
  </div>;
}
