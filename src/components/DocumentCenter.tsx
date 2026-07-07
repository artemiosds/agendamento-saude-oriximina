import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DebouncedInput } from '@/components/ui/debounced-input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Search, Plus, Pencil, Play, Printer, FileSignature, Loader2 } from 'lucide-react';
import GerarDocumentoModal from '@/components/GerarDocumentoModal';
import EnviarAssinaturaAutentiqueModal from '@/components/EnviarAssinaturaAutentiqueModal';
import { printOciOrtopedia } from '@/lib/printOciOrtopedia';

type Categoria = 'Todos' | 'Cadastro' | 'Clínico' | 'Regulação' | 'CER';
const CATEGORIAS: Categoria[] = ['Todos', 'Cadastro', 'Clínico', 'Regulação', 'CER'];

interface PacienteLite {
  id: string;
  nome: string;
  cpf?: string | null;
  cns?: string | null;
  dataNascimento?: string | null;
  cid?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  bairro?: string | null;
  nomeMae?: string | null;
  nome_mae?: string | null;
  especialidadeDestino?: string | null;
  unidadeId?: string | null;
}

interface DocumentItem {
  id: string;
  nome: string;
  categoria: Categoria;
  builtin?: 'ficha_completa' | 'ficha_dados' | 'apac' | 'oci_ortopedia';
  icon: React.ReactNode;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paciente: PacienteLite | null;
  onOpenFichaCompleta: () => void;
  onOpenFichaSoDados: () => void;
  onOpenApac: () => void;
}

function classifyTipo(tipo: string): Categoria {
  const t = (tipo || '').toLowerCase();
  if (t.includes('apac') || t.includes('regula')) return 'Regulação';
  if (t.includes('cer') || t.includes('alta')) return 'CER';
  if (t.includes('cadastr') || t.includes('ficha')) return 'Cadastro';
  return 'Clínico';
}

