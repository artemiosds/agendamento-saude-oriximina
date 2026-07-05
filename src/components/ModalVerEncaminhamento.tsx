import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Printer, X, Loader2 } from 'lucide-react';
import { openPrintDocument, loadDocumentConfig, type DocumentConfig } from '@/lib/printLayout';
import { useAuth } from '@/contexts/AuthContext';
import type { EncaminhamentoData } from '@/services/encaminhamentoService';
import { marcarComoLido } from '@/services/encaminhamentoService';
import logoSmsFallback from '@/assets/logo-sms-oriximina.jpeg';
import logoCerFallback from '@/assets/logo-cer-ii.webp';

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
        if (ok && onStatusChange) onStatusChange();
      });
    }
  }, [open, encaminhamento?.id]);

  if (!encaminhamento) return null;

  const dataFormatada = new Date(encaminhamento.data_geracao).toLocaleDateString('pt-BR');
  const horaFormatada = new Date(encaminhamento.data_geracao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const handlePrint = () => {
    const html = encaminhamento.conteudo_documento.replace(/\n/g, '<br/>');
    const rodapeImpressao = user
      ? `Impresso por: ${user.nome} — ${user.role} — ${new Date().toLocaleString('pt-BR')}`
      : '';

    const body = `
      <div class="content-block" style="margin-top:20px;">
        <div style="font-size:14px;line-height:1.8;white-space:pre-wrap;">${html}</div>
      </div>
      <div class="signature">
        <div class="signature-line"></div>
        <div class="name">${encaminhamento.profissional_origem_nome}</div>
        <div class="role">${encaminhamento.profissional_origem_profissao} — ${encaminhamento.profissional_origem_conselho}</div>
      </div>
      <div style="margin-top:20px; padding-top:10px; border-top:1px solid #e2e8f0; font-size:10px; color:#94a3b8;">
        <p>Recebido em: ${dataFormatada} às ${horaFormatada}</p>
        <p>Gerado por: ${encaminhamento.gerado_por} — ${encaminhamento.gerado_por_perfil}</p>
        ${rodapeImpressao ? `<p>${rodapeImpressao}</p>` : ''}
      </div>
    `;

    openPrintDocument(encaminhamento.tipo_documento || 'Encaminhamento', body, {
      'Paciente': encaminhamento.paciente_nome,
      'CPF': encaminhamento.paciente_cpf,
      'Data': dataFormatada,
    });
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
          <div className="border rounded-lg p-5 bg-white">
            <div className="flex items-center gap-3 mb-3 border-b pb-3">
              <img src={config?.logoEsquerda || logoSmsFallback} alt="Logo" className="w-10 h-10 object-contain" />
              <div className="flex-1 text-center">
                <h3 className="font-bold text-[11px] uppercase text-primary leading-tight">{config?.linha1 || 'Secretaria Municipal de Saúde de Oriximiná'}</h3>
                <p className="text-[10px] text-muted-foreground font-semibold leading-tight">{config?.linha2 || 'CER II — Centro Especializado em Reabilitação'}</p>
              </div>
              <img src={config?.logoDireita || logoCerFallback} alt="Logo" className="w-10 h-10 object-contain" />
            </div>
            <div className="text-center mb-3">
              <p className="text-xs font-semibold mt-1 uppercase">{encaminhamento.tipo_documento || 'Encaminhamento'}</p>
              <p className="text-xs text-muted-foreground">{dataFormatada}</p>
            </div>
            <Separator className="mb-3" />
            <div className="text-sm leading-relaxed whitespace-pre-wrap">{encaminhamento.conteudo_documento}</div>
            <div className="mt-8 text-center">
              <div className="w-64 border-t border-foreground mx-auto mb-1" />
              <p className="text-xs font-semibold">{encaminhamento.profissional_origem_nome}</p>
              <p className="text-xs text-muted-foreground">{encaminhamento.profissional_origem_profissao} — {encaminhamento.profissional_origem_conselho}</p>
            </div>
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
