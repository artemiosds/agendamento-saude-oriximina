import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, X } from 'lucide-react';
import { receivedReferralBody, referralFields } from '@/lib/encaminhamentoDocument';
import { openPrintDocument, loadDocumentConfig, type DocumentConfig } from '@/lib/printLayout';
import { useAuth } from '@/contexts/AuthContext';
import type { EncaminhamentoData } from '@/services/encaminhamentoService';
import { marcarComoLido } from '@/services/encaminhamentoService';
import logoSmsFallback from '@/assets/logo-sms-oriximina.jpeg';
import logoCerFallback from '@/assets/logo-cer-ii.webp';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encaminhamento: EncaminhamentoData | null;
  onStatusChange?: () => void;
}

const ModalVerEncaminhamento: React.FC<Props> = ({ open, onOpenChange, encaminhamento, onStatusChange }) => {
  const { user } = useAuth();
  const [config, setConfig] = useState<DocumentConfig | null>(null);

  useEffect(() => {
    if (open) {
      loadDocumentConfig().then(setConfig);
    }
    if (open && encaminhamento && encaminhamento.status === 'recebido') {
      marcarComoLido(encaminhamento).then((ok) => {
        if (ok) onStatusChange?.();
        else toast.error('Não foi possível registrar a leitura. Tente novamente.');
      });
    }
  }, [open, encaminhamento, onStatusChange]);

  if (!encaminhamento) return null;

  const dataFormatada = new Date(encaminhamento.data_geracao).toLocaleDateString('pt-BR');
  const horaFormatada = new Date(encaminhamento.data_geracao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const handlePrint = () => {
    const body = receivedReferralBody(encaminhamento) + referralFields({
      'Gerado por': `${encaminhamento.gerado_por} — ${encaminhamento.gerado_por_perfil}`,
      'Impresso por': user?.nome || 'Não informado',
    });
    void openPrintDocument(encaminhamento.tipo_documento || 'Encaminhamento', body, undefined,
      { linha1: 'SECRETARIA MUNICIPAL DE SAÚDE DE ORIXIMINÁ' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            📋 Encaminhamento — {encaminhamento.paciente_nome}
          </DialogTitle>
          <DialogDescription className="sr-only">Detalhes do encaminhamento recebido</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Document preview */}
          <div className="border rounded-xl p-5 bg-white text-slate-900">
            <div className="flex items-center gap-3 mb-3 border-b pb-3">
              <img src={config?.logoEsquerda || logoSmsFallback} alt="Logo" className="w-10 h-10 object-contain" />
              <div className="flex-1 text-center">
                <h3 className="font-bold text-xs uppercase text-[#2A6F97] leading-tight">Secretaria Municipal de Saúde de Oriximiná</h3>
                <p className="text-[10px] text-muted-foreground font-semibold leading-tight">{config?.linha2 || 'CER II — Centro Especializado em Reabilitação'}</p>
              </div>
              <img src={config?.logoDireita || logoCerFallback} alt="Logo" className="w-10 h-10 object-contain" />
            </div>
            <div className="text-center mb-3">
              <p className="text-xs font-semibold mt-1 uppercase">{encaminhamento.tipo_documento || 'Encaminhamento'}</p>
              <p className="text-xs text-muted-foreground">{dataFormatada}</p>
            </div>
            <div className="space-y-4 text-sm leading-relaxed [&_.info-grid]:grid [&_.info-grid]:grid-cols-1 sm:[&_.info-grid]:grid-cols-2 [&_.info-grid]:gap-3 [&_.field-label]:text-xs [&_.field-label]:font-semibold [&_.field-label]:text-slate-500 [&_.section-title]:my-3 [&_.section-title]:font-semibold [&_.section-title]:text-[#2A6F97] [&_.signature]:mt-8 [&_.signature]:text-center [&_.name]:font-semibold" dangerouslySetInnerHTML={{ __html: receivedReferralBody(encaminhamento) }} />
          </div>

          {/* Metadata */}
          <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1">
            <p><strong>Recebido em:</strong> {dataFormatada} às {horaFormatada}</p>
            <p><strong>Gerado por:</strong> {encaminhamento.gerado_por} — {encaminhamento.gerado_por_perfil}</p>
            <p><strong>Especialidade:</strong> {encaminhamento.especialidade_destino}</p>
            <p><strong>CID:</strong> {encaminhamento.paciente_cid || '—'}</p>
            {encaminhamento.data_leitura && (
              <p><strong>Lido em:</strong> {new Date(encaminhamento.data_leitura).toLocaleString('pt-BR')}</p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4 mr-1" /> Fechar
          </Button>
          <Button onClick={handlePrint} className="gap-1.5">
            <Printer className="w-4 h-4" /> Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ModalVerEncaminhamento;
