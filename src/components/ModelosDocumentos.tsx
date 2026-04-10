import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { FileText, Plus, Pencil, Trash2, Eye, Copy, Loader2, Printer } from 'lucide-react';
import { openPrintDocument } from '@/lib/printLayout';

export interface TemplateVersion {
  conteudo: string;
  salvo_em: string;
  salvo_por?: string;
}

export interface DocumentTemplate {
  id: string;
  nome: string;
  tipo: string;
  conteudo: string;
  ativo: boolean;
  perfis_permitidos: string[];
  criado_em: string;
  atualizado_em: string;
  versoes?: TemplateVersion[];
}

const TIPOS_DOCUMENTO = [
  'Atestado Médico',
  'Declaração de Comparecimento',
  'Encaminhamento',
  'Receituário',
  'Laudo Clínico',
  'Relatório de Evolução',
];

const PERFIS = [
  { value: 'master', label: 'Master' },
  { value: 'gestao', label: 'Gestão' },
  { value: 'profissional', label: 'Profissional' },
  { value: 'enfermagem', label: 'Enfermagem' },
  { value: 'recepcao', label: 'Recepção' },
  { value: 'triagem', label: 'Triagem' },
];

const VARIAVEIS = [
  { tag: '{{nome_paciente}}', desc: 'Nome do paciente' },
  { tag: '{{cpf}}', desc: 'CPF' },
  { tag: '{{cns}}', desc: 'CNS' },
  { tag: '{{data_nascimento}}', desc: 'Data de nascimento' },
  { tag: '{{data_atendimento}}', desc: 'Data do atendimento' },
  { tag: '{{profissional}}', desc: 'Nome do profissional' },
  { tag: '{{cid}}', desc: 'CID' },
  { tag: '{{especialidade}}', desc: 'Especialidade' },
  { tag: '{{unidade}}', desc: 'Unidade de saúde' },
  { tag: '{{data_hoje}}', desc: 'Data de hoje' },
  { tag: '{{dias_afastamento}}', desc: 'Dias de afastamento' },
  { tag: '{{data_inicio}}', desc: 'Data início afastamento' },
  { tag: '{{data_fim}}', desc: 'Data fim afastamento' },
  { tag: '{{hora_entrada}}', desc: 'Horário de entrada' },
  { tag: '{{hora_saida}}', desc: 'Horário de saída' },
  { tag: '{{medicamentos}}', desc: 'Lista de medicamentos' },
  { tag: '{{especialidade_destino}}', desc: 'Especialidade destino' },
  { tag: '{{unidade_destino}}', desc: 'Unidade destino' },
  { tag: '{{motivo}}', desc: 'Motivo' },
  { tag: '{{observacoes}}', desc: 'Observações' },
  { tag: '{{prioridade}}', desc: 'Prioridade' },
  { tag: '{{validade_receita}}', desc: 'Validade da receita' },
  { tag: '{{objetivo}}', desc: 'Objetivo do laudo' },
  { tag: '{{historico}}', desc: 'Histórico relevante' },
  { tag: '{{exame_fisico}}', desc: 'Exame físico' },
  { tag: '{{conclusao}}', desc: 'Conclusão/parecer' },
  { tag: '{{recomendacoes}}', desc: 'Recomendações' },
  { tag: '{{queixa_principal}}', desc: 'Queixa principal' },
  { tag: '{{evolucao_clinica}}', desc: 'Evolução clínica' },
  { tag: '{{conduta}}', desc: 'Conduta realizada' },
  { tag: '{{plano}}', desc: 'Plano terapêutico' },
  { tag: '{{orientacoes}}', desc: 'Orientações gerais' },
  { tag: '{{finalidade}}', desc: 'Finalidade comparecimento' },
];

const defaultTemplate = (): DocumentTemplate => ({
  id: crypto.randomUUID(),
  nome: '',
  tipo: TIPOS_DOCUMENTO[0],
  conteudo: '',
  ativo: true,
  perfis_permitidos: ['master', 'profissional'],
  criado_em: new Date().toISOString(),
  atualizado_em: new Date().toISOString(),
  versoes: [],
});

