import React, { useEffect, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { QrCode, Copy, Printer, Download, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { openPrintDocument } from '@/lib/printLayout';
import { getDefaultPatientPortalLink, getPatientPortalLink, PORTAL_QR_STORAGE_KEY } from '@/lib/patientPortalLink';

const DEFAULTS = {
  titulo: 'Acesse o Portal do Paciente pelo Celular',
  mensagem: 'Consulte seus agendamentos, acompanhe sua posição na fila e mantenha seus dados atualizados, sem precisar ir ao balcão de atendimento.',
  passos: '1. Abra a câmera do seu celular\n2. Aponte para o QR Code acima\n3. Toque no link e entre com seu e-mail e senha',
  rodape: 'Secretaria Municipal de Saúde de Oriximiná • Dúvidas? Procure a recepção da sua unidade.',
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const PortalQrCodeCard: React.FC = () => {
  const [link, setLink] = useState(getPatientPortalLink);
  const [hydrated, setHydrated] = useState(false);
  const [form, setForm] = useState(DEFAULTS);
  const svgWrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PORTAL_QR_STORAGE_KEY) || 'null');
      if (saved) setForm({ ...DEFAULTS, ...saved.form });
      setLink(getPatientPortalLink());
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(PORTAL_QR_STORAGE_KEY, JSON.stringify({ form, link }));
  }, [form, link, hydrated]);

  const set = (k: keyof typeof DEFAULTS) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const copiar = async () => {
    try { await navigator.clipboard.writeText(link); toast.success('Link copiado'); }
    catch { toast.error('Não foi possível copiar'); }
  };

  const baixarPng = () => {
    const svg = svgWrap.current?.querySelector('svg');
    if (!svg) return;
    const data = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 1200; c.height = 1200;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1200, 1200);
      ctx.drawImage(img, 0, 0, 1200, 1200);
      const a = document.createElement('a');
      a.download = 'qrcode-portal-paciente.png';
      a.href = c.toDataURL('image/png');
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)));
  };

  const imprimir = async () => {
    const qr = renderToStaticMarkup(
      <QRCodeSVG value={link} size={300} level="H" marginSize={2} bgColor="#ffffff" fgColor="#000000" />,
    );
    const passos = form.passos.split('\n').filter(Boolean).map(p => `<li>${esc(p.replace(/^\d+[.)]\s*/, ''))}</li>`).join('');
    const body = `
      <style>
        .qr-cartaz{text-align:center;padding:0 4mm;}
        .qr-cartaz h1{font-size:18pt;margin:2mm 0;color:#1f4f6d;line-height:1.15;}
        .qr-cartaz .msg{font-size:10pt;margin:0 auto 3mm;max-width:160mm;line-height:1.25;}
        .qr-cartaz .qr{display:inline-block;padding:2mm;border:1.5px solid #2A6F97;border-radius:3mm;}
        .qr-cartaz .qr svg{width:54mm;height:54mm;display:block;}
        .qr-cartaz .cam{font-size:10pt;font-weight:bold;margin:2mm 0 3mm;color:#2A6F97;}
        .qr-cartaz .how{font-size:10pt;line-height:1.25;margin:0 0 1mm;}
        .qr-cartaz ol{text-align:left;display:inline-block;font-size:10pt;line-height:1.3;margin:1mm 0 2mm;padding-left:6mm;}
        .qr-cartaz .url{font-family:monospace;font-size:9pt;margin:1mm 0 3mm;word-break:break-all;}
        .qr-cartaz .rod{font-size:9pt;border-top:1px solid #ccc;padding-top:2mm;color:#444;}
      </style>
      <div class="qr-cartaz">
        <h1>${esc(form.titulo)}</h1>
        <p class="msg">${esc(form.mensagem).replace(/\n/g, '<br/>')}</p>
        <div class="qr">${qr}</div>
        <div class="cam">Aponte a câmera do seu celular</div>
        ${passos ? `<div><strong class="how">Como acessar:</strong><br/><ol>${passos}</ol></div>` : ''}
        <div class="url">Ou digite: ${esc(link)}</div>
        <div class="rod">${esc(form.rodape)}</div>
      </div>`;
    await openPrintDocument('Portal do Paciente', body, undefined, {
      margens: { superior: 14, inferior: 20, esquerda: 16, direita: 16 },
      tipografia: { fonte: 'Arial', tamanhoBase: 10, tamanhoTitulo: 12, espacamento: 1.1, alinhamento: 'center' },
    });
  };

  return (
    <Card className="shadow-card border-0">
      <CardContent className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <QrCode className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold font-display text-foreground">Link e QR Code do Portal do Paciente</h3>
            <p className="text-sm text-muted-foreground">Gere o cartaz A4 institucional para murais e recepção</p>
          </div>
        </div>
        <div className="grid md:grid-cols-[1fr_auto] gap-6">
          <div className="space-y-3">
            <div>
              <Label>Link de acesso</Label>
              <Input value={link} onChange={e => setLink(e.target.value)} />
            </div>
            <div><Label>Título</Label><Input value={form.titulo} onChange={set('titulo')} /></div>
            <div><Label>Mensagem</Label><Textarea rows={3} value={form.mensagem} onChange={set('mensagem')} /></div>
            <div><Label>Passo a passo (um por linha)</Label><Textarea rows={3} value={form.passos} onChange={set('passos')} /></div>
            <div><Label>Rodapé</Label><Input value={form.rodape} onChange={set('rodape')} /></div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={imprimir}><Printer className="w-4 h-4 mr-2" />Imprimir cartaz A4</Button>
              <Button variant="outline" onClick={copiar}><Copy className="w-4 h-4 mr-2" />Copiar link</Button>
              <Button variant="outline" onClick={baixarPng}><Download className="w-4 h-4 mr-2" />Baixar QR Code</Button>
              <Button variant="ghost" onClick={() => { setForm(DEFAULTS); setLink(getDefaultPatientPortalLink()); }}>
                <RotateCcw className="w-4 h-4 mr-2" />Restaurar texto padrão
              </Button>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div ref={svgWrap} className="p-3 rounded-xl border border-border bg-card">
              <QRCodeSVG value={link} size={200} level="H" marginSize={2} bgColor="#ffffff" fgColor="#000000" />
            </div>
            <span className="text-xs text-muted-foreground">Prévia — teste com a câmera</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PortalQrCodeCard;
