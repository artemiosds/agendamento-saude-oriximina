import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { FileText, Printer, Save, ShieldCheck, Plus, Trash2, Loader2 } from 'lucide-react';
import { openPrintDocument, loadDocumentConfig, docHeader, docFooter, buildInstitutionalCSS, type DocumentConfig } from '@/lib/printLayout';
import { salvarEncaminhamento } from '@/services/encaminhamentoService';
import { generateSignature, formatSignatureBlock, formatCarimboBlock, type CarimboData, type SignatureData } from '@/lib/documentSignature';
import type { DocumentTemplate } from '@/components/ModelosDocumentos';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paciente?: { id?: string; nome: string; cpf: string; cns: string; data_nascimento: string; cid: string; especialidade_destino: string };
  profissional?: { id?: string; nome: string; profissao: string; numero_conselho: string; tipo_conselho: string; uf_conselho: string };
  unidade?: string;
  dataAtendimento?: string;
}

const ENCAMINHAMENTO_TIPOS = ['encaminhamento', 'guia de encaminhamento'];

interface MedicamentoRow {
  medicamento: string;
  dosagem: string;
  via: string;
  frequencia: string;
  duracao: string;
  observacao: string;
}

const emptyMedicamento = (): MedicamentoRow => ({
  medicamento: '', dosagem: '', via: 'oral', frequencia: '', duracao: '', observacao: ''
});

