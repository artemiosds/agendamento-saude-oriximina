import React, { useEffect, useState, lazy, Suspense } from 'react';
import DOMPurify from 'dompurify';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { FileText, Plus, Pencil, Trash2, Eye, Copy, Loader2, Printer, Search, Globe, Building2, UserIcon, Filter } from 'lucide-react';
import { openPrintDocument } from '@/lib/printLayout';

const RichTextEditor = lazy(() => import('@/components/editor/RichTextEditor'));

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
  tipo_modelo: 'GLOBAL' | 'UNIDADE' | 'PROFISSIONAL';
  unidade_id: string;
  criado_por: string;
  criado_por_nome: string;
  versoes: TemplateVersion[];
  blocos_clinicos: any[];
  created_at: string;
  updated_at: string;
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

const TIPO_MODELO_LABELS = {
  GLOBAL: { label: 'Global', icon: Globe, color: 'text-blue-600' },
  UNIDADE: { label: 'Unidade', icon: Building2, color: 'text-green-600' },
  PROFISSIONAL: { label: 'Pessoal', icon: UserIcon, color: 'text-orange-600' },
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

const ModelosDocumentos: React.FC = () => {
  const { user, isGlobalAdmin } = useAuth();
  const [modelos, setModelos] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [current, setCurrent] = useState<DocumentTemplate | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState('todos');
  const [filterTipoModelo, setFilterTipoModelo] = useState('todos');

  useEffect(() => { loadModelos(); }, []);

  const loadModelos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('document_templates')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setModelos((data || []) as unknown as DocumentTemplate[]);
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao carregar modelos');
    }
    setLoading(false);
  };

  const openNew = () => {
    setCurrent({
      id: '',
      nome: '',
      tipo: TIPOS_DOCUMENTO[0],
      conteudo: '',
      ativo: true,
      perfis_permitidos: ['master', 'profissional'],
      tipo_modelo: user?.role === 'master' || isGlobalAdmin ? 'UNIDADE' : 'PROFISSIONAL',
      unidade_id: user?.unidadeId || '',
      criado_por: user?.id || '',
      criado_por_nome: user?.nome || '',
      versoes: [],
      blocos_clinicos: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    setEditOpen(true);
  };

  const openEdit = (m: DocumentTemplate) => {
    setCurrent({ ...m, versoes: m.versoes || [] });
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!current) return;
    if (!current.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    if (!current.conteudo.trim()) { toast.error('Conteúdo é obrigatório'); return; }
    setSaving(true);
    try {
      const isNew = !current.id || !modelos.some(m => m.id === current.id);
      const payload = {
        nome: current.nome,
        tipo: current.tipo,
        conteudo: current.conteudo,
        ativo: current.ativo,
        perfis_permitidos: current.perfis_permitidos,
        tipo_modelo: isGlobalAdmin && current.tipo_modelo === 'GLOBAL' ? 'GLOBAL' : current.tipo_modelo,
        unidade_id: current.tipo_modelo === 'GLOBAL' ? '' : (current.unidade_id || user?.unidadeId || ''),
        criado_por: current.criado_por || user?.id || '',
        criado_por_nome: current.criado_por_nome || user?.nome || '',
        versoes: current.versoes as any,
        blocos_clinicos: current.blocos_clinicos as any,
      };

      if (isNew) {
        const { error } = await supabase.from('document_templates').insert(payload);
        if (error) throw error;
      } else {
        // Version history
        const old = modelos.find(m => m.id === current.id);
        if (old && old.conteudo !== current.conteudo) {
          const versoes = [...(current.versoes || [])];
          versoes.unshift({ conteudo: old.conteudo, salvo_em: old.updated_at });
          payload.versoes = versoes.slice(0, 5) as any;
        }
        const { error } = await supabase.from('document_templates').update(payload).eq('id', current.id);
        if (error) throw error;
      }
      toast.success('Modelo salvo!');
      setEditOpen(false);
      loadModelos();
    } catch (e: any) {
      toast.error('Erro: ' + (e.message || ''));
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este modelo?')) return;
    const { error } = await supabase.from('document_templates').delete().eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Modelo excluído');
    loadModelos();
  };

  const handleToggle = async (id: string, ativo: boolean) => {
    await supabase.from('document_templates').update({ ativo }).eq('id', id);
    loadModelos();
  };

  const handleDuplicate = (m: DocumentTemplate) => {
    setCurrent({
      ...m,
      id: '',
      nome: m.nome + ' (Cópia)',
      criado_por: user?.id || '',
      criado_por_nome: user?.nome || '',
      tipo_modelo: 'PROFISSIONAL',
      versoes: [],
    });
    setEditOpen(true);
  };

  const handlePreview = (m: DocumentTemplate) => {
    setPreviewHtml(substituirVariaveis(m.conteudo));
    setPreviewOpen(true);
  };

  const handlePrintPreview = (m: DocumentTemplate) => {
    const html = substituirVariaveis(m.conteudo);
    const body = `
      <div class="content-block" style="margin-top:20px;">
        <div style="font-size:14px;line-height:1.8;">${html}</div>
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

  const canEdit = (m: DocumentTemplate) => {
    if (isGlobalAdmin) return true;
    if (user?.role === 'master') return m.tipo_modelo !== 'GLOBAL';
    return m.criado_por === user?.id;
  };

  // Filters
  const filtered = modelos.filter(m => {
    if (search && !m.nome.toLowerCase().includes(search.toLowerCase()) && !m.tipo.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterTipo !== 'todos' && m.tipo !== filterTipo) return false;
    if (filterTipoModelo !== 'todos' && m.tipo_modelo !== filterTipoModelo) return false;
    return true;
  });

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
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold font-display text-foreground">Modelos de Documentos Clínicos</h3>
                <p className="text-sm text-muted-foreground">{modelos.length} modelo(s) disponível(is)</p>
              </div>
            </div>
            <Button onClick={openNew} size="sm" className="gap-1.5">
              <Plus className="w-4 h-4" /> Novo Modelo
            </Button>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar modelo..."
                className="pl-8 h-9"
              />
            </div>
            <Select value={filterTipo} onValueChange={setFilterTipo}>
              <SelectTrigger className="w-[180px] h-9">
                <Filter className="w-3.5 h-3.5 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                {TIPOS_DOCUMENTO.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterTipoModelo} onValueChange={setFilterTipoModelo}>
              <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="GLOBAL">Global</SelectItem>
                <SelectItem value="UNIDADE">Unidade</SelectItem>
                <SelectItem value="PROFISSIONAL">Pessoal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum modelo encontrado.</p>
              <p className="text-xs">Clique em "Novo Modelo" para criar.</p>
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map(m => {
                const tipoInfo = TIPO_MODELO_LABELS[m.tipo_modelo] || TIPO_MODELO_LABELS.UNIDADE;
                const TipoIcon = tipoInfo.icon;
                return (
                  <div
                    key={m.id}
                    className={`border rounded-lg p-4 transition-all flex flex-col gap-3 ${m.ativo ? 'bg-background hover:bg-muted/30 hover:shadow-sm' : 'bg-muted/40 opacity-70'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-sm truncate" title={m.nome}>{m.nome}</h4>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5">{m.tipo}</Badge>
                          <Badge variant="secondary" className={`text-[10px] gap-1 py-0 px-1.5 ${tipoInfo.color}`}>
                            <TipoIcon className="w-3 h-3" />
                            {tipoInfo.label}
                          </Badge>
                          {!m.ativo && <Badge variant="secondary" className="text-[10px] py-0 px-1.5">Inativo</Badge>}
                        </div>
                      </div>
                      {canEdit(m) && <Switch checked={m.ativo} onCheckedChange={v => handleToggle(m.id, v)} />}
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-3 flex-1">
                      {m.conteudo.replace(/<[^>]*>/g, '').slice(0, 160) || '— sem conteúdo —'}
                    </p>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t">
                      <span className="text-[10px] text-muted-foreground truncate" title={m.criado_por_nome}>
                        {m.criado_por_nome || '—'}
                      </span>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePreview(m)} title="Pré-visualizar">
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePrintPreview(m)} title="Imprimir A4">
                          <Printer className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDuplicate(m)} title="Duplicar">
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        {canEdit(m) && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(m)} title="Editar">
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(m.id)} title="Excluir">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

              {/* Rich Editor */}
              <div className="space-y-1.5">
                <Label className="text-[13px] font-bold">Conteúdo do documento</Label>
                <Suspense fallback={<div className="h-[200px] flex items-center justify-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin mr-2" />Carregando editor...</div>}>
                  <RichTextEditor
                    content={current.conteudo}
                    onChange={html => setCurrent(prev => prev ? { ...prev, conteudo: html } : prev)}
                    placeholder="Digite o conteúdo do documento ou insira variáveis..."
                  />
                </Suspense>
              </div>

              {/* Perfis */}
              <div className="space-y-1.5">
                <Label className="text-[13px] font-bold">Perfis que podem usar</Label>
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
                <Switch checked={current.ativo} onCheckedChange={v => setCurrent({ ...current, ativo: v })} />
                <Label className="text-sm">Modelo ativo</Label>
              </div>

              {/* Version History */}
              {current.versoes && current.versoes.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-bold">Histórico ({current.versoes.length})</Label>
                  <div className="space-y-2 max-h-[150px] overflow-y-auto">
                    {current.versoes.map((v, i) => (
                      <div key={i} className="flex items-center justify-between border rounded p-2 bg-muted/30 text-xs">
                        <div>
                          <span className="font-medium">V{current.versoes.length - i}</span>
                          <span className="text-muted-foreground ml-2">{new Date(v.salvo_em).toLocaleString('pt-BR')}</span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => {
                            if (confirm('Restaurar esta versão?')) {
                              const versoes = [...(current.versoes || [])];
                              versoes.unshift({ conteudo: current.conteudo, salvo_em: current.updated_at });
                              setCurrent({ ...current, conteudo: v.conteudo, versoes: versoes.slice(0, 5) });
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
            <div className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewHtml) }} />
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
