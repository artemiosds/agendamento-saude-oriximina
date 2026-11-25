import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import DocumentLibrary, {DocumentPatientBanner,classifyDocument,modelCode,type DocumentCategory,type LibraryItem} from '@/components/documents/DocumentLibrary';
import { FileText, FolderOpen, Plus, Printer, FileSignature, ContactRound, ClipboardList } from 'lucide-react';
import GerarDocumentoModal from '@/components/GerarDocumentoModal';
import { READY_TEMPLATES } from '@/lib/readyTemplates';
import EnviarAssinaturaAutentiqueModal from '@/components/EnviarAssinaturaAutentiqueModal';

type Categoria = DocumentCategory;

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

interface DocumentItem extends LibraryItem {
  builtin?: 'ficha_completa' | 'ficha_dados' | 'apac';
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paciente: PacienteLite | null;
  onOpenFichaCompleta: () => void;
  onOpenFichaSoDados: () => void;
  onOpenApac: () => void;
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
  const [loadError,setLoadError]=useState('');
  const [templates, setTemplates] = useState<Array<{ id: string; nome: string; tipo: string; blocos_clinicos?: unknown }>>([]);
  const [gerarTemplateId, setGerarTemplateId] = useState<string | undefined>(undefined);
  const [assinaturaOpen, setAssinaturaOpen] = useState(false);
  const [assinaturaCtx, setAssinaturaCtx] = useState<{ documentoGeradoId?: string; nomeSugerido?: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setBusca('');
    setCat('Todos');
    let active=true;
    setLoading(true);setLoadError('');setTemplates([]);
    (async () => {
      try {
        const { data,error } = await supabase.from('document_templates')
          .select('id, nome, tipo, blocos_clinicos').eq('ativo',true).order('nome');
        if(error)throw error;
        if(active)setTemplates(data||[]);
      }catch{if(active)setLoadError('Não foi possível carregar os modelos cadastrados. Os modelos internos continuam disponíveis.');}
      finally{if(active)setLoading(false);}
    })();
    return()=>{active=false;};
  }, [open]);

  const items: DocumentItem[] = useMemo(() => {
    const builtins: DocumentItem[] = [
      { id: 'b:ficha_completa', nome: 'Ficha Completa', categoria: 'Cadastro', descricao:'Informações cadastrais completas do paciente', builtin: 'ficha_completa', icon: <ContactRound className="w-5 h-5" /> },
      { id: 'b:ficha_dados', nome: 'Imprimir Só Dados', categoria: 'Cadastro', descricao:'Identificação cadastral simplificada', builtin: 'ficha_dados', icon: <Printer className="w-5 h-5" /> },
      { id: 'b:apac', nome: 'FORMULARIO_APAC_LAUDO', categoria: 'Regulação', descricao:'Laudo APAC padrão e dados complementares especializados', builtin: 'apac', icon: <ClipboardList className="w-5 h-5" /> },
    ];
    const fromDb: DocumentItem[] = templates.map(t => ({
      id: t.id,
      nome: t.nome || t.tipo,
      categoria: classifyDocument(t.tipo,t.nome),
      descricao:t.tipo,codigo:modelCode(t),canEdit:true,
    }));
    const existingNames = new Set(fromDb.map(t => t.nome.trim().toLowerCase()));
    const readyItems: DocumentItem[] = READY_TEMPLATES
      .filter(rt => !existingNames.has(rt.nome.trim().toLowerCase()))
      .map(rt => ({
        id: `ready:${rt.id}`,
        nome: rt.nome,
        categoria: 'Regulação',
        descricao:rt.tipo,codigo:modelCode(rt),canEdit:true,
      }));
    return [...builtins, ...fromDb, ...readyItems];
  }, [templates]);

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
    // Não registra no histórico só por abrir: o documento só entra no histórico
    // quando o profissional salvar rascunho, anexar ou assinar.
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
        <DialogContent className="w-[96vw] max-w-[1100px] max-h-[92dvh] p-0 gap-0 flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0 border-b px-4 sm:px-6 py-4 pr-12 text-left">
            <div className="flex items-center gap-3"><div className="shrink-0 rounded-xl bg-primary/10 text-primary p-2.5"><FolderOpen className="w-6 h-6"/></div><div><DialogTitle className="text-lg">Central de Documentos</DialogTitle><DialogDescription className="text-xs">Emissão e gestão documental do paciente</DialogDescription></div></div>
            <DocumentPatientBanner name={paciente?.nome}/>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4">
            {open&&<DocumentLibrary items={items} userId={user?.id} loading={loading} error={loadError} search={busca} onSearch={setBusca} category={cat} onCategory={setCat} disabled={!paciente}
              onGenerate={id=>{const item=items.find(i=>i.id===id);if(item)void handleGerar(item);}}
              onSign={id=>{const item=items.find(i=>i.id===id);if(item)void handleAssinar(item);}}
              onEdit={canManage?id=>{const item=items.find(i=>i.id===id);if(item&&!item.builtin)handleEditar(item);}:undefined}/>}
          </div>
          <footer className="shrink-0 border-t bg-background px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" className="gap-2" onClick={()=>{setAssinaturaCtx(null);setAssinaturaOpen(true);}} disabled={!paciente}><FileSignature className="w-4 h-4"/>Assinatura eletrônica avulsa</Button>
            {canManage&&<Button variant="ghost" className="gap-2" onClick={handleCriar}><Plus className="w-4 h-4"/>Criar novo tipo de documento</Button>}
          </footer>
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