const GerarDocumentoModal: React.FC<Props> = ({ open, onOpenChange, paciente, profissional, unidade, dataAtendimento }) => {
  const { user } = useAuth();
  const { funcionarios } = useData();
  const [docConfig, setDocConfig] = useState<DocumentConfig | null>(null);
  const [modelos, setModelos] = useState<DocumentTemplate[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [conteudoFinal, setConteudoFinal] = useState('');
  const [profDestinoId, setProfDestinoId] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [carimbo, setCarimbo] = useState<CarimboData | null>(null);

  // Type-specific fields
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [medicamentos, setMedicamentos] = useState<MedicamentoRow[]>([emptyMedicamento()]);
  const [exibirCid, setExibirCid] = useState(false);

  useEffect(() => {
    if (open) {
      loadModelos();
      loadCarimbo();
      loadDocConfig();
      resetFields();
    }
  }, [open]);

  const loadDocConfig = async () => {
    const cfg = await loadDocumentConfig();
    setDocConfig(cfg);
  };

  const resetFields = () => {
    setSelectedId('');
    setConteudoFinal('');
    setProfDestinoId('');
    setCampos({});
    setMedicamentos([emptyMedicamento()]);
    setExibirCid(false);
  };

  const loadModelos = async () => {
    try {
      const { data, error } = await supabase
        .from('document_templates')
        .select('*')
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      const all = (data || []) as unknown as DocumentTemplate[];
      setModelos(all.filter(m => m.perfis_permitidos.includes(user?.role || '')));
    } catch (e) { console.error(e); }
  };

  const loadCarimbo = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('profissionais_carimbo')
      .select('*')
      .eq('profissional_id', user.id)
      .maybeSingle();
    if (data) setCarimbo(data as unknown as CarimboData);
  };

  const hoje = new Date().toLocaleDateString('pt-BR');

  const substituir = (conteudo: string): string => {
    let text = conteudo
      .replace(/\{\{nome_paciente\}\}/g, paciente?.nome || '—')
      .replace(/\{\{cpf\}\}/g, paciente?.cpf || '—')
      .replace(/\{\{cns\}\}/g, paciente?.cns || '—')
      .replace(/\{\{data_nascimento\}\}/g, paciente?.data_nascimento || '—')
      .replace(/\{\{data_atendimento\}\}/g, dataAtendimento || hoje)
      .replace(/\{\{profissional\}\}/g, profissional?.nome || '—')
      .replace(/\{\{cid\}\}/g, paciente?.cid || '—')
      .replace(/\{\{especialidade\}\}/g, paciente?.especialidade_destino || '—')
      .replace(/\{\{unidade\}\}/g, unidade || 'CER II Oriximiná')
      .replace(/\{\{data_hoje\}\}/g, hoje);

    // Extended variables from campos
    Object.entries(campos).forEach(([k, v]) => {
      text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v || '—');
    });

    // Medicamentos
    if (medicamentos.length > 0 && medicamentos[0].medicamento) {
      const medList = medicamentos
        .filter(m => m.medicamento)
        .map((m, i) => `${i + 1}. ${m.medicamento} — ${m.dosagem}, ${m.via}, ${m.frequencia}, ${m.duracao}${m.observacao ? ` (${m.observacao})` : ''}`)
        .join('\n');
      text = text.replace(/\{\{medicamentos\}\}/g, medList);
    }

    return text;
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setProfDestinoId('');
    setCampos({});
    setMedicamentos([emptyMedicamento()]);
    const m = modelos.find(x => x.id === id);
    if (m) {
      // Pre-fill type-specific defaults
      const tipo = m.tipo.toLowerCase();
      const defaults: Record<string, string> = {};
      if (tipo.includes('atestado')) {
        defaults.dias_afastamento = '1';
        defaults.data_inicio = new Date().toISOString().split('T')[0];
      }
      if (tipo.includes('receitu')) {
        defaults.validade_receita = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
      }
      if (tipo.includes('declaraç') || tipo.includes('comparecimento')) {
        const now = new Date();
        defaults.hora_entrada = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      }
      defaults.motivo = '';
      defaults.observacoes = '';
      defaults.especialidade_destino = paciente?.especialidade_destino || '';
      defaults.unidade_destino = '';
      defaults.profissional_destino = '';
      defaults.prioridade = 'eletivo';
      setCampos(defaults);
      setConteudoFinal(substituir(m.conteudo));
    }
  };

  // Update conteudo when campos change
  useEffect(() => {
    const m = modelos.find(x => x.id === selectedId);
    if (m) setConteudoFinal(substituir(m.conteudo));
  }, [campos, medicamentos]);

  const selected = modelos.find(x => x.id === selectedId);
  const isEncaminhamento = selected && ENCAMINHAMENTO_TIPOS.includes(selected.tipo.toLowerCase());
  const tipoLower = selected?.tipo.toLowerCase() || '';

  const buildHtmlBody = (signatureHtml: string) => {
    // Content may already be rich HTML from TipTap or plain text
    const html = conteudoFinal.includes('<') ? conteudoFinal : conteudoFinal.replace(/\n/g, '<br/>');
    const carimboHtml = formatCarimboBlock(carimbo);
    return `
      <div class="content-block" style="margin-top:20px;">
        <div style="font-family:'Georgia','Times New Roman',serif;font-size:13px;line-height:1.8;">${html}</div>
      </div>
      <div class="doc-sign-footer">
        <div class="sign-block">${signatureHtml}</div>
        <div class="carimbo-block">${carimboHtml}</div>
      </div>
    `;
  };

  const handleSaveDraft = async () => {
    if (!selected) return;
    setSalvando(true);
    try {
      const body = buildHtmlBody('');
      await supabase.from('documentos_gerados').insert({
        paciente_id: paciente?.id || '',
        paciente_nome: paciente?.nome || '',
        profissional_id: profissional?.id || user?.id || '',
        profissional_nome: profissional?.nome || user?.nome || '',
        tipo_documento: selected.tipo,
        conteudo_original: conteudoFinal,
        conteudo_html: body,
        campos_formulario: { ...campos, medicamentos } as any,
        modelo_id: selected.id,
        unidade_id: unidade || '',
        status: 'rascunho',
      });
      toast.success('📝 Rascunho salvo!');
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    }
    setSalvando(false);
  };

  const handleSignAndFinalize = async () => {
    if (!selected) return;
    setSalvando(true);

    try {
      // Generate signature
      const sig = await generateSignature(
        conteudoFinal,
        profissional?.id || user?.id || '',
        profissional?.nome || user?.nome || '',
        profissional?.tipo_conselho || carimbo?.conselho || '',
        profissional?.numero_conselho || carimbo?.numero_registro || '',
        profissional?.uf_conselho || carimbo?.uf || ''
      );

      const signatureHtml = formatSignatureBlock(sig);
      const body = buildHtmlBody(signatureHtml);

      // Save encaminhamento if needed
      if (isEncaminhamento && profDestinoId) {
        const conselho = profissional ? `${profissional.tipo_conselho} ${profissional.numero_conselho}/${profissional.uf_conselho}` : '';
        const result = await salvarEncaminhamento({
          paciente_id: paciente?.id || '',
          paciente_nome: paciente?.nome || '',
          paciente_cpf: paciente?.cpf || '',
          paciente_cns: paciente?.cns || '',
          paciente_data_nascimento: paciente?.data_nascimento || '',
          paciente_cid: paciente?.cid || '',
          paciente_especialidade_destino: campos.especialidade_destino || paciente?.especialidade_destino || '',
          profissional_origem_id: profissional?.id || user?.id || '',
          profissional_origem_nome: profissional?.nome || user?.nome || '',
          profissional_origem_profissao: profissional?.profissao || '',
          profissional_origem_conselho: conselho,
          profissional_destino_id: profDestinoId,
          especialidade_destino: campos.especialidade_destino || paciente?.especialidade_destino || '',
          conteudo_documento: conteudoFinal,
          observacao: campos.observacoes || '',
          gerado_por: user?.nome || '',
          gerado_por_perfil: user?.role || '',
          unidade: unidade || 'CER II Oriximiná',
          tipo_documento: selected.tipo,
        });
        if (!result.success) {
          toast.error('Erro ao salvar encaminhamento: ' + (result.error || ''));
          setSalvando(false);
          return;
        }
      }

      // Save to documentos_gerados
      await supabase.from('documentos_gerados').insert({
        paciente_id: paciente?.id || '',
        paciente_nome: paciente?.nome || '',
        profissional_id: profissional?.id || user?.id || '',
        profissional_nome: profissional?.nome || user?.nome || '',
        tipo_documento: selected.tipo,
        conteudo_original: conteudoFinal,
        conteudo_html: body,
        campos_formulario: { ...campos, medicamentos } as any,
        hash_assinatura: sig.hash,
        ip_assinatura: sig.ip,
        assinado_em: sig.timestamp,
        modelo_id: selected.id,
        unidade_id: unidade || '',
        status: 'assinado',
      });

      // Print
      openPrintDocument(selected.tipo, body, {
        'Paciente': paciente?.nome || '',
        'CPF': paciente?.cpf || '',
        'Data': hoje,
      });

      toast.success('✅ Documento assinado e finalizado!');
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    }
    setSalvando(false);
  };

  const updateCampo = (key: string, value: string) => setCampos(prev => ({ ...prev, [key]: value }));

  // Auto-calculate data_fim for atestado
  useEffect(() => {
    if (campos.dias_afastamento && campos.data_inicio) {
      const start = new Date(campos.data_inicio);
      start.setDate(start.getDate() + parseInt(campos.dias_afastamento || '0'));
      updateCampo('data_fim', start.toISOString().split('T')[0]);
    }
  }, [campos.dias_afastamento, campos.data_inicio]);

  const addMedicamento = () => setMedicamentos(prev => [...prev, emptyMedicamento()]);
  const removeMedicamento = (i: number) => setMedicamentos(prev => prev.filter((_, idx) => idx !== i));
  const updateMedicamento = (i: number, field: keyof MedicamentoRow, value: string) => {
    setMedicamentos(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m));
  };

  const profissionaisDestino = funcionarios.filter(f => f.ativo && f.role === 'profissional' && f.id !== (profissional?.id || user?.id));

  const renderTypeSpecificFields = () => {
    if (!selected) return null;

    // ENCAMINHAMENTO
    if (tipoLower.includes('encaminhamento')) {
      return (
        <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
          <h4 className="font-semibold text-xs uppercase text-primary">Campos do Encaminhamento</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Especialidade destino *" value={campos.especialidade_destino} onChange={v => updateCampo('especialidade_destino', v)} />
            <Field label="Unidade destino" value={campos.unidade_destino} onChange={v => updateCampo('unidade_destino', v)} />
            <Field label="Profissional destino" value={campos.profissional_destino} onChange={v => updateCampo('profissional_destino', v)} />
            <Field label="CID relacionado" value={campos.cid || paciente?.cid || ''} onChange={v => updateCampo('cid', v)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Prioridade</Label>
            <RadioGroup value={campos.prioridade || 'eletivo'} onValueChange={v => updateCampo('prioridade', v)} className="flex gap-4">
              {['eletivo', 'prioritário', 'urgência'].map(p => (
                <div key={p} className="flex items-center gap-1.5">
                  <RadioGroupItem value={p} id={`pri-${p}`} />
                  <Label htmlFor={`pri-${p}`} className="text-xs capitalize">{p}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          <FieldArea label="Motivo do encaminhamento *" value={campos.motivo} onChange={v => updateCampo('motivo', v)} />
          <FieldArea label="Observações clínicas relevantes" value={campos.observacoes} onChange={v => updateCampo('observacoes', v)} />
        </div>
      );
    }

    // ATESTADO
    if (tipoLower.includes('atestado')) {
      return (
        <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
          <h4 className="font-semibold text-xs uppercase text-primary">Campos do Atestado</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Dias de afastamento" value={campos.dias_afastamento} onChange={v => updateCampo('dias_afastamento', v)} type="number" />
            <Field label="Data início" value={campos.data_inicio} onChange={v => updateCampo('data_inicio', v)} type="date" />
            <Field label="Data fim (auto)" value={campos.data_fim} onChange={v => updateCampo('data_fim', v)} type="date" disabled />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={exibirCid} onCheckedChange={v => setExibirCid(!!v)} id="exibir-cid" />
            <Label htmlFor="exibir-cid" className="text-xs">Exibir CID no documento</Label>
          </div>
          {exibirCid && <Field label="CID" value={campos.cid || paciente?.cid || ''} onChange={v => updateCampo('cid', v)} />}
          <FieldArea label="Motivo" value={campos.motivo} onChange={v => updateCampo('motivo', v)} />
          <FieldArea label="Observações" value={campos.observacoes} onChange={v => updateCampo('observacoes', v)} />
        </div>
      );
    }

    // DECLARAÇÃO DE COMPARECIMENTO
    if (tipoLower.includes('declaraç') || tipoLower.includes('comparecimento')) {
      return (
        <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
          <h4 className="font-semibold text-xs uppercase text-primary">Campos da Declaração</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Horário de entrada" value={campos.hora_entrada} onChange={v => updateCampo('hora_entrada', v)} type="time" />
            <Field label="Horário de saída" value={campos.hora_saida} onChange={v => updateCampo('hora_saida', v)} type="time" />
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Finalidade</Label>
              <Select value={campos.finalidade || 'consulta'} onValueChange={v => updateCampo('finalidade', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['consulta', 'exame', 'procedimento', 'outro'].map(f => (
                    <SelectItem key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      );
    }

    // RECEITUÁRIO
    if (tipoLower.includes('receitu') || tipoLower.includes('receita') || tipoLower.includes('prescriç')) {
      return (
        <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
          <h4 className="font-semibold text-xs uppercase text-primary">Receituário</h4>
          {medicamentos.map((med, i) => (
            <div key={i} className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end border-b pb-2">
              <div className="space-y-1"><Label className="text-[10px]">Medicamento</Label><Input value={med.medicamento} onChange={e => updateMedicamento(i, 'medicamento', e.target.value)} className="h-8 text-xs" /></div>
              <div className="space-y-1"><Label className="text-[10px]">Dosagem</Label><Input value={med.dosagem} onChange={e => updateMedicamento(i, 'dosagem', e.target.value)} className="h-8 text-xs" /></div>
              <div className="space-y-1"><Label className="text-[10px]">Via</Label><Input value={med.via} onChange={e => updateMedicamento(i, 'via', e.target.value)} className="h-8 text-xs" /></div>
              <div className="space-y-1"><Label className="text-[10px]">Frequência</Label><Input value={med.frequencia} onChange={e => updateMedicamento(i, 'frequencia', e.target.value)} className="h-8 text-xs" /></div>
              <div className="space-y-1"><Label className="text-[10px]">Duração</Label><Input value={med.duracao} onChange={e => updateMedicamento(i, 'duracao', e.target.value)} className="h-8 text-xs" /></div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeMedicamento(i)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addMedicamento} className="gap-1"><Plus className="w-3.5 h-3.5" /> Adicionar medicamento</Button>
          <FieldArea label="Orientações gerais" value={campos.orientacoes} onChange={v => updateCampo('orientacoes', v)} />
          <Field label="Validade da receita" value={campos.validade_receita} onChange={v => updateCampo('validade_receita', v)} type="date" />
        </div>
      );
    }

    // LAUDO TÉCNICO/CLÍNICO
    if (tipoLower.includes('laudo')) {
      return (
        <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
          <h4 className="font-semibold text-xs uppercase text-primary">Campos do Laudo</h4>
          <FieldArea label="Objetivo do laudo" value={campos.objetivo} onChange={v => updateCampo('objetivo', v)} />
          <FieldArea label="Histórico relevante" value={campos.historico} onChange={v => updateCampo('historico', v)} />
          <FieldArea label="Exame físico / avaliação" value={campos.exame_fisico} onChange={v => updateCampo('exame_fisico', v)} />
          <FieldArea label="Conclusão / parecer" value={campos.conclusao} onChange={v => updateCampo('conclusao', v)} />
          <FieldArea label="Recomendações" value={campos.recomendacoes} onChange={v => updateCampo('recomendacoes', v)} />
          <Field label="CID" value={campos.cid || paciente?.cid || ''} onChange={v => updateCampo('cid', v)} />
        </div>
      );
    }

    // RELATÓRIO DE EVOLUÇÃO
    if (tipoLower.includes('evoluç') || tipoLower.includes('relatório')) {
      return (
        <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
          <h4 className="font-semibold text-xs uppercase text-primary">Campos do Relatório</h4>
          <Field label="Data da evolução" value={campos.data_evolucao || new Date().toISOString().split('T')[0]} onChange={v => updateCampo('data_evolucao', v)} type="date" />
          <FieldArea label="Queixa principal" value={campos.queixa_principal} onChange={v => updateCampo('queixa_principal', v)} />
          <FieldArea label="Evolução clínica" value={campos.evolucao_clinica} onChange={v => updateCampo('evolucao_clinica', v)} />
          <FieldArea label="Conduta realizada" value={campos.conduta} onChange={v => updateCampo('conduta', v)} />
          <FieldArea label="Plano terapêutico" value={campos.plano} onChange={v => updateCampo('plano', v)} />
          <Field label="Próximo atendimento" value={campos.proximo_atendimento} onChange={v => updateCampo('proximo_atendimento', v)} type="date" />
        </div>
      );
    }

    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" /> Gerar Documento Clínico
          </DialogTitle>
          <DialogDescription>
            {paciente?.nome ? `Paciente: ${paciente.nome}` : 'Selecione um modelo e preencha os campos'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Model selector */}
          <div className="space-y-1.5">
            <Label className="text-[13px] font-bold">Selecionar modelo</Label>
            {modelos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum modelo disponível para seu perfil.</p>
            ) : (
              <Select value={selectedId} onValueChange={handleSelect}>
                <SelectTrigger><SelectValue placeholder="Escolha um modelo..." /></SelectTrigger>
                <SelectContent>
                  {modelos.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.nome} — {m.tipo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selected && (
            <>
              {/* Type badge */}
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{selected.tipo}</Badge>
                {paciente?.nome && <span className="text-sm font-medium">{paciente.nome}</span>}
              </div>

              {/* Encaminhamento destination */}
              {isEncaminhamento && (
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-bold">Profissional destino (fila interna)</Label>
                  <Select value={profDestinoId} onValueChange={setProfDestinoId}>
                    <SelectTrigger><SelectValue placeholder="Selecione o profissional destino..." /></SelectTrigger>
                    <SelectContent>
                      {profissionaisDestino.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.nome} — {p.profissao}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Type-specific fields */}
              {renderTypeSpecificFields()}

              <Separator />

              {/* Editable content */}
              <div className="space-y-1.5">
                <Label className="text-[13px] font-bold">Conteúdo do documento (editável)</Label>
                <Textarea
                  value={conteudoFinal}
                  onChange={e => setConteudoFinal(e.target.value)}
                  className="min-h-[180px] text-sm font-serif"
                />
              </div>

              {/* Preview */}
              <div className="space-y-1.5">
                <Label className="text-[13px] font-bold">Preview</Label>
                <div className="border rounded-lg bg-white max-h-[400px] overflow-y-auto">
                  {docConfig && (
                    <div
                      dangerouslySetInnerHTML={{
                        __html: buildInstitutionalCSS() + docHeader(selected.tipo, docConfig) +
                          '<div class="doc-content" style="padding:0 20px;">' +
                          conteudoFinal.replace(/\n/g, '<br/>') +
                          '</div>' + docFooter(docConfig)
                      }}
                    />
                  )}
                  {!docConfig && (
                    <div className="p-5 text-center text-muted-foreground text-sm">Carregando preview...</div>
                  )}

                  {/* Carimbo preview */}
                  {carimbo && (
                    <div className="mt-6 text-right">
                      {carimbo.tipo === 'digital' ? (
                        <div className="inline-block border border-foreground rounded-md px-4 py-2 text-center text-xs">
                          <div className="font-bold text-sm">{carimbo.nome}</div>
                          <div>{carimbo.conselho} / {carimbo.numero_registro}-{carimbo.uf}</div>
                          <div>{carimbo.especialidade}</div>
                        </div>
                      ) : carimbo.imagem_url ? (
                        <img src={carimbo.imagem_url} alt="Carimbo" className="inline-block max-w-[200px] max-h-[80px]" />
                      ) : null}
                    </div>
                  )}

                  {/* Signature preview placeholder */}
                  <div className="mt-4 border border-dashed border-muted-foreground/30 rounded p-3 text-center text-xs text-muted-foreground">
                    <ShieldCheck className="w-4 h-4 mx-auto mb-1" />
                    Bloco de assinatura eletrônica será inserido ao assinar
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          {selected && (
            <>
              <Button variant="secondary" onClick={handleSaveDraft} disabled={salvando} className="gap-1.5">
                <Save className="w-4 h-4" /> Salvar Rascunho
              </Button>
              <Button
                onClick={handleSignAndFinalize}
                disabled={salvando || (isEncaminhamento && !profDestinoId)}
                className="gap-1.5"
              >
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                Assinar e Finalizar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Helper components
type FieldProps = {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  type?: string;
  disabled?: boolean;
};

const Field = React.forwardRef<HTMLInputElement, FieldProps>(({ label, value, onChange, type = 'text', disabled }, ref) => (
  <div className="space-y-1">
    <Label className="text-xs font-semibold">{label}</Label>
    <Input
      ref={ref}
      type={type}
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      className="h-8 text-xs"
      disabled={disabled}
    />
  </div>
));

Field.displayName = 'Field';

type FieldAreaProps = {
  label: string;
  value?: string;
  onChange: (v: string) => void;
};

const FieldArea = React.forwardRef<HTMLTextAreaElement, FieldAreaProps>(({ label, value, onChange }, ref) => (
  <div className="space-y-1">
    <Label className="text-xs font-semibold">{label}</Label>
    <Textarea ref={ref} value={value || ''} onChange={e => onChange(e.target.value)} className="min-h-[60px] text-xs" />
  </div>
));

FieldArea.displayName = 'FieldArea';

export default GerarDocumentoModal;