const ModelosDocumentos: React.FC = () => {
  const [modelos, setModelos] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [current, setCurrent] = useState<DocumentTemplate | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');

  useEffect(() => { loadModelos(); }, []);

  const loadModelos = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('system_config')
        .select('configuracoes')
        .eq('id', 'modelos_documentos')
        .maybeSingle();
      if (data?.configuracoes) {
        const cfg = data.configuracoes as any;
        setModelos(Array.isArray(cfg) ? cfg : (cfg.modelos || []));
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const saveModelos = async (updated: DocumentTemplate[]) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('system_config')
        .upsert({ id: 'modelos_documentos', configuracoes: updated as any, updated_at: new Date().toISOString() });
      if (error) throw error;
      setModelos(updated);
      toast.success('Modelos salvos com sucesso!');
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + (e.message || ''));
    }
    setSaving(false);
  };

  const openNew = () => {
    setCurrent(defaultTemplate());
    setEditOpen(true);
  };

  const openEdit = (m: DocumentTemplate) => {
    setCurrent({ ...m });
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!current) return;
    if (!current.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    if (!current.conteudo.trim()) { toast.error('Conteúdo é obrigatório'); return; }
    const existing = modelos.findIndex(m => m.id === current.id);
    const updated = [...modelos];
    current.atualizado_em = new Date().toISOString();
    if (existing >= 0) {
      // Save version history (keep last 5)
      const oldModel = updated[existing];
      const versoes = [...(current.versoes || [])];
      if (oldModel.conteudo !== current.conteudo) {
        versoes.unshift({ conteudo: oldModel.conteudo, salvo_em: oldModel.atualizado_em });
        current.versoes = versoes.slice(0, 5);
      }
      updated[existing] = current;
    } else {
      current.versoes = [];
      updated.push(current);
    }
    await saveModelos(updated);
    setEditOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este modelo?')) return;
    const updated = modelos.filter(m => m.id !== id);
    await saveModelos(updated);
  };

  const handleToggle = async (id: string, ativo: boolean) => {
    const updated = modelos.map(m => m.id === id ? { ...m, ativo, atualizado_em: new Date().toISOString() } : m);
    await saveModelos(updated);
  };

  const handleDuplicate = (m: DocumentTemplate) => {
    setCurrent({ ...m, id: crypto.randomUUID(), nome: m.nome + ' (Cópia)', criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() });
    setEditOpen(true);
  };

  const substituirVariaveis = (conteudo: string): string => {
    const hoje = new Date().toLocaleDateString('pt-BR');
    return conteudo
      .replace(/\{\{nome_paciente\}\}/g, 'João da Silva')
      .replace(/\{\{cpf\}\}/g, '123.456.789-00')
      .replace(/\{\{cns\}\}/g, '123 4567 8901 2345')
      .replace(/\{\{data_nascimento\}\}/g, '01/01/1990')
      .replace(/\{\{data_atendimento\}\}/g, hoje)
      .replace(/\{\{profissional\}\}/g, 'Dr. Maria Santos')
      .replace(/\{\{cid\}\}/g, 'F84.0')
      .replace(/\{\{especialidade\}\}/g, 'Fisioterapia')
      .replace(/\{\{unidade\}\}/g, 'CER II Oriximiná')
      .replace(/\{\{data_hoje\}\}/g, hoje)
      .replace(/\{\{dias_afastamento\}\}/g, '3')
      .replace(/\{\{data_inicio\}\}/g, hoje)
      .replace(/\{\{data_fim\}\}/g, hoje)
      .replace(/\{\{hora_entrada\}\}/g, '08:00')
      .replace(/\{\{hora_saida\}\}/g, '09:30')
      .replace(/\{\{medicamentos\}\}/g, '1. Paracetamol 500mg — Oral, 8/8h, 5 dias')
      .replace(/\{\{especialidade_destino\}\}/g, 'Neurologia')
      .replace(/\{\{unidade_destino\}\}/g, 'Hospital Regional')
      .replace(/\{\{motivo\}\}/g, 'Avaliação complementar')
      .replace(/\{\{observacoes\}\}/g, 'Sem observações adicionais')
      .replace(/\{\{prioridade\}\}/g, 'Eletivo')
      .replace(/\{\{validade_receita\}\}/g, hoje)
      .replace(/\{\{objetivo\}\}/g, 'Avaliação funcional')
      .replace(/\{\{historico\}\}/g, 'Histórico relevante do paciente')
      .replace(/\{\{exame_fisico\}\}/g, 'Exame físico normal')
      .replace(/\{\{conclusao\}\}/g, 'Paciente apto')
      .replace(/\{\{recomendacoes\}\}/g, 'Manter acompanhamento')
      .replace(/\{\{queixa_principal\}\}/g, 'Dor lombar')
      .replace(/\{\{evolucao_clinica\}\}/g, 'Melhora progressiva')
      .replace(/\{\{conduta\}\}/g, 'Exercícios terapêuticos')
      .replace(/\{\{plano\}\}/g, 'Continuar tratamento semanal')
      .replace(/\{\{orientacoes\}\}/g, 'Tomar conforme prescrição')
      .replace(/\{\{finalidade\}\}/g, 'Consulta');
  };

  const handlePreview = (m: DocumentTemplate) => {
    const html = substituirVariaveis(m.conteudo).replace(/\n/g, '<br/>');
    setPreviewHtml(html);
    setPreviewOpen(true);
  };

  const handlePrintPreview = (m: DocumentTemplate) => {
    const html = substituirVariaveis(m.conteudo).replace(/\n/g, '<br/>');
    const body = `
      <div class="content-block" style="margin-top:20px;">
        <div style="font-size:14px;line-height:1.8;white-space:pre-wrap;">${html}</div>
      </div>
      <div class="signature">
        <div class="signature-line"></div>
        <div class="name">Dr. Maria Santos</div>
        <div class="role">Fisioterapia — CRF 12345/PA</div>
      </div>
    `;
    openPrintDocument(m.tipo, body, {
      'Paciente': 'João da Silva',
      'CPF': '123.456.789-00',
      'Data': new Date().toLocaleDateString('pt-BR'),
    });
  };

  const insertVariable = (tag: string) => {
    if (!current) return;
    setCurrent({ ...current, conteudo: current.conteudo + tag });
  };

  if (loading) {
    return (
      <Card className="shadow-card border-0">
        <CardContent className="p-5 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando modelos...
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="shadow-card border-0">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold font-display text-foreground">Modelos de Documentos Clínicos</h3>
                <p className="text-sm text-muted-foreground">Crie e gerencie modelos reutilizáveis de documentos</p>
              </div>
            </div>
            <Button onClick={openNew} size="sm" className="gap-1.5">
              <Plus className="w-4 h-4" /> Novo Modelo
            </Button>
          </div>

          {modelos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum modelo cadastrado.</p>
              <p className="text-xs">Clique em "Novo Modelo" para criar o primeiro.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {modelos.map(m => (
                <div
                  key={m.id}
                  className={`border rounded-lg p-4 transition-colors ${m.ativo ? 'bg-background' : 'bg-muted/40 opacity-70'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-sm truncate">{m.nome}</h4>
                        <Badge variant="outline" className="text-xs shrink-0">{m.tipo}</Badge>
                        {!m.ativo && <Badge variant="secondary" className="text-xs">Inativo</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.conteudo.slice(0, 120)}...</p>
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {m.perfis_permitidos.map(p => (
                          <Badge key={p} variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{p}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch checked={m.ativo} onCheckedChange={v => handleToggle(m.id, v)} />
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePreview(m)} title="Pré-visualizar">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePrintPreview(m)} title="Imprimir preview">
                        <Printer className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDuplicate(m)} title="Duplicar">
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(m)} title="Editar">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(m.id)} title="Excluir">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Editor Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {current && modelos.some(m => m.id === current.id) ? 'Editar Modelo' : 'Novo Modelo'}
            </DialogTitle>
          </DialogHeader>

          {current && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-bold">Nome do modelo</Label>
                  <Input
                    value={current.nome}
                    onChange={e => setCurrent({ ...current, nome: e.target.value })}
                    placeholder="Ex: Atestado padrão CER II"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-bold">Tipo de documento</Label>
                  <Select value={current.tipo} onValueChange={v => setCurrent({ ...current, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_DOCUMENTO.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Variáveis dinâmicas */}
              <div className="space-y-1.5">
                <Label className="text-[13px] font-bold">Variáveis dinâmicas</Label>
                <p className="text-xs text-muted-foreground">Clique para inserir no conteúdo. Serão substituídas pelos dados reais ao gerar o documento.</p>
                <div className="flex flex-wrap gap-1.5">
                  {VARIAVEIS.map(v => (
                    <Button
                      key={v.tag}
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 px-2 font-mono"
                      onClick={() => insertVariable(v.tag)}
                      title={v.desc}
                    >
                      {v.tag}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Conteúdo */}
              <div className="space-y-1.5">
                <Label className="text-[13px] font-bold">Conteúdo do documento</Label>
                <Textarea
                  value={current.conteudo}
                  onChange={e => setCurrent({ ...current, conteudo: e.target.value })}
                  placeholder="Atesto para os devidos fins que o(a) paciente {{nome_paciente}}, portador(a) do CPF {{cpf}}, compareceu nesta unidade de saúde..."
                  className="min-h-[200px] font-mono text-sm"
                />
              </div>

              {/* Perfis permitidos */}
              <div className="space-y-1.5">
                <Label className="text-[13px] font-bold">Perfis que podem usar este modelo</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PERFIS.map(p => (
                    <label key={p.value} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={current.perfis_permitidos.includes(p.value)}
                        onCheckedChange={checked => {
                          const perfis = checked
                            ? [...current.perfis_permitidos, p.value]
                            : current.perfis_permitidos.filter(x => x !== p.value);
                          setCurrent({ ...current, perfis_permitidos: perfis });
                        }}
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={current.ativo}
                  onCheckedChange={v => setCurrent({ ...current, ativo: v })}
                />
                <Label className="text-sm">Modelo ativo</Label>
              </div>

              {/* Version History */}
              {current.versoes && current.versoes.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-bold">Histórico de versões ({current.versoes.length})</Label>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {current.versoes.map((v, i) => (
                      <div key={i} className="flex items-center justify-between border rounded p-2 bg-muted/30 text-xs">
                        <div>
                          <span className="font-medium">Versão {current.versoes!.length - i}</span>
                          <span className="text-muted-foreground ml-2">{new Date(v.salvo_em).toLocaleString('pt-BR')}</span>
                          <p className="text-muted-foreground line-clamp-1 mt-0.5">{v.conteudo.slice(0, 80)}...</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 shrink-0"
                          onClick={() => {
                            if (confirm('Restaurar esta versão? O conteúdo atual será salvo no histórico.')) {
                              const versoes = [...(current.versoes || [])];
                              versoes.unshift({ conteudo: current.conteudo, salvo_em: current.atualizado_em });
                              setCurrent({
                                ...current,
                                conteudo: v.conteudo,
                                versoes: versoes.slice(0, 5),
                              });
                            }
                          }}
                        >
                          Restaurar
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Salvar Modelo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" /> Pré-visualização
            </DialogTitle>
          </DialogHeader>
          <div className="border rounded-lg p-6 bg-white text-foreground">
            <div className="text-center mb-4">
              <h3 className="font-bold text-sm uppercase text-primary">Secretaria Municipal de Saúde de Oriximiná</h3>
              <p className="text-xs text-muted-foreground">CER II — Sistema de Gestão em Saúde</p>
            </div>
            <Separator className="mb-4" />
            <div className="text-sm leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            <div className="mt-10 text-center">
              <div className="w-64 border-t border-foreground mx-auto mb-1" />
              <p className="text-xs font-semibold">Dr. Maria Santos</p>
              <p className="text-xs text-muted-foreground">Fisioterapia — CRF 12345/PA</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center">As variáveis foram substituídas por dados de exemplo.</p>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ModelosDocumentos;
