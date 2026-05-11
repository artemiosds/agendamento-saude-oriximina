import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, FileText, ChevronDown, ChevronUp, Activity, AlertTriangle, RefreshCw, Eye, FileSignature, History, MoreVertical, Printer, Download, Link2, FileDown, MapPin, Phone, Users, User, Mail, AlertCircle, CreditCard, Stethoscope, Send, Inbox, Paperclip } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import HistoricoCompletoModal from "@/components/HistoricoCompletoModal";
import GerarDocumentoModal from "@/components/GerarDocumentoModal";
import DocumentosHistorico from "@/components/DocumentosHistorico";
import PatientAttachmentManager from "@/components/PatientAttachmentManager";
import { buildInstitutionalCSS } from "@/lib/printLayout";
import { formatCNS } from "@/lib/cnsUtils";

interface ProntuarioItem {
  id: string;
  data_atendimento: string;
  hora_atendimento: string;
  profissional_nome: string;
  profissional_id: string;
  queixa_principal: string;
  evolucao: string;
  conduta: string;
  indicacao_retorno: string;
  procedimentos_texto: string;
  outro_procedimento: string;
  unidade_id: string;
  episodio_id: string | null;
}

interface EpisodioItem {
  id: string;
  titulo: string;
  tipo: string;
  status: string;
  data_inicio: string;
  data_fim: string | null;
  profissional_nome: string;
  descricao: string;
}

interface Props {
  pacienteId: string;
  pacienteNome: string;
  currentProfissionalId?: string;
  unidades: { id: string; nome: string }[];
}

// Helpers
function safeData<T>(result: { data: T | null; error: any }, context: string): T {
  if (result.error) {
    console.error(`[Historico] Erro em ${context}:`, result.error);
    return [] as unknown as T;
  }
  return result.data ?? ([] as unknown as T);
}

function formatDateBR(isoDate: string): string {
  if (!isoDate) return "—";
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("pt-BR");
}

