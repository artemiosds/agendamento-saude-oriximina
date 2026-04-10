import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Eye, Printer, XCircle, FileText, Loader2 } from 'lucide-react';
import { openPrintDocument } from '@/lib/printLayout';

interface DocumentoGerado {
  id: string;
  tipo_documento: string;
  profissional_nome: string;
  status: string;
  created_at: string;
  conteudo_html: string;
  hash_assinatura: string;
  assinado_em: string | null;
  campos_formulario: Record<string, unknown>;
  paciente_nome: string;
}

interface Props {
  pacienteId: string;
  pacienteNome: string;
}

const STATUS_COLORS: Record<string, string> = {
  rascunho: 'bg-yellow-100 text-yellow-800',
  assinado: 'bg-green-100 text-green-800',
  cancelado: 'bg-red-100 text-red-800',
};

const DocumentosHistorico: React.FC<Props> = ({ pacienteId, pacienteNome }) => {
  const { user } = useAuth();
  const [docs, setDocs] = useState<DocumentoGerado[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewDoc, setPreviewDoc] = useState<DocumentoGerado | null>(null);
  const [cancelDoc, setCancelDoc] = useState<DocumentoGerado | null>(null);
  const [motivo, setMotivo] = useState('');
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    if (pacienteId) loadDocs();
  }, [pacienteId]);

  const loadDocs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('documentos_gerados')
      .select('*')
      .eq('paciente_id', pacienteId)
      .order('created_at', { ascending: false });
    setDocs((data as unknown as DocumentoGerado[]) || []);
    setLoading(false);
  };

  const handlePrint = (doc: DocumentoGerado) => {
    openPrintDocument(doc.tipo_documento, doc.conteudo_html, {
      Paciente: doc.paciente_nome,
      Status: doc.status,
    });
  };

  const handleCancel = async () => {
    if (!cancelDoc || !motivo.trim()) {
      toast.error('Informe o motivo do cancelamento');
      return;
    }
    setCanceling(true);
    const { error } = await supabase
      .from('documentos_gerados')
      .update({
        status: 'cancelado',
        motivo_cancelamento: motivo,
        cancelado_por: user?.nome || '',
        cancelado_em: new Date().toISOString(),
      })
      .eq('id', cancelDoc.id);

    if (error) {
      toast.error('Erro ao cancelar: ' + error.message);
    } else {
      toast.success('Documento cancelado');
      setCancelDoc(null);
      setMotivo('');
      loadDocs();
    }
    setCanceling(false);
  };

  // Group by type
  const grouped = docs.reduce<Record<string, DocumentoGerado[]>>((acc, d) => {
    const key = d.tipo_documento || 'Outros';
    if (!acc[key]) acc[key] = [];
    acc[key].push(d);
    return acc;
  }, {});

  const typeCounts = Object.entries(grouped).map(([tipo, items]) => `${items.length} ${tipo}`).join(' | ');

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground p-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando documentos...</div>;
  if (docs.length === 0) return <p className="text-sm text-muted-foreground p-2">Nenhum documento gerado para este paciente.</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">Documentos Gerados</span>
        <span className="text-xs text-muted-foreground ml-auto">{typeCounts}</span>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2 font-medium">Tipo</th>
              <th className="text-left p-2 font-medium">Profissional</th>
              <th className="text-left p-2 font-medium">Data</th>
              <th className="text-left p-2 font-medium">Status</th>
              <th className="text-right p-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {docs.map(d => (
              <tr key={d.id} className="border-t hover:bg-muted/30">
                <td className="p-2 capitalize">{d.tipo_documento}</td>
                <td className="p-2">{d.profissional_nome}</td>
                <td className="p-2">{new Date(d.created_at).toLocaleDateString('pt-BR')}</td>
                <td className="p-2">
                  <Badge variant="outline" className={STATUS_COLORS[d.status] || ''}>
                    {d.status}
                  </Badge>
                </td>
                <td className="p-2 text-right space-x-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreviewDoc(d)} title="Visualizar">
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePrint(d)} title="Imprimir">
                    <Printer className="w-3.5 h-3.5" />
                  </Button>
                  {d.status === 'assinado' && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setCancelDoc(d)} title="Cancelar">
                      <XCircle className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewDoc?.tipo_documento} — {previewDoc?.paciente_nome}</DialogTitle>
            <DialogDescription className="sr-only">Visualização do documento</DialogDescription>
          </DialogHeader>
          {previewDoc && (
            <div className="border rounded-lg p-5 bg-white">
              <div dangerouslySetInnerHTML={{ __html: previewDoc.conteudo_html }} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDoc(null)}>Fechar</Button>
            {previewDoc && (
              <Button onClick={() => handlePrint(previewDoc)} className="gap-1.5">
                <Printer className="w-4 h-4" /> Imprimir
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={!!cancelDoc} onOpenChange={() => { setCancelDoc(null); setMotivo(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar documento</DialogTitle>
            <DialogDescription>O documento será marcado como cancelado. Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Motivo do cancelamento</Label>
            <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Informe o motivo..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCancelDoc(null); setMotivo(''); }}>Voltar</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={canceling || !motivo.trim()}>
              {canceling ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar cancelamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentosHistorico;
