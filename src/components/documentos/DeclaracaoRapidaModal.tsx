import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Printer } from 'lucide-react';
import { openPrintDocument } from '@/lib/printLayout';
import { toast } from 'sonner';

export interface DeclaracaoRapidaProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  paciente?: { nome: string; cpf?: string; cns?: string; cid?: string };
  profissional?: { nome: string; profissao?: string; numero_conselho?: string; tipo_conselho?: string; uf_conselho?: string };
  unidade?: string;
}

const FINALIDADES = ['Consulta', 'Sessão de Reabilitação', 'Procedimento', 'Exame', 'Outro'];

const esc = (s: string) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function buildDeclaracaoRapidaHtml(d: {
  paciente: string; cpf?: string; cns?: string; unidade: string; data: string;
  entrada: string; saida: string; finalidade: string; detalhe?: string; acompanhante?: string; cid?: string;
  profissional: string; conselho?: string; profissao?: string; dataExtenso: string;
}): string {
  const docs = [d.cpf ? `CPF nº <strong>${esc(d.cpf)}</strong>` : '', d.cns ? `CNS nº <strong>${esc(d.cns)}</strong>` : ''].filter(Boolean).join(', ');
  const motivo = esc(d.finalidade) + (d.detalhe ? ` — ${esc(d.detalhe)}` : '');
  return `
<p style="text-align:justify">Declaramos, para os devidos fins, que <strong>${esc(d.paciente)}</strong>${docs ? `, ${docs}` : ''}, compareceu a esta unidade (<strong>${esc(d.unidade)}</strong>) na data de <strong>${esc(d.data)}</strong>, no período das <strong>${esc(d.entrada)}</strong> às <strong>${esc(d.saida)}</strong>, para fins de: <strong>${motivo}</strong>.</p>
${d.acompanhante ? `<p style="text-align:justify">Esteve acompanhado(a) por <strong>${esc(d.acompanhante)}</strong>, durante o mesmo período.</p>` : ''}
${d.cid ? `<p>CID: <strong>${esc(d.cid)}</strong></p>` : ''}
<p style="text-align:justify">Expedimos a presente declaração para fins de justificativa junto às instituições que se fizerem necessárias.</p>
<p style="text-align:right;margin-top:24px">Oriximiná - PA, ${esc(d.dataExtenso)}.</p>
<div style="margin-top:48px;text-align:center">
  <div style="border-top:1px solid #000;width:260px;margin:0 auto;padding-top:4px">
    <strong>${esc(d.profissional)}</strong><br/>
    ${d.profissao ? esc(d.profissao) + '<br/>' : ''}${d.conselho ? esc(d.conselho) : ''}
  </div>
</div>`;
}

const DeclaracaoRapidaModal: React.FC<DeclaracaoRapidaProps> = ({ open, onOpenChange, paciente, profissional, unidade }) => {
  const nowHM = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  const [entrada, setEntrada] = useState('');
  const [saida, setSaida] = useState('');
  const [finalidade, setFinalidade] = useState('Consulta');
  const [detalhe, setDetalhe] = useState('');
  const [acompanhante, setAcompanhante] = useState('');
  const [exibirCid, setExibirCid] = useState(false);
  const [imprimindo, setImprimindo] = useState(false);

  useEffect(() => {
    if (open) { const h = nowHM(); setEntrada(h); setSaida(h); setFinalidade('Consulta'); setDetalhe(''); setAcompanhante(''); setExibirCid(false); }
  }, [open]);

  const imprimir = async () => {
    if (!paciente?.nome) { toast.error('Paciente não identificado.'); return; }
    if (!entrada || !saida) { toast.error('Informe os horários de entrada e saída.'); return; }
    if (finalidade === 'Outro' && !detalhe.trim()) { toast.error('Descreva o motivo.'); return; }
    setImprimindo(true);
    try {
      const agora = new Date();
      const conselho = profissional?.tipo_conselho && profissional?.numero_conselho
        ? `${profissional.tipo_conselho} ${profissional.numero_conselho}${profissional.uf_conselho ? '/' + profissional.uf_conselho : ''}` : '';
      const html = buildDeclaracaoRapidaHtml({
        paciente: paciente.nome, cpf: paciente.cpf, cns: paciente.cns, unidade: unidade || 'CER II Oriximiná',
        data: agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        entrada, saida, finalidade, detalhe: detalhe.trim(), acompanhante: acompanhante.trim(),
        cid: exibirCid ? paciente.cid : '', profissional: profissional?.nome || '', conselho, profissao: profissional?.profissao,
        dataExtenso: agora.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }),
      });
      await openPrintDocument('Declaração de Comparecimento', html);
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error('Não foi possível imprimir a declaração.');
    } finally { setImprimindo(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Declaração de Comparecimento Rápida</DialogTitle>
          <DialogDescription>{paciente?.nome || 'Paciente'} — imprime direto, sem abrir o editor.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Entrada</Label><Input type="time" value={entrada} onChange={e => setEntrada(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Saída</Label><Input type="time" value={saida} onChange={e => setSaida(e.target.value)} /></div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Motivo / Finalidade</Label>
            <div className="flex flex-wrap gap-1.5">
              {FINALIDADES.map(f => (
                <Button key={f} type="button" size="sm" variant={finalidade === f ? 'default' : 'outline'} onClick={() => setFinalidade(f)}>{f}</Button>
              ))}
            </div>
            <Input placeholder={finalidade === 'Outro' ? 'Descreva o motivo *' : 'Detalhe (opcional), ex.: Fisioterapia Motora'} value={detalhe} onChange={e => setDetalhe(e.target.value)} />
          </div>
          <div className="space-y-1"><Label className="text-xs">Acompanhante (opcional)</Label><Input value={acompanhante} onChange={e => setAcompanhante(e.target.value)} placeholder="Nome do responsável" /></div>
          {paciente?.cid && (
            <div className="flex items-center gap-2">
              <Checkbox id="decl-cid" checked={exibirCid} onCheckedChange={v => setExibirCid(!!v)} />
              <Label htmlFor="decl-cid" className="text-xs">Incluir CID ({paciente.cid})</Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={imprimir} disabled={imprimindo} className="gap-1.5"><Printer className="w-4 h-4" />Imprimir Declaração</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeclaracaoRapidaModal;
