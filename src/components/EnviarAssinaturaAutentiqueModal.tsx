import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { FileSignature, Plus, Trash2, Loader2, Upload, CheckCircle2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { autentiqueService, type AutentiqueSigner } from '@/services/autentiqueService';
import { whatsappService } from '@/services/whatsappService';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  nomeDocumentoSugerido?: string;
  documentoGeradoId?: string;
  pacienteEmail?: string;
  pacienteNome?: string;
  pacienteTelefone?: string;
  profissionalEmail?: string;
  profissionalNome?: string;
  arquivoPreCarregado?: { base64: string; filename: string };
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

const EnviarAssinaturaAutentiqueModal: React.FC<Props> = ({
  open, onOpenChange, nomeDocumentoSugerido, documentoGeradoId,
  pacienteEmail, pacienteNome, pacienteTelefone, profissionalEmail, profissionalNome,
}) => {
  const [nome, setNome] = useState(nomeDocumentoSugerido || 'Documento clínico');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [notificarWhats, setNotificarWhats] = useState(!!pacienteTelefone);
  const [telefoneWhats, setTelefoneWhats] = useState(pacienteTelefone || '');
  const [signers, setSigners] = useState<AutentiqueSigner[]>(() => {
    const arr: AutentiqueSigner[] = [];
    if (profissionalNome && profissionalEmail) arr.push({ name: profissionalNome, email: profissionalEmail, action: 'SIGN' });
    if (pacienteNome && pacienteEmail) arr.push({ name: pacienteNome, email: pacienteEmail, action: 'SIGN' });
    if (arr.length === 0) arr.push({ name: '', email: '', action: 'SIGN' });
    return arr;
  });
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState<{ id: string; name: string } | null>(null);

  const addSigner = () => setSigners([...signers, { name: '', email: '', action: 'SIGN' }]);
  const removeSigner = (i: number) => setSigners(signers.filter((_, idx) => idx !== i));
  const updateSigner = (i: number, patch: Partial<AutentiqueSigner>) =>
    setSigners(signers.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const handleEnviar = async () => {
    if (!file) { toast({ title: 'Selecione o PDF do documento', variant: 'destructive' }); return; }
    const validos = signers.filter(s => s.email.trim() && s.name.trim());
    if (validos.length === 0) { toast({ title: 'Informe pelo menos um signatário', variant: 'destructive' }); return; }

    setLoading(true);
    try {
      const b64 = await fileToBase64(file);
      const { data, error } = await autentiqueService.criarDocumento({
        nome: nome.trim() || file.name,
        file_base64: b64,
        filename: file.name,
        message: message.trim() || undefined,
        signers: validos,
        documento_gerado_id: documentoGeradoId,
      });
      if (error || !(data as any)?.success) {
        toast({ title: 'Falha ao enviar', description: String((data as any)?.error || error), variant: 'destructive' });
        return;
      }
      setEnviado({ id: (data as any).document.id, name: (data as any).document.name });
      toast({ title: 'Enviado para assinatura', description: 'Signatários receberão o e-mail da Autentique.' });

      // Notificação WhatsApp complementar (best-effort, não bloqueia fluxo)
      if (notificarWhats && telefoneWhats.trim() && pacienteNome) {
        whatsappService.sendDirect({
          tipo: 'documento_assinatura',
          telefone: telefoneWhats.trim(),
          paciente_nome: pacienteNome,
          observacoes: `Você recebeu um documento para assinatura eletrônica (${nome}). Verifique seu e-mail cadastrado na Autentique.`,
        }).catch(() => { /* silencioso */ });
      }
    } catch (err) {
      toast({ title: 'Erro', description: String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (o: boolean) => {
    if (!o) { setEnviado(null); setFile(null); }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="w-4 h-4 text-primary" /> Enviar para assinatura eletrônica
          </DialogTitle>
          <DialogDescription>Integração com Autentique — os signatários receberão e-mail para assinar.</DialogDescription>
        </DialogHeader>

        {enviado ? (
          <div className="py-6 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" />
            <div className="font-semibold">Documento enviado</div>
            <div className="text-sm text-muted-foreground">{enviado.name}</div>
            <Badge variant="outline" className="font-mono text-xs">{enviado.id}</Badge>
            <div className="text-xs text-muted-foreground">O status será atualizado automaticamente quando os signatários assinarem.</div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome do documento</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Termo de consentimento" />
            </div>

            <div className="space-y-1.5">
              <Label>Arquivo PDF</Label>
              <div className="flex items-center gap-2">
                <Input type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} />
                <Upload className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Gere o PDF pelo botão "Imprimir → Salvar como PDF" do documento e anexe aqui.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Mensagem opcional</Label>
              <Textarea rows={2} value={message} onChange={e => setMessage(e.target.value)} placeholder="Instruções para os signatários" />
            </div>

            <div className="space-y-2 rounded-md border border-border/60 p-2.5 bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Também avisar o paciente por WhatsApp</Label>
                <Switch checked={notificarWhats} onCheckedChange={setNotificarWhats} />
              </div>
              {notificarWhats && (
                <Input
                  placeholder="Telefone (com DDD)"
                  value={telefoneWhats}
                  onChange={e => setTelefoneWhats(e.target.value)}
                  className="h-8"
                />
              )}
            </div>


            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Signatários</Label>
                <Button type="button" size="sm" variant="outline" onClick={addSigner} className="h-7 gap-1">
                  <Plus className="w-3 h-3" /> Adicionar
                </Button>
              </div>
              {signers.map((s, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1">
                    <Input placeholder="Nome" value={s.name} onChange={e => updateSigner(i, { name: e.target.value })} className="h-8" />
                    <Input placeholder="E-mail" type="email" value={s.email} onChange={e => updateSigner(i, { email: e.target.value })} className="h-8" />
                  </div>
                  {signers.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeSigner(i)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          {enviado ? (
            <Button onClick={() => handleClose(false)}>Fechar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
              <Button onClick={handleEnviar} disabled={loading}>
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando</> : <><FileSignature className="w-4 h-4 mr-2" /> Enviar</>}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EnviarAssinaturaAutentiqueModal;
