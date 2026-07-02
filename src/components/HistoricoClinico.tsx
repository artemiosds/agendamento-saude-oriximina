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
import PatientReferralHistory from "@/components/Pacientes/PatientReferralHistory";
import { buildInstitutionalCSS, docHeader, docMeta, docFooter, loadDocumentConfig } from "@/lib/printLayout";
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
            "id,data_atendimento,hora_atendimento,profissional_nome,profissional_id,queixa_principal,evolucao,conduta,indicacao_retorno,procedimentos_texto,outro_procedimento,unidade_id,episodio_id,anamnese,sinais_sintomas,exame_fisico,hipotese,prescricao,solicitacao_exames,observacoes",
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

  const buildProntuarioHTML = async (item: ProntuarioItem & { unidadeNome?: string }) => {
    const config = await loadDocumentConfig();
    const css = buildInstitutionalCSS(config);
    
    // Check if it's a discharge report
    const evol = String(item.evolucao || "");
    const obs = String((item as any).observacoes || "");
    const isReport = evol.includes("Relatório de Alta Multiprofissional") || 
                     evol.includes("Relatório de Alta Individual") ||
                     (item as any).tipo_registro === "alta_multiprofissional" ||
                     (item as any).tipo_registro === "alta_individual";

    let contentHtml = "";
    let docTitle = isReport ? "Relatório de Alta" : "Prontuário Clínico";

    if (isReport) {
      // 1. Identification (using patientData if available)
      const p = pacienteData || { nome: pacienteNome };
      const calcIdade = (dn: string) => {
        if (!dn) return "";
        try {
          const b = new Date(dn);
          const diff = Date.now() - b.getTime();
          return `${Math.floor(diff / 31557600000)} anos`;
        } catch { return ""; }
      };

      // 2. Try to parse JSON data from observations or evolution
      let data: any = null;
      if (obs.startsWith("{")) {
        try { data = JSON.parse(obs); } catch {}
      } else if (evol.startsWith("{")) {
        try { data = JSON.parse(evol); } catch {}
      }

      if (data) {
        // Build structured report from JSON
        const isMulti = (item as any).tipo_registro === "alta_multiprofissional" || evol.includes("Multiprofissional");
        docTitle = isMulti ? "Relatório de Alta Multiprofissional" : "Relatório de Alta Individual";

        contentHtml = `
          <div class="info-grid">
            <div class="info-item"><span class="info-label">Paciente</span><br/><span class="info-value">${p.nome}</span></div>
            <div class="info-item"><span class="info-label">Data Nasc.</span><br/><span class="info-value">${formatDateBR(p.data_nascimento)} ${p.data_nascimento ? `(${calcIdade(p.data_nascimento)})` : ""}</span></div>
            <div class="info-item"><span class="info-label">CNS</span><br/><span class="info-value">${p.cns || "—"}</span></div>
            <div class="info-item"><span class="info-label">CPF</span><br/><span class="info-value">${p.cpf || "—"}</span></div>
            <div class="info-item"><span class="info-label">Data de Alta</span><br/><span class="info-value">${formatDateBR(item.data_atendimento)}</span></div>
            <div class="info-item"><span class="info-label">Profissional</span><br/><span class="info-value">${item.profissional_nome || "—"}</span></div>
          </div>
        `;

        if (isMulti) {
          contentHtml += `
            <div class="section">
              <div class="section-title">Diagnóstico</div>
              <div class="field"><span class="field-label">CID-10</span><div class="field-value">${data.cid10 || "—"}</div></div>
              <div class="field"><span class="field-label">CIF — Funções</span><div class="field-value">${data.cifFuncoes || "—"}</div></div>
            </div>
          `;
          
          (data.profissionais || []).forEach((s: any) => {
            contentHtml += `
              <div class="section" style="page-break-inside: avoid; border: 1px solid #eee; padding: 10px; margin-top: 10px;">
                <div class="section-title">${s.profissao || "Profissional"} — ${s.profissional_nome}</div>
                <div class="field"><span class="field-label">Objetivos</span><div class="field-value">${s.objetivos || "—"}</div></div>
                <div class="field"><span class="field-label">Evolução</span><div class="field-value">${s.evolucao || "—"}</div></div>
                <div class="field"><span class="field-label">Metas</span><div class="field-value">${s.metas_status || "—"}</div></div>
              </div>
            `;
          });
        } else {
          contentHtml += `
            <div class="section">
              <div class="section-title">Diagnóstico</div>
              <div class="field"><span class="field-label">CID-10</span><div class="field-value">${data.diagCid || "—"}</div></div>
              <div class="field"><span class="field-label">CIF</span><div class="field-value">${data.cif || "—"}</div></div>
            </div>
            <div class="section">
              <div class="section-title">Evolução Clínica e Funcional</div>
              <div class="field"><span class="field-label">Objetivos</span><div class="field-value">${data.objetivos || "—"}</div></div>
              <div class="field"><span class="field-label">Intervenções</span><div class="field-value">${data.intervencoes || "—"}</div></div>
              <div class="field"><span class="field-label">Evolução</span><div class="field-value">${data.evolucao || "—"}</div></div>
            </div>
          `;
        }

        const motivoMap: any = {
          objetivos_atingidos: "Alta por objetivos atingidos",
          pedido_usuario: "A pedido do usuário/família",
          infrequencia: "Infrequência/abandono",
          encaminhamento: "Encaminhamento para outro serviço",
          agravamento: "Agravamento clínico",
          obito: "Óbito"
        };
        const mot = isMulti ? data.motivoAlta : data.motivo;

        contentHtml += `
          <div class="section">
            <div class="section-title">Finalização</div>
            <div class="field"><span class="field-label">Motivo da Alta</span><div class="field-value">${motivoMap[mot] || mot || "—"}</div></div>
            <div class="field"><span class="field-label">Orientações</span><div class="field-value">${data.orientacoes || data.orientacoesUsuario || "—"}</div></div>
          </div>
        `;
      } else {
        // Fallback if no JSON, just show evolution text cleaned up
        contentHtml = `<div class="section-content">${evol.replace(/Relatório de Alta (Individual|Multiprofissional) — .*\n\n/, "").replace(/\n/g, "<br/>")}</div>`;
      }
    } else {
      // Normal clinical record
      const row = (label: string, val?: string) =>
        val ? `<div class="section"><div class="section-title">${label}</div><div class="section-content">${String(val).replace(/\n/g, "<br/>")}</div></div>` : "";
      
      contentHtml = `
        ${row("Queixa principal", item.queixa_principal)}
        ${row("Evolução / SOAP", item.evolucao)}
        ${row("Conduta", item.conduta)}
        ${row("Procedimentos", item.procedimentos_texto)}
        ${row("Indicação de retorno", item.indicacao_retorno)}
      `;
    }

    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${docTitle}</title>${css}</head>
      <body class="doc-print-document">
        <div class="doc-page">
          ${docHeader(docTitle, config)}
          ${docMeta({
            Paciente: pacienteNome,
            Data: formatDateBR(item.data_atendimento),
            Profissional: item.profissional_nome || "—"
          })}
          <div class="doc-content">
            ${contentHtml}
            <div style="margin-top:60px;">
              <div style="width: 300px; border-top: 1px solid #000; margin: 0 auto; text-align: center; padding-top: 5px;">
                <strong>${item.profissional_nome || "—"}</strong><br/>
                <span style="font-size: 9pt;">Assinatura do Profissional</span>
              </div>
            </div>
          </div>
          ${docFooter(config)}
        </div>
      </body></html>`;
  };

  const handlePrint = async (item: ProntuarioItem & { unidadeNome?: string }) => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      toast.error("Permita pop-ups para imprimir");
      return;
    }
    const html = await buildProntuarioHTML(item);
    win.document.write(html);
    win.document.close();
    setTimeout(() => {
      win.focus();
      win.print();
    }, 400);
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
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Dados Cadastrais Completos</h3>
            </div>
            <Badge variant="outline" className="text-[10px] font-mono">
              Prontuário Nº {pacienteId?.slice(-6) || "—"}
            </Badge>
          </div>
          <CardContent className="p-4 space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 border-b border-border/40 pb-1.5">
                <User className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] font-bold text-primary uppercase tracking-tight">Identificação</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <DataField label="Nome Completo" value={pacienteData.nome} />
                <DataField label="Data de Nascimento" value={formatDateBR(pacienteData.data_nascimento)} />
                <DataField label="CPF" value={pacienteData.cpf} mono />
                <DataField label="Cartão SUS (CNS)" value={formatCNS(pacienteData.cns)} mono />
                <DataField label="Nome da Mãe" value={pacienteData.nome_mae} />
                <DataField label="Nome do Responsável" value={pacienteData.nome_responsavel || pacienteData.custom_data?.nome_responsavel} />
                <DataField label="CPF do Responsável" value={pacienteData.cpf_responsavel || pacienteData.custom_data?.cpf_responsavel} mono />
                <DataField label="Sexo / Gênero" value={pacienteData.custom_data?.sexo || pacienteData.custom_data?.genero || "—"} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-1.5 border-b border-border/40 pb-1.5">
                <MapPin className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] font-bold text-primary uppercase tracking-tight">Endereço</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="sm:col-span-2">
                  <DataField label="Logradouro / Endereço" value={pacienteData.endereco || pacienteData.custom_data?.logradouro} />
                </div>
                <DataField label="Número" value={pacienteData.custom_data?.numero} />
                <DataField label="Complemento" value={pacienteData.custom_data?.complemento} />
                <DataField label="Bairro" value={pacienteData.custom_data?.bairro} />
                <DataField label="Município" value={pacienteData.municipio || pacienteData.custom_data?.municipio} />
                <DataField label="UF" value={pacienteData.custom_data?.uf || pacienteData.naturalidade_uf} />
                <DataField label="CEP" value={pacienteData.custom_data?.cep} mono />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-1.5 border-b border-border/40 pb-1.5">
                <Phone className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] font-bold text-primary uppercase tracking-tight">Contato</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <DataField label="Telefone Principal" value={pacienteData.telefone} mono />
                <DataField label="Telefone Secundário" value={pacienteData.custom_data?.telefoneSecundario || pacienteData.custom_data?.telefone_secundario} mono />
                <div className="sm:col-span-2">
                  <DataField label="E-mail" value={pacienteData.email} />
                </div>
                <div className="sm:col-span-2">
                  <DataField label="Contato de Emergência" value={pacienteData.custom_data?.contato_emergencia_nome} />
                </div>
                <DataField label="Tel. Emergência" value={pacienteData.custom_data?.contato_emergencia_telefone} mono />
                <DataField label="Observação Contato" value={pacienteData.custom_data?.observacao_contato} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-1.5 border-b border-border/40 pb-1.5">
                <Activity className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] font-bold text-primary uppercase tracking-tight">Complementares e Clínicos</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <DataField label="Raça/Cor (IBGE)" value={pacienteData.custom_data?.racaCor || pacienteData.custom_data?.raca_cor} />
                <DataField label="Etnia" value={pacienteData.custom_data?.etnia || pacienteData.custom_data?.etniaOutra} />
                <DataField label="Nacionalidade" value={pacienteData.custom_data?.nacionalidade} />
                <DataField label="Naturalidade" value={pacienteData.naturalidade} />
                <DataField label="Religião" value={pacienteData.custom_data?.religiao} />
                <DataField label="Escolaridade" value={pacienteData.custom_data?.escolaridade} />
                <DataField label="Profissão / Ocupação" value={pacienteData.custom_data?.profissao} />
                <DataField label="Estado Civil" value={pacienteData.custom_data?.estado_civil} />
                <DataField label="Gestante" value={pacienteData.is_gestante ? "Sim" : "Não"} />
                <DataField label="PNE (Necessidades Especiais)" value={pacienteData.is_pne ? "Sim" : "Não"} />
                <DataField label="TEA (Autista)" value={pacienteData.is_autista ? "Sim" : "Não"} />
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
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handlePrint(item)} title="Imprimir / Baixar PDF">
                                  <Printer className="w-3.5 h-3.5 text-primary" />
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
                                    <p className="text-foreground leading-relaxed">{(item as any).queixa_principal}</p>
                                  </div>
                                )}
                                {(item as any).anamnese && (
                                  <div>
                                    <span className="font-bold uppercase text-[9px] text-muted-foreground block mb-0.5">Anamnese</span>
                                    <p className="text-foreground leading-relaxed whitespace-pre-wrap">{(item as any).anamnese}</p>
                                  </div>
                                )}
                                {(item as any).sinais_sintomas && (
                                  <div>
                                    <span className="font-bold uppercase text-[9px] text-muted-foreground block mb-0.5">Sinais e Sintomas</span>
                                    <p className="text-foreground leading-relaxed">{(item as any).sinais_sintomas}</p>
                                  </div>
                                )}
                                {(item as any).exame_fisico && (
                                  <div>
                                    <span className="font-bold uppercase text-[9px] text-muted-foreground block mb-0.5">Exame Físico</span>
                                    <p className="text-foreground leading-relaxed">{(item as any).exame_fisico}</p>
                                  </div>
                                )}
                                {(item as any).hipotese && (
                                  <div>
                                    <span className="font-bold uppercase text-[9px] text-muted-foreground block mb-0.5">Hipótese Diagnóstica</span>
                                    <p className="text-foreground leading-relaxed">{(item as any).hipotese}</p>
                                  </div>
                                )}
                                {item.evolucao && (
                                  <div>
                                    <span className="font-bold uppercase text-[9px] text-muted-foreground block mb-0.5">Evolução / SOAP</span>
                                    <div className="text-foreground leading-relaxed whitespace-pre-wrap">
                                      {item.evolucao.startsWith("{") ? (
                                        <div className="bg-muted p-2 rounded text-[10px] font-mono whitespace-pre overflow-x-auto">
                                          Relatório de Alta (Dados Estruturados)
                                        </div>
                                      ) : (
                                        item.evolucao
                                      )}
                                    </div>
                                  </div>
                                )}
                                {item.conduta && (
                                  <div>
                                    <span className="font-bold uppercase text-[9px] text-muted-foreground block mb-0.5">Conduta</span>
                                    <p className="text-foreground leading-relaxed">{item.conduta}</p>
                                  </div>
                                )}
                                {(item as any).prescricao && (
                                  <div>
                                    <span className="font-bold uppercase text-[9px] text-muted-foreground block mb-0.5">Prescrição</span>
                                    <p className="text-foreground leading-relaxed">{(item as any).prescricao}</p>
                                  </div>
                                )}
                                {(item as any).solicitacao_exames && (
                                  <div>
                                    <span className="font-bold uppercase text-[9px] text-muted-foreground block mb-0.5">Solicitação de Exames</span>
                                    <p className="text-foreground leading-relaxed">{(item as any).solicitacao_exames}</p>
                                  </div>
                                )}
                                {(item as any).observacoes && (
                                  <div>
                                    <span className="font-bold uppercase text-[9px] text-muted-foreground block mb-0.5">Observações</span>
                                    <p className="text-foreground leading-relaxed">{(item as any).observacoes}</p>
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
           <PatientReferralHistory patientId={pacienteId} patientData={pacienteData} />
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
                {(viewerItem as any).anamnese && <Section label="Anamnese" value={(viewerItem as any).anamnese} />}
                {(viewerItem as any).sinais_sintomas && <Section label="Sinais e Sintomas" value={(viewerItem as any).sinais_sintomas} />}
                {(viewerItem as any).exame_fisico && <Section label="Exame Físico" value={(viewerItem as any).exame_fisico} />}
                {(viewerItem as any).hipotese && <Section label="Hipótese Diagnóstica" value={(viewerItem as any).hipotese} />}
                {viewerItem.evolucao && <Section label="Evolução / SOAP" value={viewerItem.evolucao} />}
                {viewerItem.conduta && <Section label="Conduta" value={viewerItem.conduta} />}
                {(viewerItem as any).prescricao && <Section label="Prescrição" value={(viewerItem as any).prescricao} />}
                {(viewerItem as any).solicitacao_exames && <Section label="Solicitação de Exames" value={(viewerItem as any).solicitacao_exames} />}
                {viewerItem.procedimentos_texto && <Section label="Procedimentos" value={viewerItem.procedimentos_texto} />}
                {viewerItem.indicacao_retorno && <Section label="Retorno" value={viewerItem.indicacao_retorno} />}
                {(viewerItem as any).observacoes && <Section label="Observações" value={(viewerItem as any).observacoes} />}
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