const DocumentCenter: React.FC<Props> = ({
  open, onOpenChange, paciente,
  onOpenFichaCompleta, onOpenFichaSoDados, onOpenApac,
}) => {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const canManage = hasPermission(['master', 'coordenador']);

  const [busca, setBusca] = useState('');
  const [cat, setCat] = useState<Categoria>('Todos');
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<Array<{ id: string; nome: string; tipo: string }>>([]);
  const [gerarTemplateId, setGerarTemplateId] = useState<string | undefined>(undefined);
  const [assinaturaOpen, setAssinaturaOpen] = useState(false);
  const [assinaturaCtx, setAssinaturaCtx] = useState<{ documentoGeradoId?: string; nomeSugerido?: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setBusca('');
    setCat('Todos');
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('document_templates')
        .select('id, nome, tipo')
        .eq('ativo', true)
        .order('nome');
      setTemplates((data as any) || []);
      setLoading(false);
    })();
  }, [open]);

  const items: DocumentItem[] = useMemo(() => {
    const builtins: DocumentItem[] = [
      { id: 'b:ficha_completa', nome: 'Ficha Completa', categoria: 'Cadastro', builtin: 'ficha_completa', icon: <Printer className="w-4 h-4" /> },
      { id: 'b:ficha_dados', nome: 'Imprimir Só Dados', categoria: 'Cadastro', builtin: 'ficha_dados', icon: <Printer className="w-4 h-4" /> },
      { id: 'b:apac', nome: 'Laudo APAC', categoria: 'Regulação', builtin: 'apac', icon: <FileSignature className="w-4 h-4" /> },
    ];
    const fromDb: DocumentItem[] = templates.map(t => ({
      id: t.id,
      nome: t.nome || t.tipo,
      categoria: classifyTipo(t.tipo),
      icon: <FileText className="w-4 h-4" />,
    }));
    return [...builtins, ...fromDb];
  }, [templates]);

  const filtered = items.filter(i => {
    if (cat !== 'Todos' && i.categoria !== cat) return false;
    if (busca.trim() && !i.nome.toLowerCase().includes(busca.trim().toLowerCase())) return false;
    return true;
  });

  const logGeracao = async (item: DocumentItem): Promise<string | undefined> => {
    if (!paciente?.id) return undefined;
    try {
      const { data } = await supabase.from('documentos_gerados').insert({
        paciente_id: paciente.id,
        paciente_nome: paciente.nome,
        tipo_documento: item.nome,
        profissional_nome: user?.nome || '',
        status: 'gerado',
        conteudo_html: '',
        campos_formulario: {},
      } as any).select('id').single();
      return (data as any)?.id;
    } catch {
      return undefined;
    }
  };

  const handleAssinar = async (item: DocumentItem) => {
    if (!paciente) return;
    // Templates: abrir o gerador para preencher campos e gerar o PDF automaticamente
    if (!item.builtin) {
      setGerarTemplateId(item.id);
      return;
    }
    // Builtins (Ficha/APAC): mantém o fluxo de anexar PDF manualmente
    const id = await logGeracao(item);
    setAssinaturaCtx({ documentoGeradoId: id, nomeSugerido: `${item.nome} - ${paciente.nome}` });
    setAssinaturaOpen(true);
  };

  const handleGerar = async (item: DocumentItem) => {
    await logGeracao(item);
    if (item.builtin === 'ficha_completa') { onOpenChange(false); onOpenFichaCompleta(); return; }
    if (item.builtin === 'ficha_dados')    { onOpenChange(false); onOpenFichaSoDados(); return; }
    if (item.builtin === 'apac')           { onOpenChange(false); onOpenApac(); return; }
    setGerarTemplateId(item.id);
  };

  const handleEditar = (_item: DocumentItem) => {
    onOpenChange(false);
    navigate('/painel/configuracoes?tab=documentos');
  };

  const handleCriar = () => {
    onOpenChange(false);
    navigate('/painel/configuracoes?tab=documentos&novo=1');
  };

  const pacienteGerar = paciente ? {
    id: paciente.id,
    nome: paciente.nome,
    cpf: paciente.cpf || '',
    cns: paciente.cns || '',
    data_nascimento: paciente.dataNascimento || '',
    cid: paciente.cid || '',
    especialidade_destino: paciente.especialidadeDestino || '',
    endereco: paciente.endereco || '',
    bairro: paciente.bairro || '',
    telefone: paciente.telefone || '',
    nome_mae: paciente.nomeMae || paciente.nome_mae || '',
  } : undefined;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="p-0 gap-0 flex flex-col border-0 bg-background overflow-hidden"
          style={{ width: '95vw', maxWidth: '640px', maxHeight: '85vh', borderRadius: '20px' }}
        >
          <DialogHeader className="border-b border-border/70 p-4 space-y-3">
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Documentos — <span className="truncate">{paciente?.nome || ''}</span>
            </DialogTitle>
            <DialogDescription className="sr-only">Central de documentos do paciente</DialogDescription>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <DebouncedInput
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar documento..."
                className="pl-9 h-9"
                debounceMs={300}
              />
            </div>
            <Tabs value={cat} onValueChange={(v) => setCat(v as Categoria)}>
              <TabsList className="w-full grid grid-cols-5 h-8">
                {CATEGORIAS.map(c => (
                  <TabsTrigger key={c} value={c} className="text-xs px-1">{c}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-0">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum documento encontrado.</p>
            ) : (
              filtered.map(item => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-border/70 bg-card/50 p-2.5 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary shrink-0">
                    {item.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium break-words leading-snug" title={item.nome}>{item.nome}</div>
                    <Badge variant="outline" className="mt-0.5 text-[10px] px-1.5 py-0 h-4">{item.categoria}</Badge>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" variant="default" className="h-8 gap-1" onClick={() => handleGerar(item)}>
                      <Play className="w-3.5 h-3.5" /> Gerar
                    </Button>
                    <Button size="sm" variant="secondary" className="h-8 gap-1" onClick={() => handleAssinar(item)} disabled={!paciente}>
                      <FileSignature className="w-3.5 h-3.5" /> Assinar
                    </Button>
                    {canManage && !item.builtin && (
                      <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => handleEditar(item)}>
                        <Pencil className="w-3.5 h-3.5" /> Editar
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-border/70 p-3 space-y-2">
            <Button
              variant="secondary"
              className="w-full gap-1.5"
              onClick={() => { setAssinaturaCtx(null); setAssinaturaOpen(true); }}
              disabled={!paciente}
            >
              <FileSignature className="w-4 h-4" /> Enviar para assinatura eletrônica
            </Button>
            {canManage && (
              <Button variant="outline" className="w-full gap-1.5" onClick={handleCriar}>
                <Plus className="w-4 h-4" /> Criar novo tipo de documento
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {gerarTemplateId && pacienteGerar && (
        <GerarDocumentoModal
          open={!!gerarTemplateId}
          onOpenChange={(o) => { if (!o) setGerarTemplateId(undefined); }}
          paciente={pacienteGerar}
          templateId={gerarTemplateId}
        />
      )}

      {paciente && (
        <EnviarAssinaturaAutentiqueModal
          key={assinaturaCtx?.documentoGeradoId || 'avulso'}
          open={assinaturaOpen}
          onOpenChange={(o) => { setAssinaturaOpen(o); if (!o) setAssinaturaCtx(null); }}
          nomeDocumentoSugerido={assinaturaCtx?.nomeSugerido || `Documento - ${paciente.nome}`}
          documentoGeradoId={assinaturaCtx?.documentoGeradoId}
          pacienteNome={paciente.nome}
          pacienteTelefone={paciente.telefone || undefined}
          profissionalNome={user?.nome}
        />
      )}
    </>
  );
};

export default DocumentCenter;