export const HistoricoClinico: React.FC<Props> = ({ pacienteId, pacienteNome, currentProfissionalId, unidades }) => {
  const [prontuarios, setProntuarios] = useState<ProntuarioItem[]>([]);
  const [episodios, setEpisodios] = useState<EpisodioItem[]>([]);
  const [encaminhamentosEnviados, setEncaminhamentosEnviados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewerItem, setViewerItem] = useState<ProntuarioItem | null>(null);
  const [historicoOpen, setHistoricoOpen] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const cancelledRef = useRef(false);

  const [pacienteData, setPacienteData] = useState<any>(null);

  const loadData = useCallback(async () => {
    if (!pacienteId) {
      setProntuarios([]);
      setEpisodios([]);
      setLoading(false);
      return;
    }

    cancelledRef.current = false;
    setLoading(true);
    setError(null);

    try {
      const [
        { data: pData, error: pError }, 
        { data: eData, error: eError },
        { data: pacData, error: pacError },
        { data: encData, error: encError }
      ] = await Promise.all([
        supabase
          .from("prontuarios")
          .select(
            "id,data_atendimento,hora_atendimento,profissional_nome,profissional_id,queixa_principal,evolucao,conduta,indicacao_retorno,procedimentos_texto,outro_procedimento,unidade_id,episodio_id",
          )
          .eq("paciente_id", pacienteId)
          .order("data_atendimento", { ascending: false }),
        supabase
          .from("episodios_clinicos")
          .select("*")
          .eq("paciente_id", pacienteId)
          .order("data_inicio", { ascending: false }),
        supabase
          .from("pacientes")
          .select("*")
          .eq("id", pacienteId)
          .single(),
        supabase
          .from("documentos_gerados")
          .select("*")
          .eq("paciente_id", pacienteId)
          .ilike("tipo_documento", "%encaminhamento%")
          .order("created_at", { ascending: false })
      ]);

      if (cancelledRef.current) return;

      if (pError) throw pError;
      if (eError) throw eError;
      if (pacError) throw pacError;
      if (encError) throw encError;

      setProntuarios(pData || []);
      setEpisodios(eData || []);
      setPacienteData(pacData);
      setEncaminhamentosEnviados(encData || []);
    } catch (err) {
      console.error("[Historico] Erro inesperado:", err);
      if (!cancelledRef.current) {
        setError("Erro ao carregar histórico. Tente novamente.");
      }
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
      }
    }
  }, [pacienteId]);

  useEffect(() => {
    loadData();
    return () => {
      cancelledRef.current = true;
    };
  }, [loadData]);

  // Mapa de unidades (O(1) lookup)
  const unidadeMap = useMemo(() => new Map(unidades.map((u) => [u.id, u.nome])), [unidades]);

  const episodioMap = useMemo(() => new Map(episodios.map((e) => [e.id, e])), [episodios]);

  const timeline = useMemo(() => {
    return prontuarios.map((p) => ({
      ...p,
      unidadeNome: unidadeMap.get(p.unidade_id) || "",
      episodioTitulo: episodioMap.get(p.episodio_id || "")?.titulo || "",
    }));
  }, [prontuarios, unidadeMap, episodioMap]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Carregando histórico...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <AlertTriangle className="w-8 h-8 text-destructive/60" />
        <p className="text-sm text-destructive text-center">{error}</p>
        <Button variant="outline" size="sm" onClick={() => loadData()} className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  const activeEpisodios = episodios.filter((e) => e.status === "ativo");

  const buildProntuarioHTML = (item: ProntuarioItem & { unidadeNome?: string }) => {
    const css = buildInstitutionalCSS();
    const row = (label: string, val?: string) =>
      val ? `<div class="section"><h3>${label}</h3><p>${String(val).replace(/\n/g, "<br/>")}</p></div>` : "";
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Prontuário ${pacienteNome}</title>${css}</head>
      <body>
        <h1 style="margin:0 0 4px">Prontuário Clínico</h1>
        <div class="doc-meta">
          <strong>Paciente:</strong> ${pacienteNome} &nbsp;|&nbsp;
          <strong>Data:</strong> ${formatDateBR(item.data_atendimento)} ${item.hora_atendimento || ""} &nbsp;|&nbsp;
          <strong>Profissional:</strong> ${item.profissional_nome || "-"}
          ${item.unidadeNome ? `&nbsp;|&nbsp; <strong>Unidade:</strong> ${item.unidadeNome}` : ""}
        </div>
        ${row("Queixa principal", item.queixa_principal)}
        ${row("Evolução / SOAP", item.evolucao)}
        ${row("Conduta", item.conduta)}
        ${row("Procedimentos", item.procedimentos_texto)}
        ${row("Outro procedimento", item.outro_procedimento)}
        ${row("Indicação de retorno", item.indicacao_retorno)}
        <div style="margin-top:48px; border-top:1px solid #333; padding-top:8px; text-align:center;">
          ${item.profissional_nome || ""}
        </div>
      </body></html>`;
  };

  const handlePrint = (item: ProntuarioItem & { unidadeNome?: string }) => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      toast.error("Permita pop-ups para imprimir");
      return;
    }
    win.document.write(buildProntuarioHTML(item));
    win.document.close();
    setTimeout(() => {
      win.focus();
      win.print();
    }, 300);
  };

  const handleDownloadPDF = (item: ProntuarioItem & { unidadeNome?: string }) => {
    handlePrint(item);
    toast.info("Use 'Salvar como PDF' na janela de impressão");
  };

  const handleExportJSON = (item: ProntuarioItem) => {
    const blob = new Blob([JSON.stringify(item, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prontuario_${pacienteNome.replace(/\s+/g, "_")}_${item.data_atendimento}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("JSON exportado");
  };

  const handleCopyLink = async (item: ProntuarioItem) => {
    const url = `${window.location.origin}/painel/prontuario?pacienteId=${pacienteId}&prontuarioId=${item.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar o link");
    }
  };

  return (
    <div className="space-y-6">
      {/* Dados Cadastrais do Paciente */}
      {pacienteData && (
        <Card className="border-border/60 shadow-sm overflow-hidden bg-card">
          <div className="bg-muted/40 px-4 py-2.5 border-b border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Dados Cadastrais</h3>
            </div>
            <Badge variant="outline" className="text-[10px] font-mono">
              Prontuário Nº {pacienteData.id?.slice(-6) || "—"}
            </Badge>
          </div>
          <CardContent className="p-4 space-y-5">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 border-b border-border/40 pb-1 mb-2">
                <User className="w-3 h-3 text-primary" />
                <span className="text-[10px] font-bold text-primary uppercase">Identificação</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <DataField label="Nome" value={pacienteData.nome} />
                <DataField label="Data Nasc." value={formatDateBR(pacienteData.data_nascimento)} />
                <DataField label="CPF" value={pacienteData.cpf} mono />
                <DataField label="CNS" value={formatCNS(pacienteData.cns)} mono />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5 border-b border-border/40 pb-1 mb-2">
                <MapPin className="w-3 h-3 text-primary" />
                <span className="text-[10px] font-bold text-primary uppercase">Endereço</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="sm:col-span-2">
                  <DataField label="Logradouro" value={pacienteData.endereco} />
                </div>
                <DataField label="Bairro" value={pacienteData.custom_data?.bairro} />
                <DataField label="Município" value={pacienteData.municipio || pacienteData.custom_data?.municipio} />
                <DataField label="CEP" value={pacienteData.custom_data?.cep} mono />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5 border-b border-border/40 pb-1 mb-2">
                <Phone className="w-3 h-3 text-primary" />
                <span className="text-[10px] font-bold text-primary uppercase">Contato</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <DataField label="Tel. Principal" value={pacienteData.telefone} mono />
                <DataField label="Tel. Secundário" value={pacienteData.custom_data?.telefoneSecundario || pacienteData.custom_data?.telefone_secundario} mono />
                <div className="sm:col-span-2">
                  <DataField label="E-mail" value={pacienteData.email} />
                </div>
                <div className="sm:col-span-2">
                  <DataField label="Contato Emergência" value={pacienteData.custom_data?.contato_emergencia_nome} />
                </div>
                <DataField label="Tel. Emergência" value={pacienteData.custom_data?.contato_emergencia_telefone} mono />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5 border-b border-border/40 pb-1 mb-2">
                <Activity className="w-3 h-3 text-primary" />
                <span className="text-[10px] font-bold text-primary uppercase">Complementares</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="sm:col-span-2">
                  <DataField label="Nome da Mãe" value={pacienteData.nome_mae} />
                </div>
                <DataField label="Raça/Cor" value={pacienteData.custom_data?.racaCor || pacienteData.custom_data?.raca_cor} />
                <DataField label="Nacionalidade" value={pacienteData.custom_data?.nacionalidade} />
                <DataField label="Gestante" value={pacienteData.is_gestante ? "Sim" : "Não"} />
                <DataField label="PNE" value={pacienteData.is_pne ? "Sim" : "Não"} />
                <DataField label="Autista" value={pacienteData.is_autista ? "Sim" : "Não"} />
                <DataField label="CID-10 Principal" value={pacienteData.cid} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      <Tabs defaultValue="atendimentos" className="w-full">
        <TabsList className="grid grid-cols-4 w-full h-auto p-1 bg-muted/50 rounded-lg">
          <TabsTrigger value="atendimentos" className="gap-2 py-2">
            <History className="w-4 h-4" /> Atendimentos
          </TabsTrigger>
          <TabsTrigger value="encaminhamentos" className="gap-2 py-2">
            <Send className="w-4 h-4" /> Encaminhamentos
          </TabsTrigger>
          <TabsTrigger value="documentos" className="gap-2 py-2">
            <FileText className="w-4 h-4" /> Doc. Gerados
          </TabsTrigger>
          <TabsTrigger value="anexos" className="gap-2 py-2">
            <Paperclip className="w-4 h-4" /> Doc. Anexados
          </TabsTrigger>
        </TabsList>

        <TabsContent value="atendimentos" className="space-y-6 pt-4 animate-in fade-in duration-300">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Histórico Clínico
            </h3>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setHistoricoOpen(true)} className="h-8">
                <History className="w-3.5 h-3.5 mr-1" /> Histórico completo
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDocModalOpen(true)} className="h-8">
                <FileSignature className="w-3.5 h-3.5 mr-1" /> Gerar documento
              </Button>
            </div>
          </div>

          {activeEpisodios.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-primary" /> Tratamentos Ativos
              </h3>
              {activeEpisodios.map((ep) => {
                const sessoes = prontuarios.filter((p) => p.episodio_id === ep.id).length;
                return (
                  <Card key={ep.id} className="border-primary/20 bg-primary/5 shadow-none">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm text-foreground">{ep.titulo}</p>
                          <p className="text-xs text-muted-foreground">
                            {ep.profissional_nome} • Início: {formatDateBR(ep.data_inicio)}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs font-mono">
                          {sessoes} sessão(ões)
                        </Badge>
                      </div>
                      {ep.descricao && <p className="text-xs text-muted-foreground mt-1">{ep.descricao}</p>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-3.5 h-3.5" /> Linha do Tempo ({timeline.length} registro(s))
            </h3>
            {timeline.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 border rounded-lg bg-muted/10 border-dashed">
                <FileText className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum atendimento registrado.</p>
              </div>
            ) : (
              <ScrollArea className="max-h-[600px] pr-4">
                <div className="relative pl-6 space-y-3">
                  <div className="absolute left-2 top-2 bottom-2 w-px bg-border" aria-hidden="true" />
                  {timeline.map((item) => {
                    const isOwn = item.profissional_id === currentProfissionalId;
                    const expanded = expandedId === item.id;
                    return (
                      <div key={item.id} className="relative">
                        <div className="absolute -left-4 top-2 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                        <Card className="border shadow-sm hover:shadow-md transition-shadow">
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <time className="text-xs font-bold text-primary">
                                    {formatDateBR(item.data_atendimento)}
                                  </time>
                                  {item.hora_atendimento && (
                                    <span className="text-[10px] text-muted-foreground">{item.hora_atendimento}</span>
                                  )}
                                  {item.episodioTitulo && (
                                    <Badge variant="secondary" className="text-[9px] h-4 py-0">
                                      {item.episodioTitulo}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm font-semibold text-foreground">
                                  {item.profissional_nome}
                                  {isOwn && <span className="text-xs text-primary ml-1">(você)</span>}
                                </p>
                                {item.unidadeNome && <p className="text-[11px] text-muted-foreground">{item.unidadeNome}</p>}
                                
                                {item.procedimentos_texto && (
                                  <div className="flex items-center gap-1.5 mt-1.5">
                                    <Stethoscope className="w-3 h-3 text-primary/70" />
                                    <p className="text-[11px] text-muted-foreground font-medium">
                                      {item.procedimentos_texto}
                                    </p>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewerItem(item)} title="Visualizar">
                                  <Eye className="w-3.5 h-3.5 text-primary" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleDownloadPDF(item)} title="Baixar PDF">
                                  <FileDown className="w-3.5 h-3.5 text-primary" />
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                                      <MoreVertical className="w-3.5 h-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem onClick={() => handlePrint(item)}>
                                      <Printer className="w-3.5 h-3.5 mr-2" /> Imprimir
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleExportJSON(item)}>
                                      <Download className="w-3.5 h-3.5 mr-2" /> Exportar JSON
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleCopyLink(item)}>
                                      <Link2 className="w-3.5 h-3.5 mr-2" /> Copiar link
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => { setViewerItem(item); setTimeout(() => setDocModalOpen(true), 100); }}>
                                      <FileSignature className="w-3.5 h-3.5 mr-2" /> Gerar documento
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                {item.queixa_principal && (
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setExpandedId(expanded ? null : item.id)}>
                                    {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                  </Button>
                                )}
                              </div>
                            </div>
                            {expanded && (
                              <div className="mt-3 space-y-2 text-[11px] border-t pt-3 animate-in slide-in-from-top-1">
                                {item.queixa_principal && (
                                  <div>
                                    <span className="font-bold uppercase text-[9px] text-muted-foreground block mb-0.5">Queixa Principal</span>
                                    <p className="text-foreground leading-relaxed">{item.queixa_principal}</p>
                                  </div>
                                )}
                                {item.evolucao && (
                                  <div>
                                    <span className="font-bold uppercase text-[9px] text-muted-foreground block mb-0.5">Evolução / SOAP</span>
                                    <p className="text-foreground leading-relaxed whitespace-pre-wrap">{item.evolucao}</p>
                                  </div>
                                )}
                                {item.conduta && (
                                  <div>
                                    <span className="font-bold uppercase text-[9px] text-muted-foreground block mb-0.5">Conduta</span>
                                    <p className="text-foreground leading-relaxed">{item.conduta}</p>
                                  </div>
                                )}
                                {!isOwn && <p className="text-[10px] text-orange-600 italic mt-2">Prontuário de outro profissional (somente leitura)</p>}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
        </TabsContent>

        <TabsContent value="encaminhamentos" className="space-y-4 pt-4 animate-in fade-in duration-300">
           <div className="flex items-center gap-2 mb-2">
             <Send className="w-4 h-4 text-primary" />
             <h3 className="text-sm font-semibold">Histórico de Encaminhamentos</h3>
           </div>
           {encaminhamentosEnviados.length === 0 ? (
             <div className="text-center py-10 border border-dashed rounded-lg bg-muted/10">
               <Send className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
               <p className="text-sm text-muted-foreground">Nenhum encaminhamento encontrado.</p>
             </div>
           ) : (
             <div className="border rounded-lg overflow-hidden bg-card">
               <Table className="w-full text-xs">
                 <TableHeader className="bg-muted/50">
                   <TableRow>
                     <TableHead className="p-2 font-medium">Data</TableHead>
                     <TableHead className="p-2 font-medium">Profissional</TableHead>
                     <TableHead className="p-2 font-medium">Especialidade</TableHead>
                     <TableHead className="p-2 font-medium">Status</TableHead>
                     <TableHead className="p-2 font-medium text-right">Ações</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {encaminhamentosEnviados.map((enc: any) => (
                     <TableRow key={enc.id} className="hover:bg-muted/30">
                       <TableCell className="p-2 font-medium">{new Date(enc.created_at).toLocaleDateString('pt-BR')}</TableCell>
                       <TableCell className="p-2">{enc.profissional_nome}</TableCell>
                       <TableCell className="p-2 capitalize">{enc.campos_formulario?.especialidade_destino || enc.campos_formulario?.especialidade || '-'}</TableCell>
                       <TableCell className="p-2">
                         <Badge variant="outline" className="text-[9px] h-4 py-0 font-mono">
                           {enc.status}
                         </Badge>
                       </TableCell>
                       <TableCell className="p-2 text-right">
                         <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                            const body = enc.conteudo_html;
                            const win = window.open("", "_blank");
                            if (win) {
                              win.document.write(body);
                              win.document.close();
                            }
                         }}>
                           <Eye className="w-3.5 h-3.5" />
                         </Button>
                       </TableCell>
                     </TableRow>
                   ))}
                 </TableBody>
               </Table>
             </div>
           )}
        </TabsContent>

        <TabsContent value="documentos" className="space-y-4 pt-4 animate-in fade-in duration-300">
           <DocumentosHistorico pacienteId={pacienteId} pacienteNome={pacienteNome} />
        </TabsContent>

        <TabsContent value="anexos" className="space-y-4 pt-4 animate-in fade-in duration-300">
           <PatientAttachmentManager pacienteId={pacienteId} />
        </TabsContent>
      </Tabs>

      {/* View Modal */}
      <Sheet open={!!viewerItem} onOpenChange={(o) => !o && setViewerItem(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          {viewerItem && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Prontuário — {formatDateBR(viewerItem.data_atendimento)}
                </SheetTitle>
                <SheetDescription>
                  {viewerItem.profissional_nome} {viewerItem.profissional_id === currentProfissionalId && "(você)"}
                </SheetDescription>
              </SheetHeader>
              <Separator className="my-4" />
              <div className="space-y-4 text-sm">
                {viewerItem.queixa_principal && <Section label="Queixa principal" value={viewerItem.queixa_principal} />}
                {viewerItem.evolucao && <Section label="Evolução / SOAP" value={viewerItem.evolucao} />}
                {viewerItem.conduta && <Section label="Conduta" value={viewerItem.conduta} />}
                {viewerItem.procedimentos_texto && <Section label="Procedimentos" value={viewerItem.procedimentos_texto} />}
                {viewerItem.indicacao_retorno && <Section label="Retorno" value={viewerItem.indicacao_retorno} />}
              </div>
              <Separator className="my-4" />
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setViewerItem(null)}>Fechar</Button>
                <Button variant="outline" size="sm" onClick={() => handlePrint(viewerItem)}><Printer className="w-3.5 h-3.5 mr-1" /> Imprimir</Button>
                <Button size="sm" onClick={() => { setViewerItem(null); setDocModalOpen(true); }}><FileSignature className="w-3.5 h-3.5 mr-1" /> Gerar documento</Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <HistoricoCompletoModal
        open={historicoOpen}
        onOpenChange={setHistoricoOpen}
        pacienteId={pacienteId}
        pacienteNome={pacienteNome}
        unidades={unidades}
        currentProfissionalId={currentProfissionalId}
      />

      <GerarDocumentoModal
        open={docModalOpen}
        onOpenChange={setDocModalOpen}
        paciente={{ id: pacienteId, nome: pacienteNome, cpf: '', cns: '', data_nascimento: '', cid: '', especialidade_destino: '' }}
      />
    </div>
  );
};

const DataField = ({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) => {
  const display = value && String(value).trim() ? value : "—";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] text-muted-foreground uppercase font-semibold">{label}</span>
      <span className={`text-xs text-foreground leading-tight ${mono ? "font-mono" : "font-medium"}`}>
        {display}
      </span>
    </div>
  );
};

const Section: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
    <p className="text-foreground whitespace-pre-wrap leading-relaxed">{value}</p>
  </div>
);

export default HistoricoClinico;
